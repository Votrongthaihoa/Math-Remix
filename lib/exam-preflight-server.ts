import type { SupabaseClient } from "@supabase/supabase-js";

export type ExamPreflightCheck = { code: string; level: "pass" | "warning" | "error"; message: string };
export type ExamPreflightResult = { status: "pass" | "warning" | "error"; checks: ExamPreflightCheck[]; canPublish: boolean };

/**
 * Shared correctness gate for publishing an exam or opening a guest slot.
 * It intentionally checks only server-visible authoring metadata; the learner
 * never receives answer keys from this helper.
 */
export async function runExamPreflight(admin: SupabaseClient, examId: string): Promise<ExamPreflightResult> {
  const sectionsResult = await admin.from("exam_sections").select("id,title,duration_minutes,sort_order").eq("exam_id", examId).order("sort_order");
  if (sectionsResult.error) throw sectionsResult.error;
  const sections = sectionsResult.data ?? [];
  const sectionIds = sections.map(section => section.id);
  const questionsResult = sectionIds.length
    ? await admin.from("exam_questions").select("id,section_id,points,media_url").in("section_id", sectionIds)
    : { data: [], error: null };
  if (questionsResult.error) throw questionsResult.error;
  const questions = questionsResult.data ?? [];
  const keysResult = questions.length
    ? await admin.from("exam_question_keys").select("question_id").in("question_id", questions.map(question => question.id))
    : { data: [], error: null };
  if (keysResult.error) throw keysResult.error;
  const keyIds = new Set((keysResult.data ?? []).map(key => key.question_id));
  const missingKeys = questions.filter(question => !keyIds.has(question.id)).length;
  const checks: ExamPreflightCheck[] = [
    { code: "questions", level: questions.length ? "pass" : "error", message: questions.length ? `${questions.length} câu hỏi đã sẵn sàng.` : "Đề chưa có câu hỏi." },
    { code: "answer_keys", level: missingKeys ? "error" : "pass", message: missingKeys ? `${missingKeys} câu chưa có đáp án.` : "Tất cả câu hỏi đã có đáp án." },
    { code: "points", level: questions.every(question => Number(question.points) >= 0) ? "pass" : "error", message: "Điểm câu hỏi hợp lệ." },
    { code: "media", level: questions.some(question => question.media_url) || !questions.length ? "pass" : "warning", message: questions.some(question => question.media_url) ? "Media đã được khai báo ở các câu có hình." : "Đề không có media; kiểm tra lại nếu đề cần hình." },
    { code: "sections", level: sections.length ? "pass" : "error", message: sections.length ? `${sections.length} phần thi.` : "Đề chưa có phần thi." },
  ];
  const errors = checks.filter(check => check.level === "error");
  return { status: errors.length ? "error" : checks.some(check => check.level === "warning") ? "warning" : "pass", checks, canPublish: errors.length === 0 };
}
