-- Attempt integrity and concurrency guards.
-- Forward-only. Apply after 024_exam_engine_operations.sql.

alter table if exists public.exam_attempts
  add column if not exists monitor_events jsonb not null default '[]'::jsonb;

alter table if exists public.exam_attempts
  drop constraint if exists exam_attempts_monitor_events_array_check;
alter table if exists public.exam_attempts
  add constraint exam_attempts_monitor_events_array_check
  check (jsonb_typeof(monitor_events) = 'array');

create unique index if not exists exam_attempts_active_scope_idx
  on public.exam_attempts(
    student_id,
    exam_id,
    coalesce(section_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'in_progress' and exam_id is not null;

create unique index if not exists guest_exam_attempts_active_session_idx
  on public.guest_exam_attempts(slot_id, session_hash)
  where status = 'in_progress';

create index if not exists exam_attempts_monitor_idx
  on public.exam_attempts(exam_id, status, started_at desc);

notify pgrst, 'reload schema';
