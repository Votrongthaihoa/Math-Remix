import { generateLessonSchedule } from "../../../../../lib/course-schedule";
import { jsonBodyError, readJsonBody } from "../../../../../lib/http-server";
import { consumeRequestBudget } from "../../../../../lib/rate-limit-server";
import { ensureActiveAccount, hashedRequestIp } from "../../../../../lib/security-server";
import { courseTimetableHeaders, courseTimetableUuid, errorResponse, textValue } from "../../../../../lib/course-timetable-server";

type GenerationBody = {
  courseId?: string;
  startDate?: string;
  weekdays?: number[];
  startTime?: string;
  durationMinutes?: number;
  lessonIds?: string[];
  published?: boolean;
};

export async function POST(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  if (security.profile.role !== "admin") return errorResponse("Bạn không có quyền quản trị.", 403);
  try {
    const budget = await consumeRequestBudget(security.admin, "admin-course-timetable-generate", `${security.user.id}:${await hashedRequestIp(request)}`, { capacity: 6, refillSeconds: 60 });
    if (!budget.allowed) return Response.json({ error: "Bạn tạo lịch quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...courseTimetableHeaders, "retry-after": String(budget.retryAfterSeconds) } });
  } catch {
    return errorResponse("Máy chủ bảo mật chưa được cấu hình đầy đủ.", 503);
  }
  const parsed = await readJsonBody<GenerationBody>(request, 32 * 1024);
  if (!parsed.ok) return Response.json(jsonBodyError(parsed.error), { status: parsed.error === "payload_too_large" ? 413 : 400, headers: courseTimetableHeaders });
  const body = parsed.body;
  const courseId = textValue(body.courseId, 80);
  if (!courseTimetableUuid.test(courseId)) return errorResponse("Khóa học không hợp lệ.");

  const [courseResult, chapterResult] = await Promise.all([
    security.admin.from("courses").select("id,title").eq("id", courseId).maybeSingle(),
    security.admin.from("chapters").select("id,sort_order").eq("course_id", courseId).order("sort_order"),
  ]);
  if (courseResult.error || chapterResult.error) return errorResponse("Không thể đọc cấu trúc khóa học.", 503);
  if (!courseResult.data) return errorResponse("Không tìm thấy khóa học.", 404);
  const chapterIds = (chapterResult.data ?? []).map(chapter => chapter.id);
  if (!chapterIds.length) return errorResponse("Khóa học chưa có phần hoặc bài học để xếp lịch.");
  const lessonResult = await security.admin.from("lessons").select("id,chapter_id,title,sort_order").in("chapter_id", chapterIds).eq("published", true).order("sort_order");
  if (lessonResult.error) return errorResponse("Không thể đọc bài học của khóa.", 503);
  const chapterOrder = new Map((chapterResult.data ?? []).map(chapter => [chapter.id, Number(chapter.sort_order)]));
  const lessons = (lessonResult.data ?? []).map(lesson => ({
    id: String(lesson.id),
    title: String(lesson.title),
    chapterSortOrder: chapterOrder.get(lesson.chapter_id) ?? 0,
    sortOrder: Number(lesson.sort_order),
  }));
  let generated;
  try {
    generated = generateLessonSchedule(lessons, {
      startDate: textValue(body.startDate, 10),
      weekdays: Array.isArray(body.weekdays) ? body.weekdays : [],
      startTime: textValue(body.startTime, 5),
      durationMinutes: Number(body.durationMinutes),
      lessonIds: Array.isArray(body.lessonIds) ? body.lessonIds.map(value => String(value)) : undefined,
    });
  } catch (value) {
    return errorResponse(value instanceof Error ? value.message : "Quy tắc xếp lịch không hợp lệ.");
  }
  const lessonIds = generated.map(event => event.lessonId);
  const existingResult = await security.admin.from("course_schedule_events").select("lesson_id").in("lesson_id", lessonIds).eq("event_kind", "lesson");
  if (existingResult.error) return errorResponse("Không thể kiểm tra lịch bài học hiện có.", 503);
  if ((existingResult.data ?? []).length) return errorResponse("Một hoặc nhiều bài học đã có lịch. Hãy xóa lịch cũ trước khi tạo lại.", 409);

  const batchId = crypto.randomUUID();
  const { data: events, error: insertError } = await security.admin.from("course_schedule_events").insert(generated.map(event => ({
    course_id: courseId,
    lesson_id: event.lessonId,
    title: event.title,
    start_at: event.startAt,
    end_at: event.endAt,
    delivery_mode: "self_study",
    event_kind: "lesson",
    source: "generated",
    generation_batch_id: batchId,
    status: "scheduled",
    published: Boolean(body.published),
    created_by: security.user.id,
  }))).select("id,course_id,lesson_id,title,start_at,end_at,event_kind,source,generation_batch_id,status,published");
  if (insertError) return errorResponse(insertError.code === "23505" ? "Một bài học đã có lịch." : "Không thể tạo lịch bài học.", insertError.code === "23505" ? 409 : 503);

  const ruleResult = await security.admin.from("course_schedule_rules").upsert({
    course_id: courseId,
    start_date: textValue(body.startDate, 10),
    weekdays: [...new Set(body.weekdays ?? [])].sort((left, right) => left - right),
    start_time: textValue(body.startTime, 5),
    duration_minutes: Number(body.durationMinutes),
    time_zone: "Asia/Ho_Chi_Minh",
    created_by: security.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "course_id" });
  if (ruleResult.error) {
    await security.admin.from("course_schedule_events").delete().eq("generation_batch_id", batchId);
    return errorResponse("Không thể lưu quy tắc xếp lịch.", 503);
  }
  return Response.json({ events: events ?? [], generationBatchId: batchId }, { status: 201, headers: courseTimetableHeaders });
}
