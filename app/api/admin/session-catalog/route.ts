import { ensureActiveAccount } from "../../../../lib/security-server";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

async function adminRequest(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security;
  if (security.profile.role !== "admin") {
    return { ok: false as const, response: Response.json({ error: "Bạn không có quyền quản trị." }, { status: 403, headers }) };
  }
  return security;
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers });
}

function includesQuery(values: Array<string | null | undefined>, query: string) {
  if (!query) return true;
  return values.filter(Boolean).join(" ").toLocaleLowerCase("vi").includes(query);
}

export async function GET(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;

  const params = new URL(request.url).searchParams;
  const requestedRoomId = params.get("roomId")?.trim() ?? "";
  const requestedExamId = params.get("examId")?.trim() ?? "";
  const query = params.get("q")?.trim().toLocaleLowerCase("vi") ?? "";

  const [roomsResult, examsResult] = await Promise.all([
    security.admin
      .from("exam_rooms")
      .select("id,title,description,exam_type,access_mode,published,sort_order,created_at")
      .eq("published", true)
      .order("sort_order")
      .order("created_at"),
    security.admin
      .from("exams")
      .select("id,room_id,title,description,exam_type,duration_minutes,published,created_at")
      .eq("published", true)
      .order("created_at", { ascending: false }),
  ]);

  if (roomsResult.error || examsResult.error) {
    return errorResponse("Không thể tải danh mục phòng và đề. Hãy thử lại sau.", 503);
  }

  const rawRooms = roomsResult.data ?? [];
  const publishedRoomIds = new Set(rawRooms.map(room => room.id));
  const rooms = rawRooms.filter(room => !requestedRoomId || room.id === requestedRoomId).filter(room => includesQuery([room.title, room.description, room.exam_type], query));
  const exams = (examsResult.data ?? [])
    .filter(exam => publishedRoomIds.has(exam.room_id))
    .filter(exam => !requestedRoomId || exam.room_id === requestedRoomId)
    .filter(exam => !requestedExamId || exam.id === requestedExamId)
    .filter(exam => includesQuery([exam.title, exam.description, exam.exam_type], query));

  let sections: Array<{ id: string; exam_id: string; title: string; duration_minutes: number | null; subject_code: string | null; sort_order: number }> = [];
  if (requestedExamId && exams.some(exam => exam.id === requestedExamId)) {
    const result = await security.admin
      .from("exam_sections")
      .select("id,exam_id,title,duration_minutes,subject_code,sort_order")
      .eq("exam_id", requestedExamId)
      .order("sort_order");
    if (result.error) return errorResponse("Không thể tải phần thi của đề đã chọn.", 503);
    sections = result.data ?? [];
  }

  return Response.json({ rooms, exams, sections, serverTime: new Date().toISOString() }, { headers });
}

