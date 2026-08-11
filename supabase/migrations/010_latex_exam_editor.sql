-- Store the source of each question as one complete LaTeX `ex` environment.
-- The structured columns remain the learner-facing compatibility projection.
alter table public.exam_questions
  add column if not exists latex_source text not null default '',
  add column if not exists solution_source text not null default '';

comment on column public.exam_questions.latex_source is
  'Complete source for exactly one \\begin{ex} ... \\end{ex} question environment.';
comment on column public.exam_questions.solution_source is
  'Optional standalone solution source, normally the contents of \\loigiai{...}.';

-- Existing structured questions remain editable in the new workspace by being
-- projected into a source template on the first open. Do not rewrite existing
-- content here because the original prompt/options may contain author markup.

-- PostgREST caches the table definition. Refresh it immediately after the DDL
-- so the admin editor can use the new columns without waiting for an automatic
-- schema reload.
notify pgrst, 'reload schema';
