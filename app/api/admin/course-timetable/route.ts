import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { consumeRequestBudget } from "../../../../lib/rate-limit-server";
import { ensureActiveAccount, hashedRequestIp } from "../../../../lib/security-server";
import {
  boundedDateRange,
  courseTimetableHeaders,
  courseTimetableUuid,
  deliveryMode,
  errorResponse,
  nullableText,
  safeMeetingUrl,
  textValue,
} from "../../../../lib/course-timetable-server";

type LiveEventMutation = {
  eventKind: "live";
  courseId?: string;
  lessonId?: string | null;
  title?: string;
  description?: string;
  startAt?: string;
  endAt?: string;
  instructor?: string;
  deliveryMode?: string;
  meetingUrl?: string | null;
  published?: boolean;
};

async function adminRequest(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security;
  if (security.profile.role !== "admin") return { ok: false as const, response: errorResponse("Bạn không có quyền quản trị.", 403) };
  return security;
}

async function mutationBudget(request: Request, security: Awaited<ReturnType<typeof adminRequest>>) {
  if (!security.ok) return security.response;
  try {
    const budget = await consumeRequestBudget(
      security.admin,
      "admin-course-timetable",
      `${security.user.id}:${await hashedRequestIp(request)}`,
      { capacity: 30, refillSeconds: 3 },
    );
    return budget.allowed
      ? null
      : Response.json({ error: "Bạn thao tác lịch quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...courseTimetableHeaders, "retry-after": String(budget.retryAfterSeconds) } });
  } catch {
    return errorResponse("Máy chủ bảo mật chưa được cấu hình đầy đủ.", 503);
  }
}

function eventWindow(startValue: unknown, endValue: unknown) {
  const startAt = typeof startValue === "string" ? new Date(startValue) : new Date(Number.NaN);
  const endAt = typeof endValue === "string" ? new Date(endValue) : new Date(Number.NaN);
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime())) return { ok: false as const, error: "Hãy nhập ngày giờ bắt đầu và kết thúc hợp lệ." };
  if (endAt <= startAt) return { ok: false as const, error: "Giờ kết thúc phải sau giờ bắt đầu." };
  if (endAt.getTime() - startAt.getTime() > 24 * 60 * 60 * 1000) return { ok: false as const, error: "Một buổi học không thể kéo dài quá 24 giờ." };
  return { ok: true as const, startAt: startAt.toISOString(), endAt: endAt.toISOString() };
}

async function lessonBelongsToCourse(admin: SupabaseClient, lessonId: string, courseId: string) {
  const lessonResult = await admin.from("lessons").select("id,chapter_id,title").eq("id", lessonId).maybeSingle();
  if (lessonResult.error || !lessonResult.data) return false;
  const chapterResult = await admin.from("chapters").select("course_id").eq("id", lessonResult.data.chapter_id).maybeSingle();
  return !chapterResult.error && chapterResult.data?.course_id === courseId;
}

export async function GET(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const params = new URL(request.url).searchParams;
  const range = boundedDateRange(params);
  if (!range.ok) return errorResponse(range.error);
  const courseId = params.get("courseId")?.trim() ?? "";
  if (courseId && !courseTimetableUuid.test(courseId)) return errorResponse("Khóa học không hợp lệ.");

  let eventQuery = security.admin
    .from("course_schedule_events")
    .select("id,course_id,lesson_id,title,description,start_at,end_at,instructor,delivery_mode,meeting_url,event_kind,source,generation_batch_id,status,published,created_at,updated_at")
    .lt("start_at", range.to)
    .gt("end_at", range.from)
    .order("start_at");
  if (courseId) eventQuery = eventQuery.eq("course_id", courseId);
  const [coursesResult, chaptersResult, lessonsResult, eventsResult, rulesResult] = await Promise.all([
    security.admin.from("courses").select("id,title,published,sort_order").order("sort_order").order("created_at"),
    security.admin.from("chapters").select("id,course_id,title,sort_order").order("sort_order"),
    security.admin.from("lessons").select("id,chapter_id,title,published,sort_order").order("sort_order"),
    eventQuery,
    security.admin.from("course_schedule_rules").select("id,course_id,start_date,weekdays,start_time,duration_minutes,time_zone,updated_at"),
  ]);
  const firstError = coursesResult.error || chaptersResult.error || lessonsResult.error || eventsResult.error || rulesResult.error;
  if (firstError) return errorResponse("Không thể tải lịch khóa học. Hãy áp dụng migration course_timetable rồi thử lại.", 503);
  return Response.json({
    courses: coursesResult.data ?? [],
    chapters: chaptersResult.data ?? [],
    lessons: lessonsResult.data ?? [],
    events: eventsResult.data ?? [],
    rules: rulesResult.data ?? [],
    serverTime: new Date().toISOString(),
  }, { headers: courseTimetableHeaders });
}

export async function POST(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const budgetResponse = await mutationBudget(request, security);
  if (budgetResponse) return budgetResponse;
  const parsed = await readJsonBody<LiveEventMutation>(request, 32 * 1024);
  if (!parsed.ok) return Response.json(jsonBodyError(parsed.error), { status: parsed.error === "payload_too_large" ? 413 : 400, headers: courseTimetableHeaders });
  const body = parsed.body;
  if (body.eventKind !== "live") return errorResponse("Loại sự kiện không hợp lệ.");
  const courseId = textValue(body.courseId, 80);
  const lessonId = nullableText(body.lessonId, 80);
  const title = textValue(body.title, 180);
  if (!courseTimetableUuid.test(courseId)) return errorResponse("Khóa học không hợp lệ.");
  if (lessonId && !courseTimetableUuid.test(lessonId)) return errorResponse("Bài học không hợp lệ.");
  if (!title) return errorResponse("Hãy nhập tên buổi học.");
  const window = eventWindow(body.startAt, body.endAt);
  if (!window.ok) return errorResponse(window.error);
  const mode = deliveryMode(body.deliveryMode, "online");
  const meetingUrl = safeMeetingUrl(body.meetingUrl);
  if (["online", "hybrid"].includes(mode) && !meetingUrl) return errorResponse("Buổi học trực tuyến cần link HTTP hoặc HTTPS hợp lệ.");

  const courseResult = await security.admin.from("courses").select("id").eq("id", courseId).maybeSingle();
  if (courseResult.error) return errorResponse("Không thể xác nhận khóa học.", 503);
  if (!courseResult.data) return errorResponse("Không tìm thấy khóa học.", 404);
  if (lessonId && !(await lessonBelongsToCourse(security.admin, lessonId, courseId))) return errorResponse("Bài học không thuộc khóa học đã chọn.");

  const { data, error } = await security.admin.from("course_schedule_events").insert({
    course_id: courseId,
    lesson_id: lessonId,
    title,
    description: textValue(body.description, 2000),
    start_at: window.startAt,
    end_at: window.endAt,
    instructor: textValue(body.instructor, 160),
    delivery_mode: mode,
    meeting_url: meetingUrl,
    event_kind: "live",
    source: "manual",
    status: "scheduled",
    published: Boolean(body.published),
    created_by: security.user.id,
  }).select("id,course_id,lesson_id,title,description,start_at,end_at,instructor,delivery_mode,meeting_url,event_kind,source,generation_batch_id,status,published,created_at,updated_at").single();
  if (error || !data) return errorResponse("Không thể tạo buổi học. Hãy kiểm tra migration và thử lại.", 503);
  return Response.json({ event: data }, { status: 201, headers: courseTimetableHeaders });
}
