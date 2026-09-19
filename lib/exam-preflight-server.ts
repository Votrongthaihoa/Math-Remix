import type { SupabaseClient } from "@supabase/supabase-js";

export type ExamPreflightCheck = { code: string; level: "pass" | "warning" | "error"; message: string };
export type ExamPreflightResult = { status: "pass" | "warning" | "error"; checks: ExamPreflightCheck[]; canPublish: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasUniqueIdentifiers(rows: Record<string, unknown>[], field: string) {
  const identifiers = rows.map(row => row[field]);
  return identifiers.every(isIdentifier) && new Set(identifiers).size === identifiers.length;
}

/**
 * Shared correctness gate for publishing an exam or opening a guest slot.
 * It intentionally checks only server-visible authoring metadata; the learner
 * never receives answer keys from this helper.
 */
export async function runExamPreflight(admin: SupabaseClient, examId: string): Promise<ExamPreflightResult> {
  const sectionsResult = await admin.from("exam_sections").select("id,title,duration_minutes,sort_order").eq("exam_id", examId).order("sort_order");
  if (sectionsResult.error) throw sectionsResult.error;
  const sections = Array.isArray(sectionsResult.data) && sectionsResult.data.every(isRecord) ? sectionsResult.data : [];
  const validSections = Array.isArray(sectionsResult.data) && sectionsResult.data.every(isRecord) && hasUniqueIdentifiers(sections, "id");
  const sectionIds = validSections ? sections.map(section => section.id as string) : [];
  const questionsResult = sectionIds.length
    ? await admin.from("exam_questions").select("id,section_id,points,media_url").in("section_id", sectionIds)
    : { data: [], error: null };
  if (questionsResult.error) throw questionsResult.error;
  const questions = Array.isArray(questionsResult.data) && questionsResult.data.every(isRecord) ? questionsResult.data : [];
  const sectionIdSet = new Set(sectionIds);
  const validQuestions = Array.isArray(questionsResult.data)
    && questionsResult.data.every(isRecord)
    && hasUniqueIdentifiers(questions, "id")
    && questions.every(question => isIdentifier(question.section_id) && sectionIdSet.has(question.section_id));
  const questionIds = validQuestions ? questions.map(question => question.id as string) : [];
  const keysResult = questionIds.length
    ? await admin.from("exam_question_keys").select("question_id").in("question_id", questionIds)
    : { data: [], error: null };
  if (keysResult.error) throw keysResult.error;
  const keys = Array.isArray(keysResult.data) && keysResult.data.every(isRecord) ? keysResult.data : [];
  const validKeys = Array.isArray(keysResult.data) && keysResult.data.every(isRecord) && keys.every(key => isIdentifier(key.question_id));
  const keyIds = new Set(keys.map(key => key.question_id));
  const missingKeys = validQuestions ? questions.filter(question => !keyIds.has(question.id)).length : questions.length || 1;
  const validPoints = validQuestions && questions.every(question => typeof question.points === "number" && Number.isFinite(question.points) && question.points >= 0);
  const questionsReady = questions.length > 0 && validSections && validQuestions;
  const keysReady = (!questions.length || missingKeys === 0) && validKeys;
  const checks: ExamPreflightCheck[] = [
    { code: "questions", level: questionsReady ? "pass" : "error", message: questionsReady ? `${questions.length} câu hỏi đã sẵn sàng.` : questions.length ? "Quan hệ câu hỏi và phần thi không hợp lệ." : "Đề chưa có câu hỏi." },
    { code: "answer_keys", level: keysReady ? "pass" : "error", message: keysReady ? "Tất cả câu hỏi đã có đáp án." : validKeys ? `${missingKeys} câu chưa có đáp án.` : "Dữ liệu đáp án không hợp lệ." },
    { code: "points", level: validPoints || !questions.length ? "pass" : "error", message: validPoints || !questions.length ? "Điểm câu hỏi hợp lệ." : "Điểm câu hỏi không hợp lệ." },
    { code: "media", level: questions.some(question => question.media_url) || !questions.length ? "pass" : "warning", message: questions.some(question => question.media_url) ? "Media đã được khai báo ở các câu có hình." : "Đề không có media; kiểm tra lại nếu đề cần hình." },
    { code: "sections", level: sections.length && validSections ? "pass" : "error", message: sections.length && validSections ? `${sections.length} phần thi.` : sections.length ? "Dữ liệu phần thi không hợp lệ." : "Đề chưa có phần thi." },
  ];
  const errors = checks.filter(check => check.level === "error");
  return { status: errors.length ? "error" : checks.some(check => check.level === "warning") ? "warning" : "pass", checks, canPublish: errors.length === 0 };
}
