-- Prevent authenticated users from promoting or unlocking their own profile.
-- Profile name remains editable; role/status changes must go through a trusted server API.
alter table public.profiles enable row level security;

revoke update on table public.profiles from anon;
revoke update on table public.profiles from authenticated;
grant update (full_name) on table public.profiles to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  )
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

notify pgrst, 'reload schema';
