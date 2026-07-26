import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { answersMatch } from "../../../lib/exam-answers";
import { ensureActiveAccount } from "../../../lib/security-server";

type AnswerValue = string | string[];
type ExamUser = { id: string; role: "student" | "admin" };

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;
}

async function authenticate(request: Request, admin: SupabaseClient): Promise<ExamUser | null> {
  const security = await ensureActiveAccount(request, admin);
  if (!security.ok) return null;
  return { id: security.user.id, role: security.profile.role === "admin" ? "admin" : "student" };
}

async function canAccessRoom(admin: SupabaseClient, user: ExamUser, roomId: string) {
  const { data: room } = await admin.from("exam_rooms").select("*").eq("id", roomId).single();
  if (!room || user.role !== "admin" && !room.published) return null;
  if (user.role === "admin" || room.access_mode === "open") return room;
  const { data: enrollment } = await admin.from("exam_room_enrollments").select("room_id").eq("room_id", roomId).eq("student_id", user.id).maybeSingle();
  return enrollment ? room : null;
}

async function loadExam(admin: SupabaseClient, user: ExamUser, examId: string) {
  const { data: exam } = await admin.from("exams").select("*").eq("id", examId).single();
  if (!exam || user.role !== "admin" && !exam.published) return null;
  const room = await canAccessRoom(admin, user, exam.room_id);
  if (!room) return null;
  const { data: sections } = await admin.from("exam_sections").select("id,exam_id,title,duration_minutes,sort_order").eq("exam_id", examId).order("sort_order");
  const sectionIds = (sections ?? []).map(section => section.id);
  const { data: questions } = sectionIds.length
    ? await admin.from("exam_questions").select("id,section_id,prompt,question_type,options,points,sort_order").in("section_id", sectionIds).order("sort_order")
    : { data: [] };
  return { room, exam, sections: sections ?? [], questions: questions ?? [] };
}

const privateHeaders = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

export async function GET(request: Request) {
  const admin = serverClient();
  if (!admin) return Response.json({ error: "Chưa cấu hình máy chủ khảo thí." }, { status: 503 });
  const user = await authenticate(request, admin);
  if (!user) return Response.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope") ?? "rooms";

  if (scope === "rooms") {
    const { data: rows, error } = await admin.from("exam_rooms").select("*").order("sort_order").order("created_at");
    if (error) return Response.json({ error: "Chưa có cấu trúc dữ liệu phòng khảo thí." }, { status: 503, headers: privateHeaders });
    const candidateRooms = user.role === "admin" ? rows ?? [] : (rows ?? []).filter(room => room.published);
    const assignedIds = user.role === "admin" ? [] : (await admin.from("exam_room_enrollments").select("room_id").eq("student_id", user.id)).data?.map(row => row.room_id) ?? [];
    const rooms = candidateRooms.filter(room => room.access_mode === "open" || assignedIds.includes(room.id) || user.role === "admin");
    const roomIds = rooms.map(room => room.id);
    const exams = roomIds.length ? (await admin.from("exams").select("id,room_id,title,exam_type,mode,duration_minutes,published,sort_order").in("room_id", roomIds).order("sort_order")).data ?? [] : [];
    const examIds = exams.map(exam => exam.id);
    const attempts = examIds.length ? (await admin.from("exam_attempts").select("id,exam_id,status,score,correct_answers,total_questions,submitted_at").eq("student_id", user.id).in("exam_id", examIds).order("started_at", { ascending: false })).data ?? [] : [];
    return Response.json({ rooms, exams: user.role === "admin" ? exams : exams.filter(exam => exam.published), attempts }, { headers: privateHeaders });
  }

  if (scope === "room") {
    const roomId = params.get("roomId") ?? "";
    const room = await canAccessRoom(admin, user, roomId);
    if (!room) return Response.json({ error: "Không tìm thấy phòng thi hoặc bạn chưa được cấp quyền." }, { status: 404 });
    const { data: examRows } = await admin.from("exams").select("id,room_id,title,description,exam_type,mode,duration_minutes,published,sort_order").eq("room_id", roomId).order("sort_order");
    const exams = user.role === "admin" ? examRows ?? [] : (examRows ?? []).filter(exam => exam.published);
    const examIds = exams.map(exam => exam.id);
    const attempts = examIds.length ? (await admin.from("exam_attempts").select("id,exam_id,status,score,correct_answers,total_questions,submitted_at,started_at").eq("student_id", user.id).in("exam_id", examIds).order("started_at", { ascending: false })).data ?? [] : [];
    return Response.json({ room, exams, attempts }, { headers: privateHeaders });
  }

  if (scope === "exam") {
    const bundle = await loadExam(admin, user, params.get("examId") ?? "");
    if (!bundle) return Response.json({ error: "Không tìm thấy đề thi hoặc bạn chưa được cấp quyền." }, { status: 404 });
    const { data: activeAttempt } = await admin.from("exam_attempts").select("id,answers,started_at,duration_seconds,status").eq("student_id", user.id).eq("exam_id", bundle.exam.id).eq("status", "in_progress").order("started_at", { ascending: false }).limit(1).maybeSingle();
    return Response.json({ ...bundle, activeAttempt }, { headers: privateHeaders });
  }

  if (scope === "result") {
    const attemptId = params.get("attemptId") ?? "";
    const { data: attempt } = await admin.from("exam_attempts").select("*").eq("id", attemptId).single();
    if (!attempt || attempt.student_id !== user.id && user.role !== "admin" || attempt.status === "in_progress") return Response.json({ error: "Không tìm thấy kết quả bài thi." }, { status: 404 });
    const bundle = await loadExam(admin, user, attempt.exam_id);
    if (!bundle) return Response.json({ error: "Không tìm thấy đề thi." }, { status: 404 });
    const questionIds = bundle.questions.map(question => question.id);
    const keys = questionIds.length ? (await admin.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", questionIds)).data ?? [] : [];
    return Response.json({ ...bundle, attempt, keys }, { headers: privateHeaders });
  }

  return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
}

export async function POST(request: Request) {
  const admin = serverClient();
  if (!admin) return Response.json({ error: "Chưa cấu hình máy chủ khảo thí." }, { status: 503 });
  const user = await authenticate(request, admin);
  if (!user) return Response.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
  const body = await request.json() as { action?: "start" | "submit"; examId?: string; attemptId?: string; mode?: "practice" | "exam"; answers?: Record<string, AnswerValue> };

  if (body.action === "start" && body.examId) {
    const bundle = await loadExam(admin, user, body.examId);
    if (!bundle) return Response.json({ error: "Đề thi không tồn tại hoặc chưa được mở." }, { status: 404 });
    const { data: existing } = await admin.from("exam_attempts").select("id,answers,started_at,duration_seconds,status").eq("student_id", user.id).eq("exam_id", body.examId).eq("status", "in_progress").order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) return Response.json({ attempt: existing, resumed: true }, { headers: privateHeaders });
    const { data: attempt, error } = await admin.from("exam_attempts").insert({
      student_id: user.id,
      exam_id: body.examId,
      title: bundle.exam.title,
      mode: body.mode === "exam" ? "exam" : "practice",
      status: "in_progress",
      score: 0,
      correct_answers: 0,
      total_questions: bundle.questions.length,
      answers: {},
      submitted_at: null,
    }).select("id,answers,started_at,duration_seconds,status").single();
    if (error || !attempt) return Response.json({ error: "Không thể khởi tạo lượt thi." }, { status: 500 });
    return Response.json({ attempt, resumed: false }, { headers: privateHeaders });
  }

  if (body.action === "submit" && body.attemptId && body.answers) {
    const { data: attempt } = await admin.from("exam_attempts").select("*").eq("id", body.attemptId).single();
    if (!attempt || attempt.student_id !== user.id || attempt.status !== "in_progress") return Response.json({ error: "Lượt thi không hợp lệ hoặc đã nộp." }, { status: 409 });
    const bundle = await loadExam(admin, user, attempt.exam_id);
    if (!bundle) return Response.json({ error: "Không tìm thấy đề thi." }, { status: 404 });
    const questionIds = bundle.questions.map(question => question.id);
    const keys = questionIds.length ? (await admin.from("exam_question_keys").select("question_id,correct_answer").in("question_id", questionIds)).data ?? [] : [];
    const keyMap = new Map(keys.map(key => [key.question_id, key.correct_answer]));
    const correctAnswers = bundle.questions.reduce((count, question) => count + (keyMap.has(question.id) && answersMatch(body.answers?.[question.id], keyMap.get(question.id)) ? 1 : 0), 0);
    const score = bundle.questions.length ? Math.round(correctAnswers / bundle.questions.length * 100) : 0;
    const durationSeconds = Math.max(0, Math.round((Date.now() - new Date(attempt.started_at).getTime()) / 1000));
    const { data: result, error } = await admin.from("exam_attempts").update({ answers: body.answers, correct_answers: correctAnswers, total_questions: bundle.questions.length, score, duration_seconds: durationSeconds, status: "submitted", submitted_at: new Date().toISOString() }).eq("id", attempt.id).select("id,score,correct_answers,total_questions,submitted_at,duration_seconds,status").single();
    if (error || !result) return Response.json({ error: "Không thể nộp bài thi." }, { status: 500 });
    return Response.json({ result }, { headers: privateHeaders });
  }

  return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
}
