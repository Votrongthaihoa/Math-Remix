-- Publish is a server-authoritative exam state transition.
-- Keep the audit vocabulary forward-only so the publish endpoint can fail
-- closed when its preflight/audit gate is unavailable.

alter table if exists public.exam_admin_audit_logs
  drop constraint if exists exam_admin_audit_logs_action_check;

alter table if exists public.exam_admin_audit_logs
  add constraint exam_admin_audit_logs_action_check check (action in (
    'save_exam_access_config',
    'publish_exam',
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
