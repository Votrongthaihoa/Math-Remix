-- Forward-only fix for legacy learner-read policy names.
--
-- Migration 034 removed the newer policy names used by the exam-engine rollout,
-- but this staging database retained the original "active account" policies.
-- Those policies exposed the full exam_sections/exam_questions rows to any
-- active authenticated account, including source_latex, latex_source and
-- solution_source. Student content is served through trusted server
-- projections; browser roles must not select raw authoring columns directly.
-- Keep the existing authenticated admin authoring policies and service-role
-- access unchanged.

alter table if exists public.exam_sections enable row level security;
alter table if exists public.exam_questions enable row level security;

drop policy if exists "active account exam sections" on public.exam_sections;
drop policy if exists "active account exam questions" on public.exam_questions;

-- Also remove the names used by the earlier hardening migration so this fix is
-- safe to replay against a database with either policy vocabulary.
drop policy if exists "exam sections student read" on public.exam_sections;
drop policy if exists "exam questions student read" on public.exam_questions;

notify pgrst, 'reload schema';
