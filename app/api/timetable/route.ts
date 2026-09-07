import { ensureActiveAccount } from "../../../lib/security-server";
import {
  boundedDateRange,
  courseTimetableHeaders,
  eventPayload,
  errorResponse,
} from "../../../lib/course-timetable-server";

const eventSelect = "id,course_id,lesson_id,title,description,start_at,end_at,instructor,delivery_mode,event_kind,source,status,published";

export async function GET(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  const range = boundedDateRange(new URL(request.url).searchParams);
  if (!range.ok) return errorResponse(range.error);

  const enrollmentResult = await security.admin
    .from("course_enrollments")
    .select("course_id")
    .eq("student_id", security.user.id);
  if (enrollmentResult.error) return errorResponse("Không thể tải khóa học đã đăng ký.", 503);
  const courseIds = (enrollmentResult.data ?? []).map(row => String(row.course_id)).filter(Boolean);
  if (!courseIds.length) return Response.json({ events: [], serverTime: new Date().toISOString() }, { headers: courseTimetableHeaders });

  const [courseResult, eventResult] = await Promise.all([
    security.admin.from("courses").select("id,title,published").in("id", courseIds),
    security.admin
      .from("course_schedule_events")
      .select(eventSelect)
      .in("course_id", courseIds)
      .eq("published", true)
      .eq("status", "scheduled")
      .lt("start_at", range.to)
      .gt("end_at", range.from)
      .order("start_at"),
  ]);
  if (courseResult.error || eventResult.error) return errorResponse("Không thể tải thời khóa biểu. Hãy thử lại sau.", 503);

  const courseMap = new Map((courseResult.data ?? []).filter(course => course.published).map(course => [String(course.id), String(course.title)]));
  const rows = (eventResult.data ?? []).filter(row => courseMap.has(String(row.course_id)));
  const lessonIds = rows.map(row => row.lesson_id).filter((id): id is string => typeof id === "string" && Boolean(id));
  const lessonResult = lessonIds.length
    ? await security.admin.from("lessons").select("id,title").in("id", lessonIds)
    : { data: [], error: null };
  if (lessonResult.error) return errorResponse("Không thể tải nội dung bài học trong lịch.", 503);
  const lessonMap = new Map((lessonResult.data ?? []).map(lesson => [String(lesson.id), String(lesson.title)]));

  const events = rows.map(row => eventPayload(row as Record<string, unknown>, courseMap.get(String(row.course_id)) ?? "", lessonMap.get(String(row.lesson_id)) ?? null));
  return Response.json({ events, serverTime: new Date().toISOString() }, { headers: courseTimetableHeaders });
}
