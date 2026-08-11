-- Audit vocabulary for exam operations and result integrity.
-- Forward-only. Apply after 025_exam_attempt_integrity.sql.

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
    'override_exam_question'
  ));

notify pgrst, 'reload schema';
