-- Optional stable subject identity for THPTQG sections.
-- TSA keeps using its existing three sections; THPTQG can contain any subset
-- of the eight subject sections below.
alter table if exists public.exam_sections
  add column if not exists subject_code text;

create index if not exists exam_sections_exam_subject_idx
  on public.exam_sections(exam_id, subject_code);

-- A THPTQG subject is an independent sitting.  TSA attempts keep this
-- nullable and continue to span their ordered sections.
alter table if exists public.exam_attempts
  add column if not exists section_id uuid references public.exam_sections(id) on delete set null;

create index if not exists exam_attempts_exam_section_student_idx
  on public.exam_attempts(exam_id, section_id, student_id, started_at desc);
