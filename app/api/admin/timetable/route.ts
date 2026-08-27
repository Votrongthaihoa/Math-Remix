import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { consumeRequestBudget } from "../../../../lib/rate-limit-server";
import { ensureActiveAccount, hashedRequestIp } from "../../../../lib/security-server";

const headers = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
};

type TimetableMutation = {
  roomId?: string;
  startAt?: string | null;
  endAt?: string | null;
};

async function adminRequest(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security;
  if (security.profile.role !== "admin") {
    return {
      ok: false as const,
      response: Response.json({ error: "Bạn không có quyền quản trị." }, { status: 403, headers }),
    };
  }
  return security;
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers });
}

function validIdentifier(value: string) {
  return /^[0-9a-z-]{1,80}$/i.test(value);
}

function normalizedWindow(body: TimetableMutation) {
  if (body.startAt == null && body.endAt == null) return { ok: true as const, startAt: null, endAt: null };
  if (typeof body.startAt !== "string" || typeof body.endAt !== "string") {
    return { ok: false as const, error: "Hãy nhập đầy đủ thời gian bắt đầu và kết thúc." };
  }
  const start = Date.parse(body.startAt);
  const end = Date.parse(body.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { ok: false as const, error: "Thời gian vận hành không hợp lệ." };
  }
  if (end <= start) return { ok: false as const, error: "Thời gian kết thúc phải sau thời gian bắt đầu." };
  if (end - start > 31 * 24 * 60 * 60 * 1000) {
    return { ok: false as const, error: "Một lịch vận hành không thể kéo dài quá 31 ngày." };
  }
  return { ok: true as const, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };
}

export async function GET(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;

  const [roomResult, examResult] = await Promise.all([
    security.admin
      .from("exam_rooms")
      .select("id,title,description,exam_type,access_mode,exam_start,exam_end,published,sort_order,created_at")
      .order("sort_order")
      .order("created_at"),
    security.admin.from("exams").select("id,room_id,published"),
  ]);
  if (roomResult.error || examResult.error) {
    return errorResponse("Không thể tải lịch vận hành. Hãy thử lại sau.", 503);
  }

  const counts = new Map<string, { total: number; published: number }>();
  for (const exam of examResult.data ?? []) {
    const current = counts.get(exam.room_id) ?? { total: 0, published: 0 };
    current.total += 1;
    if (exam.published) current.published += 1;
    counts.set(exam.room_id, current);
  }

  const rooms = (roomResult.data ?? []).map(room => ({
    ...room,
    exam_count: counts.get(room.id)?.total ?? 0,
    published_exam_count: counts.get(room.id)?.published ?? 0,
  }));
  return Response.json({ rooms, serverTime: new Date().toISOString() }, { headers });
}

export async function PATCH(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;

  try {
    const budget = await consumeRequestBudget(
      security.admin,
      "admin-timetable-update",
      `${security.user.id}:${await hashedRequestIp(request)}`,
      { capacity: 20, refillSeconds: 3 },
    );
    if (!budget.allowed) {
      return Response.json(
        { error: "Bạn cập nhật lịch quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds },
        { status: 429, headers: { ...headers, "retry-after": String(budget.retryAfterSeconds) } },
      );
    }
  } catch {
    return errorResponse("Máy chủ bảo mật chưa được cấu hình đầy đủ.", 503);
  }

  const parsedBody = await readJsonBody<TimetableMutation>(request, 16 * 1024);
  if (!parsedBody.ok) {
    return Response.json(jsonBodyError(parsedBody.error), {
      status: parsedBody.error === "payload_too_large" ? 413 : 400,
      headers,
    });
  }
  const roomId = parsedBody.body.roomId?.trim() ?? "";
  if (!roomId || !validIdentifier(roomId)) return errorResponse("Phòng thi không hợp lệ.");
  const window = normalizedWindow(parsedBody.body);
  if (!window.ok) return errorResponse(window.error);

  const { data, error } = await security.admin
    .from("exam_rooms")
    .update({ exam_start: window.startAt, exam_end: window.endAt })
    .eq("id", roomId)
    .select("id,title,description,exam_type,access_mode,exam_start,exam_end,published,sort_order,created_at")
    .maybeSingle();
  if (error) return errorResponse("Không thể cập nhật lịch vận hành. Hãy thử lại.", 503);
  if (!data) return errorResponse("Không tìm thấy phòng thi.", 404);
  return Response.json({ room: data }, { headers });
}
