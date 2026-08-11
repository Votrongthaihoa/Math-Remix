-- Versioned structure metadata for HSA/V-SAT without coupling it to the
-- guest-access settings stored in exams.settings.
alter table if exists public.exams
  add column if not exists structure_config jsonb not null default '{}'::jsonb;

comment on column public.exams.structure_config is
  'Versioned exam structure profile. HSA-2026 is the official baseline; future profiles are editable proposals/custom configurations.';

notify pgrst, 'reload schema';
