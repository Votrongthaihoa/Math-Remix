-- Forward-only hardening for legacy SECURITY DEFINER functions discovered by
-- the staging security advisor. Keep only the roles required by the server,
-- auth trigger, and RLS helper policies.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  )
$$;

create or replace function public.is_account_active(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.status = 'active'
      and (
        p.account_status = 'active'
        or (p.account_status = 'temporarily_banned' and p.banned_until is not null and p.banned_until <= now())
      )
  )
$$;

create or replace function public.next_student_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  value bigint;
begin
  update public.student_sequences
     set last_value = last_value + 1
   where singleton = true
   returning last_value into value;
  return 'REMIX' || lpad(value::text, 6, '0');
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

revoke all on function public.apply_account_violation(uuid, bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_account_violation(uuid, bigint, text, text)
  to service_role;

revoke all on function public.next_student_code()
  from public, anon, authenticated, service_role;
grant execute on function public.next_student_code()
  to service_role;

revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;
grant execute on function public.handle_new_user()
  to service_role;

revoke all on function public.is_account_active(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_account_active(uuid)
  to authenticated, service_role;

-- Anonymous execution remains intentional for this read-only helper because
-- historical public-role RLS policies call is_admin(). The function is
-- search_path-locked and only returns the admin predicate; it cannot mutate
-- data or expose profile rows.
revoke all on function public.is_admin()
  from public, anon, authenticated, service_role;
grant execute on function public.is_admin()
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
