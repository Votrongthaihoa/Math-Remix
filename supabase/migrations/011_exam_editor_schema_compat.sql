-- Compatibility migration for projects that already ran the exam-room schema
-- but did not yet apply the rich question/editor migrations. Every statement is
-- idempotent so this can be run safely from the Supabase SQL editor.
alter table public.exam_questions
  drop constraint if exists exam_questions_question_type_check;

alter table public.exam_questions
  add constraint exam_questions_question_type_check
  check (question_type in (
    'single', 'multiple', 'text', 'inline', 'true_false', 'ordering', 'drag_drop'
  ));

alter table public.exam_questions
  add column if not exists passage text,
  add column if not exists media_url text,
  add column if not exists instruction text,
  add column if not exists latex_source text not null default '',
  add column if not exists solution_source text not null default '';

comment on column public.exam_questions.latex_source is
  'Complete source for exactly one \\begin{ex} ... \\end{ex} question environment.';
comment on column public.exam_questions.solution_source is
  'Optional standalone solution source, normally the contents of \\loigiai{...}.';

notify pgrst, 'reload schema';
