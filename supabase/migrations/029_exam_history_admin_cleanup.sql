-- Keep destructive exam-history cleanup behind an authenticated server route.
-- Browser-facing learners must never receive DELETE on the attempts table;
-- the admin route uses the service role, performs an audit preflight, and
-- requires an explicit confirmation action.
revoke delete on table public.exam_attempts from anon, authenticated;

alter table if exists public.exam_admin_audit_logs
  drop constraint if exists exam_admin_audit_logs_action_check;
alter table if exists public.exam_admin_audit_logs
  add constraint exam_admin_audit_logs_action_check check (action in (
    'save_exam_access_config',
    'create_exam_access_slot',
    'update_exam_access_slot',
    'rotate_exam_access_slot',
    'release_exam_results',
    'export_exam_results',
    'extend_exam_attempt_time',
    'grant_exam_attempt_retry',
    'import_exam_slot_candidates',
    'create_exam_scoring_version',
    'preview_exam_regrade',
    'apply_exam_regrade',
    'override_exam_question',
    'delete_exam_history'
  ));

notify pgrst, 'reload schema';
