-- Forward-only content protection fix discovered by the staging RLS matrix.
-- Student clients receive exam content through trusted server projections and
-- must not read raw LaTeX, solution source, or answer keys from the Data API.
-- Authenticated admin authoring remains available through the existing admin
-- RLS policies; service-role server routes retain full access.

alter table if exists public.exam_sections enable row level security;
alter table if exists public.exam_questions enable row level security;
alter table if exists public.exam_question_keys enable row level security;

drop policy if exists "exam sections student read" on public.exam_sections;
drop policy if exists "exam questions student read" on public.exam_questions;
drop policy if exists "exam question keys student read" on public.exam_question_keys;

revoke all on table
  public.exam_sections,
  public.exam_questions,
  public.exam_question_keys
  from public, anon;

grant select, insert, update, delete on table
  public.exam_sections,
  public.exam_questions,
  public.exam_question_keys
  to authenticated;

grant select, insert, update, delete on table
  public.exam_sections,
  public.exam_questions,
  public.exam_question_keys
  to service_role;

notify pgrst, 'reload schema';
