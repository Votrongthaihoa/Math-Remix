import { ensureActiveAccount } from "../../../../lib/security-server";

const headers = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
  vary: "authorization, x-supabase-access-token",
};

const ROOM_SELECT = "id,title,description,exam_type,access_mode,registration_start,registration_end,exam_start,exam_end,published,sort_order,created_at";
const EXAM_SELECT = "id,room_id,title,description,dashboard_title,exam_type,mode,duration_minutes,structure_config,published,sort_order,created_at";
const SECTION_SELECT = "id,exam_id,title,duration_minutes,subject_code,source_latex,sort_order";
const QUESTION_SELECT = "id,section_id,prompt,question_type,options,points,sort_order,passage,media_url,instruction,latex_source,solution_source";

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers });
}

export async function GET(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  if (security.profile.role !== "admin") return errorResponse("Bạn không có quyền quản trị nội dung đề thi.", 403);

  const admin = security.admin;
  const examId = new URL(request.url).searchParams.get("examId")?.trim();
  if (examId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(examId)) {
      return errorResponse("Mã đề thi không hợp lệ.", 400);
    }

    const examResult = await admin.from("exams").select(EXAM_SELECT).eq("id", examId).maybeSingle();
    if (examResult.error) return errorResponse(examResult.error.message || "Không thể tải đề thi.", 503);
    if (!examResult.data) return errorResponse("Không tìm thấy đề thi.", 404);

    const [roomResult, sectionResult] = await Promise.all([
      admin.from("exam_rooms").select(ROOM_SELECT).eq("id", examResult.data.room_id).maybeSingle(),
      admin.from("exam_sections").select(SECTION_SELECT).eq("exam_id", examId).order("sort_order"),
    ]);
    const parentError = roomResult.error ?? sectionResult.error;
    if (parentError) return errorResponse(parentError.message || "Không thể tải cấu trúc đề thi.", 503);
    if (!roomResult.data) return errorResponse("Không tìm thấy phòng khảo thí.", 404);

    const sections = sectionResult.data ?? [];
    const sectionIds = sections.map(section => section.id);
    const questionResult = sectionIds.length
      ? await admin.from("exam_questions").select(QUESTION_SELECT).in("section_id", sectionIds).order("sort_order")
      : { data: [], error: null };
    if (questionResult.error) return errorResponse(questionResult.error.message || "Không thể tải câu hỏi.", 503);

    const questions = questionResult.data ?? [];
    const questionIds = questions.map(question => question.id);
    const keyResult = questionIds.length
      ? await admin.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", questionIds)
      : { data: [], error: null };
    if (keyResult.error) return errorResponse(keyResult.error.message || "Không thể tải đáp án.", 503);

    return Response.json({
      rooms: [roomResult.data],
      exams: [examResult.data],
      sections,
      questions,
      keys: keyResult.data ?? [],
    }, { headers });
  }

  const [roomResult, examResult, sectionResult, questionResult, keyResult] = await Promise.all([
    admin.from("exam_rooms").select(ROOM_SELECT).order("sort_order").order("created_at"),
    admin.from("exams").select(EXAM_SELECT).order("sort_order").order("created_at"),
    admin.from("exam_sections").select(SECTION_SELECT).order("sort_order"),
    admin.from("exam_questions").select(QUESTION_SELECT).order("sort_order"),
    admin.from("exam_question_keys").select("question_id,correct_answer,explanation"),
  ]);
  const firstError = roomResult.error ?? examResult.error ?? sectionResult.error ?? questionResult.error ?? keyResult.error;
  if (firstError) return errorResponse(firstError.message || "Không thể tải nội dung đề thi.", 503);

  return Response.json({
    rooms: roomResult.data ?? [],
    exams: examResult.data ?? [],
    sections: sectionResult.data ?? [],
    questions: questionResult.data ?? [],
    keys: keyResult.data ?? [],
  }, { headers });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
