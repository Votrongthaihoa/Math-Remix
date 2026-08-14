-- Restore the browser-admin authoring policies omitted by the 043 bootstrap.
--
-- Learners continue to receive exam content through trusted server projections;
-- these permissive policies are limited to authenticated users for whom the
-- private admin helper returns true. The existing restrictive active-account
-- policies remain in place and continue to apply to SELECT operations.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('private.is_admin()') is null then
    raise exception 'private.is_admin() is required before restoring exam admin policies';
  end if;
end
$$;

alter table public.exam_rooms enable row level security;
alter table public.exams enable row level security;
alter table public.exam_room_enrollments enable row level security;
alter table public.exam_sections enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_question_keys enable row level security;

drop policy if exists "admin exam rooms" on public.exam_rooms;
create policy "admin exam rooms" on public.exam_rooms
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "admin exams" on public.exams;
create policy "admin exams" on public.exams
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "admin exam room enrollments" on public.exam_room_enrollments;
create policy "admin exam room enrollments" on public.exam_room_enrollments
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "admin exam sections" on public.exam_sections;
create policy "admin exam sections" on public.exam_sections
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "admin exam questions" on public.exam_questions;
create policy "admin exam questions" on public.exam_questions
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "admin exam question keys" on public.exam_question_keys;
create policy "admin exam question keys" on public.exam_question_keys
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

do $$
declare
  policy_target record;
begin
  for policy_target in
    select *
    from (values
      ('exam_rooms', 'admin exam rooms'),
      ('exams', 'admin exams'),
      ('exam_room_enrollments', 'admin exam room enrollments'),
      ('exam_sections', 'admin exam sections'),
      ('exam_questions', 'admin exam questions'),
      ('exam_question_keys', 'admin exam question keys')
    ) as targets(table_name, policy_name)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = policy_target.table_name
        and policy.policyname = policy_target.policy_name
        and policy.cmd = 'ALL'
        and 'authenticated' = any(policy.roles)
        and pg_catalog.strpos(coalesce(policy.qual, ''), 'private.is_admin') > 0
        and pg_catalog.strpos(coalesce(policy.with_check, ''), 'private.is_admin') > 0
    ) then
      raise exception 'exam admin policy repair failed for public.%', policy_target.table_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any (array[
        'exam_rooms',
        'exams',
        'exam_room_enrollments',
        'exam_sections',
        'exam_questions',
        'exam_question_keys'
      ])
      and not relation.relrowsecurity
  ) then
    raise exception 'exam admin policy repair left RLS disabled';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
