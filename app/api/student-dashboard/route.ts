import { ensureActiveAccount } from "../../../lib/security-server";
import { summarizeDashboardAttempts } from "../../../lib/student-dashboard";

const noStore = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  const result = await security.admin
    .from("exam_attempts")
    .select("id,exam_id,title,score,correct_answers,total_questions,submitted_at,status,mode,started_at,duration_seconds")
    .eq("student_id", security.user.id)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (result.error) return Response.json({ error: "Không thể tải dữ liệu tổng quan." }, { status: 503, headers: noStore });
  const attempts = (result.data ?? []).map(row => ({
    id: String(row.id),
    title: row.title,
    score: Number(row.score ?? 0),
    correct_answers: Number(row.correct_answers ?? 0),
    total_questions: Number(row.total_questions ?? 0),
    submitted_at: row.submitted_at,
    status: row.status,
    exam_id: row.exam_id,
    mode: row.mode,
    started_at: row.started_at,
    duration_seconds: row.duration_seconds,
  }));
  const inProgress = attempts.filter(attempt => attempt.status === "in_progress").map(attempt => ({
    id: attempt.id,
    title: attempt.title,
    status: attempt.status,
    started_at: attempt.started_at,
    duration_seconds: attempt.duration_seconds,
    progress: attempt.total_questions > 0 ? Math.round((attempt.correct_answers / attempt.total_questions) * 100) : 0,
  }));
  return Response.json({ attempts, inProgress, summary: summarizeDashboardAttempts(attempts) }, { headers: noStore });
}
