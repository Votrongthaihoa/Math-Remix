-- Prevent an older debounced autosave request from overwriting a newer answer
-- snapshot when network latency reorders requests.
alter table if exists public.guest_exam_attempts
  add column if not exists progress_version integer not null default 0;

notify pgrst, 'reload schema';
