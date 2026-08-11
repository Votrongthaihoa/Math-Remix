-- Reconcile a production baseline where the application tables exist but the
-- active-account restrictive policies and private account helper are absent.
--
-- Migration 039 cannot be replayed after migration 041 because its policy
-- expressions call the removed public.is_admin() helper. This forward-only
-- migration writes the intended final state directly with private helpers.

begin;

do $$
declare
  missing_relations text[];
  missing_columns text[];
  private_admin_function oid := pg_catalog.to_regprocedure('private.is_admin()');
begin
  select pg_catalog.array_agg(required_relation.relation_name order by required_relation.relation_name)
    into missing_relations
  from (
    values
      ('public.chapters'),
      ('public.course_enrollments'),
      ('public.courses'),
      ('public.exam_attempts'),
      ('public.exam_questions'),
      ('public.exam_room_enrollments'),
      ('public.exam_rooms'),
      ('public.exam_sections'),
      ('public.exams'),
      ('public.lesson_resources'),
      ('public.lessons'),
      ('public.profiles')
  ) as required_relation(relation_name)
  where pg_catalog.to_regclass(required_relation.relation_name) is null;

  if missing_relations is not null then
    raise exception '042 reconciliation is missing required relations: %',
      pg_catalog.array_to_string(missing_relations, ', ');
  end if;

  select pg_catalog.array_agg(required_column.qualified_name order by required_column.qualified_name)
    into missing_columns
  from (
    values
      ('public.exam_attempts.student_id'),
      ('public.profiles.account_status'),
      ('public.profiles.banned_until'),
      ('public.profiles.id'),
      ('public.profiles.role'),
      ('public.profiles.status')
  ) as required_column(qualified_name)
  where not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = pg_catalog.to_regclass(
            pg_catalog.split_part(required_column.qualified_name, '.', 1)
            || '.' ||
            pg_catalog.split_part(required_column.qualified_name, '.', 2)
          )
      and attribute.attname = pg_catalog.split_part(required_column.qualified_name, '.', 3)
      and attribute.attnum > 0
      and not attribute.attisdropped
  );

  if missing_columns is not null then
    raise exception '042 reconciliation is missing required columns: %',
      pg_catalog.array_to_string(missing_columns, ', ');
  end if;

  if pg_catalog.to_regprocedure('public.is_admin()') is not null then
    raise exception '042 reconciliation requires migration 041 final state: public.is_admin() still exists';
  end if;

  if private_admin_function is null then
    raise exception '042 reconciliation requires migration 041 final state: private.is_admin() is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_depend dependency
    join pg_catalog.pg_policy policy
      on dependency.classid = 'pg_catalog.pg_policy'::pg_catalog.regclass
     and dependency.objid = policy.oid
    join pg_catalog.pg_class relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where dependency.refclassid = 'pg_catalog.pg_proc'::pg_catalog.regclass
      and dependency.refobjid = private_admin_function
      and namespace.nspname = 'public'
  ) then
    raise exception '042 reconciliation requires migration 041 final state: no public policy depends on private.is_admin()';
  end if;
end
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;
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
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
  )
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;

create or replace function private.is_account_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.account_status = 'active'
        or (
          p.account_status = 'temporarily_banned'
          and p.banned_until is not null
          and p.banned_until <= now()
        )
      )
  )
$$;

revoke all on function private.is_account_active() from public, anon, authenticated;
grant execute on function private.is_account_active() to authenticated, service_role;

do $$
begin
  if pg_catalog.to_regprocedure('public.is_account_active(uuid)') is not null then
    execute 'revoke all on function public.is_account_active(uuid) from public, anon, authenticated';
    execute 'grant execute on function public.is_account_active(uuid) to service_role';
  end if;
end
$$;

alter table public.chapters enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.courses enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_room_enrollments enable row level security;
alter table public.exam_rooms enable row level security;
alter table public.exams enable row level security;
alter table public.lesson_resources enable row level security;
alter table public.lessons enable row level security;

-- These two legacy policies were removed by migration 035. Keep raw question
-- and authoring content behind the server-owned projection boundary.
drop policy if exists "active account exam sections" on public.exam_sections;
drop policy if exists "active account exam questions" on public.exam_questions;

drop policy if exists "active account chapters" on public.chapters;
create policy "active account chapters" on public.chapters
  as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));

drop policy if exists "active account course enrollments" on public.course_enrollments;
create policy "active account course enrollments" on public.course_enrollments
  as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));

drop policy if exists "active account courses" on public.courses;
create policy "active account courses" on public.courses
  as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));

drop policy if exists "active account exam attempts" on public.exam_attempts;
create policy "active account exam attempts" on public.exam_attempts
  as restrictive for all to authenticated
  using (
    (select private.is_admin())
    or (
      student_id = (select auth.uid())
      and (select private.is_account_active())
    )
  )
  with check (
    (select private.is_admin())
    or (
      student_id = (select auth.uid())
      and (select private.is_account_active())
    )
  );

drop policy if exists "active account exam enrollments" on public.exam_room_enrollments;
create policy "active account exam enrollments" on public.exam_room_enrollments
  as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));

drop policy if exists "active account exam rooms" on public.exam_rooms;
create policy "active account exam rooms" on public.exam_rooms
  as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));

drop policy if exists "active account exams" on public.exams;
create policy "active account exams" on public.exams
  as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));

drop policy if exists "active account resources" on public.lesson_resources;
create policy "active account resources" on public.lesson_resources
  as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));

drop policy if exists "active account lessons" on public.lessons;
create policy "active account lessons" on public.lessons
  as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));

do $$
declare
  reconciled_policy_count integer;
begin
  select count(*)
    into reconciled_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and policyname like 'active account %';

  if reconciled_policy_count <> 9 then
    raise exception '042 reconciliation expected 9 active-account policies, found %',
      reconciled_policy_count;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and policyname like 'active account %'
      and (
        permissive <> 'RESTRICTIVE'
        or roles <> array['authenticated']::name[]
        or pg_catalog.strpos(
          coalesce(qual, '') || ' ' || coalesce(with_check, ''),
          'private.is_admin()'
        ) = 0
        or pg_catalog.strpos(
          coalesce(qual, '') || ' ' || coalesce(with_check, ''),
          'private.is_account_active()'
        ) = 0
      )
  ) then
    raise exception '042 reconciliation produced an unexpected active-account policy definition';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and pg_catalog.strpos(
        coalesce(qual, '') || ' ' || coalesce(with_check, ''),
        'public.is_admin()'
      ) > 0
  ) then
    raise exception '042 reconciliation found a policy still referencing public.is_admin()';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
