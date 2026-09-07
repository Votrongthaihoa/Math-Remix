import { ensureActiveAccount } from "../../../../../lib/security-server";
import { courseTimetableHeaders, courseTimetableUuid, errorResponse } from "../../../../../lib/course-timetable-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  const { id } = await context.params;
  if (!courseTimetableUuid.test(id)) return errorResponse("Sự kiện lịch không hợp lệ.");

  const { data: event, error } = await security.admin
    .from("course_schedule_events")
    .select("id,course_id,lesson_id,event_kind,status,published,start_at,end_at,meeting_url")
    .eq("id", id)
    .maybeSingle();
  if (error) return errorResponse("Không thể đọc sự kiện lịch.", 503);
  if (!event || !event.published || event.status !== "scheduled") return errorResponse("Sự kiện này không còn khả dụng.", 404);

  const { data: enrollment, error: enrollmentError } = await security.admin
    .from("course_enrollments")
    .select("course_id")
    .eq("student_id", security.user.id)
    .eq("course_id", event.course_id)
    .maybeSingle();
  if (enrollmentError) return errorResponse("Không thể xác nhận quyền vào lớp.", 503);
  if (!enrollment && security.profile.role !== "admin") return errorResponse("Bạn chưa được phân vào khóa học này.", 403);

  if (event.event_kind === "lesson") {
    if (!event.lesson_id) return errorResponse("Bài học của sự kiện không còn tồn tại.", 404);
    return Response.json({ kind: "lesson", path: `/lessons/${encodeURIComponent(event.lesson_id)}` }, { headers: courseTimetableHeaders });
  }

  const start = Date.parse(event.start_at);
  const end = Date.parse(event.end_at);
  const now = Date.now();
  if (!event.meeting_url || !Number.isFinite(start) || !Number.isFinite(end) || now < start - 30 * 60 * 1000 || now > end) {
    return errorResponse("Link vào lớp chỉ mở từ 30 phút trước giờ bắt đầu đến khi buổi học kết thúc.", 403);
  }
  return Response.json({ kind: "live", url: event.meeting_url }, { headers: courseTimetableHeaders });
}
