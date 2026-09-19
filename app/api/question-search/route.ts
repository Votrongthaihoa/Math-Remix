import type { SupabaseClient } from "@supabase/supabase-js";
import { questionSimilarity } from "../../../lib/question-dedup";
import {
  releasedQuestionSearchScope,
  type QuestionSearchAttempt,
  type QuestionSearchExam,
  type QuestionSearchRoom,
} from "../../../lib/question-search-access";
import { ensureActiveAccount } from "../../../lib/security-server";

const headers = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
};
const allowedTypes = new Set(["single", "multiple", "true_false", "short_answer", "inline_dropdown", "matching", "group", "katex"]);
const SEARCH_LIMIT = 40;
const MAX_ACCESS_ATTEMPTS = 500;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function serverError() {
  return Response.json({ error: "Tra cứu câu hỏi chưa khả dụng với dữ liệu hiện tại." }, { status: 503, headers });
}

async function releasedLearnerQuestionAccess(admin: SupabaseClient, userId: string) {
  const attemptResult = await admin
    .from("exam_attempts")
    .select("student_id,exam_id,status,score,question_order,policy_snapshot,mode")
    .eq("student_id", userId)
    .in("status", ["completed", "submitted", "graded"])
    .order("submitted_at", { ascending: false })
    .limit(MAX_ACCESS_ATTEMPTS);
  if (attemptResult.error) return null;

  const attempts = (attemptResult.data ?? []) as QuestionSearchAttempt[];
  const examIds = [...new Set(attempts
    .map(attempt => typeof attempt.exam_id === "string" ? attempt.exam_id : "")
    .filter(Boolean))];
  if (!examIds.length) return { questionIds: new Set<string>(), sectionIds: new Set<string>() };

  const examResult = await admin
    .from("exams")
    .select("id,room_id,published,exam_type,duration_minutes,settings,results_released_at")
    .in("id", examIds);
  if (examResult.error) return null;
  const exams = (examResult.data ?? []) as QuestionSearchExam[];
  const roomIds = [...new Set(exams
    .map(exam => typeof exam.room_id === "string" ? exam.room_id : "")
    .filter(Boolean))];
  if (!roomIds.length) return { questionIds: new Set<string>(), sectionIds: new Set<string>() };

  const [roomResult, enrollmentResult] = await Promise.all([
    admin.from("exam_rooms").select("id,published,access_mode").in("id", roomIds),
    admin.from("exam_room_enrollments").select("room_id").eq("student_id", userId).in("room_id", roomIds),
  ]);
  if (roomResult.error || enrollmentResult.error) return null;

  const scope = releasedQuestionSearchScope({
    userId,
    attempts,
    exams,
    rooms: (roomResult.data ?? []) as QuestionSearchRoom[],
    enrolledRoomIds: new Set((enrollmentResult.data ?? []).map(row => String(row.room_id ?? "")).filter(Boolean)),
  });
  if (!scope.questionIds.size) return { questionIds: scope.questionIds, sectionIds: new Set<string>() };
  const sectionResult = await admin
    .from("exam_sections")
    .select("id,exam_id")
    .in("exam_id", [...scope.examIds]);
  if (sectionResult.error) return null;
  const sectionIds = new Set((sectionResult.data ?? [])
    .filter(row => scope.examIds.has(String(row.exam_id ?? "")))
    .map(row => String(row.id ?? ""))
    .filter(Boolean));
  return { questionIds: scope.questionIds, sectionIds };
}

export async function GET(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  const params = new URL(request.url).searchParams;
  const query = text(params.get("q"), 300);
  const id = text(params.get("id"), 80);
  if (!id && query.length < 3) {
    return Response.json({ error: "Nhập ít nhất 3 ký tự hoặc mã câu hỏi." }, { status: 400, headers });
  }

  let allowedQuestionIds: Set<string> | null = null;
  let allowedSectionIds: Set<string> | null = null;
  if (security.profile.role !== "admin") {
    const access = await releasedLearnerQuestionAccess(security.admin, security.user.id);
    if (access === null) return serverError();
    allowedQuestionIds = access.questionIds;
    allowedSectionIds = access.sectionIds;
    if ((id && !allowedQuestionIds.has(id)) || (!id && allowedQuestionIds.size === 0)) {
      // Return the same empty shape for an unknown ID and a known-but-hidden
      // ID so this route cannot be used to enumerate protected questions.
      return Response.json({ results: [] }, { headers });
    }
  }

  let builder = security.admin
    .from("exam_questions")
    // Intentionally exclude authoring source and answer explanations.
    .select("id,section_id,prompt,question_type,options,passage,media_url,instruction,sort_order")
    .limit(id ? 1 : SEARCH_LIMIT);
  if (id) builder = builder.eq("id", id);
  else builder = builder.ilike("prompt", `%${query.replace(/[%_]/g, "")}%`);
  if (allowedQuestionIds) builder = builder.in("id", [...allowedQuestionIds]);
  const result = await builder;
  if (result.error) return serverError();
  const results = (result.data ?? [])
    // A question-order snapshot is authoritative only inside its released
    // exam. This relationship check fails closed if stored IDs are corrupt.
    .filter(row => !allowedSectionIds || allowedSectionIds.has(String(row.section_id ?? "")))
    .map(row => ({
      id: String(row.id),
      prompt: String(row.prompt ?? ""),
      type: allowedTypes.has(String(row.question_type)) ? String(row.question_type) : "single",
      options: Array.isArray(row.options) ? row.options : [],
      passage: row.passage ?? null,
      mediaUrl: row.media_url ?? null,
      instruction: row.instruction ?? null,
      explanation: null,
      similarityScore: query ? Math.round(questionSimilarity(query, String(row.prompt ?? "")) * 100) : 100,
    }));
  return Response.json({ results }, { headers });
}

export async function POST(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLocaleLowerCase().startsWith("multipart/form-data")) {
    return Response.json({ error: "OCR cần multipart/form-data." }, { status: 415, headers });
  }
  return Response.json({ error: "OCR câu hỏi chưa được cấu hình trong runtime này.", code: "OCR_PROVIDER_UNAVAILABLE" }, { status: 501, headers });
}
