-- Forward-only hardening for the account-status RLS helper.
-- The public UUID-parameter overload allowed an authenticated caller to probe
-- another user's account status through the Data API. RLS only needs the
-- status of auth.uid(), so keep the overload server-only and use a private,
-- no-argument helper in restrictive policies.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

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
    where p.id = auth.uid()
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

revoke execute on function public.is_account_active(uuid) from public, anon, authenticated;
grant execute on function public.is_account_active(uuid) to service_role;

alter policy "active account chapters" on public.chapters
  using (public.is_admin() or private.is_account_active());

alter policy "active account course enrollments" on public.course_enrollments
  using (public.is_admin() or private.is_account_active());

alter policy "active account courses" on public.courses
  using (public.is_admin() or private.is_account_active());

alter policy "active account exam attempts" on public.exam_attempts
  using (
    (select public.is_admin())
    or (
      student_id = (select auth.uid())
      and (select private.is_account_active())
    )
  )
  with check (
    (select public.is_admin())
    or (
      student_id = (select auth.uid())
      and (select private.is_account_active())
    )
  );

alter policy "active account exam enrollments" on public.exam_room_enrollments
  using (public.is_admin() or private.is_account_active());

alter policy "active account exam rooms" on public.exam_rooms
  using (public.is_admin() or private.is_account_active());

alter policy "active account exams" on public.exams
  using (public.is_admin() or private.is_account_active());

alter policy "active account resources" on public.lesson_resources
  using (public.is_admin() or private.is_account_active());

alter policy "active account lessons" on public.lessons
  using (public.is_admin() or private.is_account_active());
