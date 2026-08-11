-- Forward-only reconciliation for legacy projects where migration 014 was
-- never tracked/applied even though the application already selects this
-- column. Preserve non-empty custom dashboard titles.

alter table public.exams
  add column if not exists dashboard_title text;

update public.exams
set dashboard_title = 'KỲ THI TỐT NGHIỆP THPT 2027'
where dashboard_title is null
   or btrim(dashboard_title) = '';

alter table public.exams
  alter column dashboard_title set default 'KỲ THI TỐT NGHIỆP THPT 2027',
  alter column dashboard_title set not null;

comment on column public.exams.dashboard_title is
  'Optional learner-facing dashboard title; reconciled from the historical THPTQG dashboard migration.';

notify pgrst, 'reload schema';
