-- Persist the effective ExamPolicy at attempt creation time. The snapshot is
-- intentionally separate from mutable exam settings so later edits cannot
-- change the rules used to run or grade an existing attempt.
alter table if exists public.exam_attempts
  add column if not exists policy_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists policy_version integer not null default 1;

alter table if exists public.guest_exam_attempts
  add column if not exists policy_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists policy_version integer not null default 1;

alter table if exists public.exam_attempts
  drop constraint if exists exam_attempts_policy_snapshot_object_check,
  drop constraint if exists exam_attempts_policy_version_check;
alter table if exists public.exam_attempts
  add constraint exam_attempts_policy_snapshot_object_check check (jsonb_typeof(policy_snapshot) = 'object'),
  add constraint exam_attempts_policy_version_check check (policy_version between 1 and 1000000);

alter table if exists public.guest_exam_attempts
  drop constraint if exists guest_exam_attempts_policy_snapshot_object_check,
  drop constraint if exists guest_exam_attempts_policy_version_check;
alter table if exists public.guest_exam_attempts
  add constraint guest_exam_attempts_policy_snapshot_object_check check (jsonb_typeof(policy_snapshot) = 'object'),
  add constraint guest_exam_attempts_policy_version_check check (policy_version between 1 and 1000000);

notify pgrst, 'reload schema';
