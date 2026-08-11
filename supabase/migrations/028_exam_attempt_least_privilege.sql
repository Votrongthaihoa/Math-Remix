-- Do not expose answer snapshots, raw answers, policy snapshots, session
-- hashes, or monitoring payloads through the browser-facing Data API.
-- Learner history only needs this narrow projection. Server routes use the
-- service role and continue to read/write the full attempt rows.
revoke all on table public.exam_attempts from anon, authenticated;
grant select (
  id,
  student_id,
  exam_id,
  title,
  score,
  correct_answers,
  total_questions,
  submitted_at,
  status
) on table public.exam_attempts to authenticated;
grant delete on table public.exam_attempts to authenticated;

revoke all on table public.guest_exam_attempts from anon, authenticated;

notify pgrst, 'reload schema';
