-- Freeze the answer key used for a new attempt. Historical attempts must not
-- be silently re-scored when an author edits the current key. Regrade creates
-- an explicit scoring version instead.
alter table if exists public.exam_attempts
  add column if not exists answer_key_snapshot jsonb not null default '{}'::jsonb;

alter table if exists public.guest_exam_attempts
  add column if not exists answer_key_snapshot jsonb not null default '{}'::jsonb;

alter table if exists public.exam_attempts
  drop constraint if exists exam_attempts_answer_key_snapshot_object_check;
alter table if exists public.exam_attempts
  add constraint exam_attempts_answer_key_snapshot_object_check
  check (jsonb_typeof(answer_key_snapshot) = 'object');

alter table if exists public.guest_exam_attempts
  drop constraint if exists guest_exam_attempts_answer_key_snapshot_object_check;
alter table if exists public.guest_exam_attempts
  add constraint guest_exam_attempts_answer_key_snapshot_object_check
  check (jsonb_typeof(answer_key_snapshot) = 'object');

notify pgrst, 'reload schema';
