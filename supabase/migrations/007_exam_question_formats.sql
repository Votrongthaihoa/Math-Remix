-- Rich TSA question formats observed across Mathematics, Reading and Science.
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
  add column if not exists instruction text;

comment on column public.exam_questions.passage is
  'Shared reading passage or scientific data shown in a separately scrolling pane.';
comment on column public.exam_questions.media_url is
  'Optional public image used by the prompt or passage.';
comment on column public.exam_questions.instruction is
  'Short visible instruction such as choosing two answers or filling blanks.';
