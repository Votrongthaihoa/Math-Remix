-- Move the read-only admin predicate out of the Data API's exposed schema.
-- Policies are altered in place so their command, roles, and
-- permissive/restrictive mode remain unchanged.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  )
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;

-- Keeping public out of the search path makes pg_get_expr emit the qualified
-- public.is_admin() name, so the expression rewrite cannot hit another helper.
set local search_path = '';

do $$
declare
  admin_function oid := to_regprocedure('public.is_admin()');
  private_function oid := to_regprocedure('private.is_admin()');
  policy_record record;
  using_expression text;
  check_expression text;
  private_policy_count integer := 0;
  alter_statement text;
begin
  if private_function is null then
    raise exception 'private.is_admin() was not created';
  end if;

  if admin_function is not null and exists (
    select 1
    from pg_catalog.pg_depend dependency
    where dependency.refclassid = 'pg_catalog.pg_proc'::regclass
      and dependency.refobjid = admin_function
      and dependency.classid <> 'pg_catalog.pg_policy'::regclass
  ) then
    raise exception 'unexpected non-policy dependency on public.is_admin()';
  end if;

  if admin_function is not null then
    for policy_record in
      select distinct
        policy.oid,
        policy.polname,
        policy.polrelid,
        policy.polqual,
        policy.polwithcheck,
        namespace.nspname,
        relation.relname
      from pg_catalog.pg_policy policy
      join pg_catalog.pg_class relation on relation.oid = policy.polrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      join pg_catalog.pg_depend dependency
        on dependency.classid = 'pg_catalog.pg_policy'::regclass
       and dependency.objid = policy.oid
       and dependency.refclassid = 'pg_catalog.pg_proc'::regclass
       and dependency.refobjid = admin_function
      where namespace.nspname = 'public'
      order by namespace.nspname, relation.relname, policy.polname
    loop
      using_expression := case
        when policy_record.polqual is null then null
        else pg_catalog.pg_get_expr(policy_record.polqual, policy_record.polrelid, false)
      end;
      check_expression := case
        when policy_record.polwithcheck is null then null
        else pg_catalog.pg_get_expr(policy_record.polwithcheck, policy_record.polrelid, false)
      end;

      if using_expression is not null then
        using_expression := pg_catalog.regexp_replace(
          using_expression,
          '\([[:space:]]*SELECT[[:space:]]+public\.is_admin\(\)[[:space:]]+AS[[:space:]]+is_admin[[:space:]]*\)',
          '(SELECT private.is_admin())',
          'gi'
        );
        using_expression := pg_catalog.replace(
          using_expression,
          'public.is_admin()',
          '(SELECT private.is_admin())'
        );
      end if;
      if check_expression is not null then
        check_expression := pg_catalog.regexp_replace(
          check_expression,
          '\([[:space:]]*SELECT[[:space:]]+public\.is_admin\(\)[[:space:]]+AS[[:space:]]+is_admin[[:space:]]*\)',
          '(SELECT private.is_admin())',
          'gi'
        );
        check_expression := pg_catalog.replace(
          check_expression,
          'public.is_admin()',
          '(SELECT private.is_admin())'
        );
      end if;

      if coalesce(using_expression, '') like '%public.is_admin()%'
         or coalesce(check_expression, '') like '%public.is_admin()%' then
        raise exception 'failed to rewrite policy %.%: %',
          policy_record.nspname, policy_record.relname, policy_record.polname;
      end if;

      alter_statement := pg_catalog.format(
        'alter policy %I on %I.%I',
        policy_record.polname,
        policy_record.nspname,
        policy_record.relname
      );
      if using_expression is not null then
        alter_statement := alter_statement || pg_catalog.format(' using (%s)', using_expression);
      end if;
      if check_expression is not null then
        alter_statement := alter_statement || pg_catalog.format(' with check (%s)', check_expression);
      end if;

      execute alter_statement;
    end loop;
  end if;

  if admin_function is not null and exists (
    select 1
    from pg_catalog.pg_depend dependency
    where dependency.refclassid = 'pg_catalog.pg_proc'::regclass
      and dependency.refobjid = admin_function
  ) then
    raise exception 'dependency remains on public.is_admin() after policy rewrite';
  end if;

  select count(distinct policy.oid)
  into private_policy_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class relation on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  join pg_catalog.pg_depend dependency
    on dependency.classid = 'pg_catalog.pg_policy'::regclass
   and dependency.objid = policy.oid
   and dependency.refclassid = 'pg_catalog.pg_proc'::regclass
   and dependency.refobjid = private_function
  where namespace.nspname = 'public';

  if private_policy_count = 0 then
    raise exception 'no policies depend on private.is_admin(); database is missing the expected admin-policy baseline';
  end if;
end
$$;

drop function if exists public.is_admin();

notify pgrst, 'reload schema';

commit;
