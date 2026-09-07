import { jsonBodyError, readJsonBody } from "../../../../../lib/http-server";
import { consumeRequestBudget } from "../../../../../lib/rate-limit-server";
import { ensureActiveAccount, hashedRequestIp } from "../../../../../lib/security-server";
import {
  courseTimetableHeaders,
  courseTimetableUuid,
  deliveryMode,
  errorResponse,
  safeMeetingUrl,
  textValue,
} from "../../../../../lib/course-timetable-server";

type RouteContext = { params: Promise<{ id: string }> };
type EventPatch = {
  title?: string;
  description?: string;
  startAt?: string;
  endAt?: string;
  instructor?: string;
  deliveryMode?: string;
  meetingUrl?: string | null;
  status?: "scheduled" | "cancelled";
  published?: boolean;
};

async function adminRequest(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security;
  if (security.profile.role !== "admin") return { ok: false as const, response: errorResponse("Bạn không có quyền quản trị.", 403) };
  return security;
}

async function mutationBudget(
  request: Request,
  security: Awaited<ReturnType<typeof adminRequest>>,
  operation: "update" | "delete",
) {
  if (!security.ok) return security.response;
  try {
    const budget = await consumeRequestBudget(
      security.admin,
      `admin-course-timetable-${operation}`,
      `${security.user.id}:${await hashedRequestIp(request)}`,
      { capacity: 30, refillSeconds: 3 },
    );
    return budget.allowed
      ? null
      : Response.json(
          { error: "Bạn thao tác lịch quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds },
          { status: 429, headers: { ...courseTimetableHeaders, "retry-after": String(budget.retryAfterSeconds) } },
        );
  } catch {
    return errorResponse("Máy chủ bảo mật chưa được cấu hình đầy đủ.", 503);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const budgetResponse = await mutationBudget(request, security, "update");
  if (budgetResponse) return budgetResponse;
  const { id } = await context.params;
  if (!courseTimetableUuid.test(id)) return errorResponse("Sự kiện lịch không hợp lệ.");
  const parsed = await readJsonBody<EventPatch>(request, 32 * 1024);
  if (!parsed.ok) return Response.json(jsonBodyError(parsed.error), { status: parsed.error === "payload_too_large" ? 413 : 400, headers: courseTimetableHeaders });
  const currentResult = await security.admin.from("course_schedule_events").select("id,event_kind,title,description,start_at,end_at,instructor,delivery_mode,meeting_url,status,published").eq("id", id).maybeSingle();
  if (currentResult.error) return errorResponse("Không thể đọc sự kiện lịch.", 503);
  if (!currentResult.data) return errorResponse("Không tìm thấy sự kiện lịch.", 404);
  const current = currentResult.data;
  const title = parsed.body.title === undefined ? current.title : textValue(parsed.body.title, 180);
  if (!title) return errorResponse("Tên sự kiện không được để trống.");
  const startAt = parsed.body.startAt === undefined ? current.start_at : new Date(parsed.body.startAt);
  const endAt = parsed.body.endAt === undefined ? current.end_at : new Date(parsed.body.endAt);
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return errorResponse("Khoảng thời gian sự kiện không hợp lệ.");
  const mode = deliveryMode(parsed.body.deliveryMode, current.delivery_mode);
  const meetingUrl = parsed.body.meetingUrl === undefined ? current.meeting_url : safeMeetingUrl(parsed.body.meetingUrl);
  if (current.event_kind === "live" && ["online", "hybrid"].includes(mode) && !meetingUrl) return errorResponse("Buổi học trực tuyến cần link HTTP hoặc HTTPS hợp lệ.");
  const status = parsed.body.status === "cancelled" ? "cancelled" : parsed.body.status === "scheduled" ? "scheduled" : current.status;
  const { data, error } = await security.admin.from("course_schedule_events").update({
    title,
    description: parsed.body.description === undefined ? current.description : textValue(parsed.body.description, 2000),
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    instructor: parsed.body.instructor === undefined ? current.instructor : textValue(parsed.body.instructor, 160),
    delivery_mode: mode,
    meeting_url: current.event_kind === "lesson" ? null : meetingUrl,
    status,
    published: parsed.body.published === undefined ? current.published : Boolean(parsed.body.published),
    updated_at: new Date().toISOString(),
  }).eq("id", id).select("id,course_id,lesson_id,title,description,start_at,end_at,instructor,delivery_mode,meeting_url,event_kind,source,generation_batch_id,status,published,created_at,updated_at").single();
  if (error || !data) return errorResponse("Không thể cập nhật sự kiện lịch.", 503);
  return Response.json({ event: data }, { headers: courseTimetableHeaders });
}

export async function DELETE(request: Request, context: RouteContext) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const budgetResponse = await mutationBudget(request, security, "delete");
  if (budgetResponse) return budgetResponse;
  const { id } = await context.params;
  if (!courseTimetableUuid.test(id)) return errorResponse("Sự kiện lịch không hợp lệ.");
  const { data, error } = await security.admin.from("course_schedule_events").delete().eq("id", id).select("id").maybeSingle();
  if (error) return errorResponse("Không thể xóa sự kiện lịch.", 503);
  if (!data) return errorResponse("Không tìm thấy sự kiện lịch.", 404);
  return Response.json({ deleted: true, id }, { headers: courseTimetableHeaders });
}
