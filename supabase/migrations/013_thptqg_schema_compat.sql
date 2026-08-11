-- Compatibility migration for databases where 012 was not applied or was
-- applied before the THPTQG subject/attempt fields were added.
-- Safe to run more than once.

alter table if exists public.exam_sections
  add column if not exists subject_code text;

alter table if exists public.exam_attempts
  add column if not exists section_id uuid references public.exam_sections(id) on delete set null;

create index if not exists exam_sections_exam_subject_idx
  on public.exam_sections(exam_id, subject_code);

create index if not exists exam_attempts_exam_section_student_idx
  on public.exam_attempts(exam_id, section_id, student_id, started_at desc);

-- PostgREST needs a schema-cache refresh before the browser can insert/select
-- the newly added columns.
notify pgrst, 'reload schema';
