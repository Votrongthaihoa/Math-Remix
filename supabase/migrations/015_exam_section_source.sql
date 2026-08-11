-- Preserve the exact LaTeX source entered in the section editor.
-- Structured question columns remain the learner-facing projection; this
-- column is the source of truth for reopening the authoring textarea.
alter table public.exam_sections
  add column if not exists source_latex text not null default '';

comment on column public.exam_sections.source_latex is
  'Exact source entered in the section LaTeX editor; placeholders such as {start} and {end} remain unresolved.';

notify pgrst, 'reload schema';
