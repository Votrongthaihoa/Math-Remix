-- Independent-subject guest links (V-SAT/THPTQG) may target one subject.
-- A null section_id keeps links for composite exams such as TSA/HSA working.

alter table if exists public.exam_access_slots
  add column if not exists section_id uuid references public.exam_sections(id) on delete set null;

create index if not exists exam_access_slots_section_idx
  on public.exam_access_slots(section_id);

notify pgrst, 'reload schema';
