-- Forward-only security hardening discovered during staging-readiness audit.
-- Server-owned exam operations must not be reachable through the browser Data
-- API. Account history keeps only its narrow learner projection.

alter table if exists public.exam_attempts enable row level security;
drop policy if exists "attempts self read" on public.exam_attempts;
create policy "attempts self read" on public.exam_attempts
  for select to authenticated
  using ((student_id = (select auth.uid())) or (select public.is_admin()));

drop policy if exists "admin attempts" on public.exam_attempts;
create policy "admin attempts" on public.exam_attempts
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "active account exam attempts" on public.exam_attempts;
create policy "active account exam attempts" on public.exam_attempts
  as restrictive for all to authenticated
  using (
    (select public.is_admin())
    or (
      student_id = (select auth.uid())
      and (select public.is_account_active((select auth.uid())))
    )
  )
  with check (
    (select public.is_admin())
    or (
      student_id = (select auth.uid())
      and (select public.is_account_active((select auth.uid())))
    )
  );

revoke insert, update, delete on table public.exam_attempts from anon, authenticated;
grant select (id, student_id, exam_id, title, score, correct_answers, total_questions, submitted_at, status)
  on table public.exam_attempts to authenticated;

alter table if exists public.exam_access_slots enable row level security;
alter table if exists public.guest_exam_attempts enable row level security;
alter table if exists public.request_rate_limits enable row level security;
alter table if exists public.exam_admin_audit_logs enable row level security;
alter table if exists public.exam_attempt_adjustments enable row level security;
alter table if exists public.exam_attempt_grants enable row level security;
alter table if exists public.exam_scoring_versions enable row level security;
alter table if exists public.exam_question_overrides enable row level security;
alter table if exists public.exam_regrade_runs enable row level security;
alter table if exists public.exam_policy_presets enable row level security;
alter table if exists public.exam_templates enable row level security;
alter table if exists public.exam_slot_candidates enable row level security;

revoke all on table
  public.exam_access_slots,
  public.guest_exam_attempts,
  public.request_rate_limits,
  public.exam_attempt_adjustments,
  public.exam_attempt_grants,
  public.exam_scoring_versions,
  public.exam_question_overrides,
  public.exam_regrade_runs,
  public.exam_policy_presets,
  public.exam_templates,
  public.exam_slot_candidates
  from public, anon, authenticated;

grant select, insert, update, delete on table
  public.exam_access_slots,
  public.guest_exam_attempts,
  public.request_rate_limits,
  public.exam_attempt_adjustments,
  public.exam_attempt_grants,
  public.exam_scoring_versions,
  public.exam_question_overrides,
  public.exam_regrade_runs,
  public.exam_policy_presets,
  public.exam_templates,
  public.exam_slot_candidates
  to service_role;

revoke all on table public.exam_admin_audit_logs from public, anon, authenticated;
grant select, insert, update on table public.exam_admin_audit_logs to service_role;
grant usage, select on sequence public.exam_admin_audit_logs_id_seq to service_role;

revoke all on function public.consume_request_budget(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_request_budget(text, text, integer, integer, integer)
  to service_role;

revoke all on function public.consume_exam_attempt_grant(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.consume_exam_attempt_grant(uuid, uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
