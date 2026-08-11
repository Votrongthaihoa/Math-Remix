-- Manual result release for authenticated attempts.
-- Guest attempts continue to use exam_access_slots.results_released_at so each
-- short-lived slot can be released independently.
alter table if exists public.exams
  add column if not exists results_released_at timestamptz;

create index if not exists exams_results_released_idx
  on public.exams(results_released_at)
  where results_released_at is not null;

notify pgrst, 'reload schema';
