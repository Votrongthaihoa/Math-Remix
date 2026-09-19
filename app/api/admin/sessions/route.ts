import { ensureAdminPermission } from "../../../../lib/admin-authorization-server";
import { normalizeExamPolicy } from "../../../../lib/exam-policy";
import { normalizeSessionLimit, sessionSearchText, sessionState, type SessionState } from "../../../../lib/session-catalog";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

async function adminRequest(request: Request) {
  return ensureAdminPermission(request, "exam-rooms");
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers });
}

type AttemptCount = { total: number; submitted: number };

type SessionCatalogRow = {
  id: string;
  kind: "account" | "link_qr" | "both";
  exam_id: string;
  room_id: string;
  name: string;
  exam_title: string;
  exam_type: string;
  room_title: string;
  starts_at: string;
  ends_at: string;
  enabled: boolean;
  results_released_at: string | null;
  token_hint: string | null;
  attempt_count: number;
  submitted_count: number;
};

function countAttempts(rows: Array<{ slot_id?: string | null; exam_id?: string | null; status: string }>) {
  const counts = new Map<string, AttemptCount>();
  for (const row of rows) {
    const key = row.slot_id || row.exam_id;
    if (!key) continue;
    const current = counts.get(key) ?? { total: 0, submitted: 0 };
    current.total += 1;
    if (["submitted", "completed", "graded"].includes(row.status)) current.submitted += 1;
    counts.set(key, current);
  }
  return counts;
}

function accountWindow(exam: { settings?: unknown; exam_type: string; duration_minutes: number }) {
  const policy = normalizeExamPolicy(exam.settings, { examType: exam.exam_type, durationMinutes: exam.duration_minutes });
  const startsAt = policy.timing.opensAt;
  const endsAt = policy.timing.closesAt;
  const audience = policy.access.audience;
  if (!startsAt || !endsAt || (audience !== "account" && audience !== "both")) return null;
  return { policy, startsAt, endsAt };
}

export async function GET(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;

  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim().toLocaleLowerCase("vi") ?? "";
  const requestedState = params.get("state") as SessionState | null;
  const requestedSort = params.get("sort");
  const sort = requestedSort === "start_asc" || requestedSort === "name_asc" ? requestedSort : "start_desc";
  const limit = normalizeSessionLimit(params.get("limit"));
  const page = Math.max(1, Math.floor(Number(params.get("page") ?? 1) || 1));

  const [slotResult, examResult, roomResult] = await Promise.all([
    security.admin
      .from("exam_access_slots")
      .select("id,exam_id,name,token_hint,starts_at,ends_at,grace_period_minutes,enabled,results_released_at,created_at,updated_at", { count: "exact" })
      .order("starts_at", { ascending: false })
      .limit(2000),
    security.admin
      .from("exams")
      .select("id,room_id,title,description,exam_type,duration_minutes,published,settings,results_released_at,created_at")
      .eq("published", true),
    security.admin
      .from("exam_rooms")
      .select("id,title,exam_type,published")
      .eq("published", true),
  ]);

  if (slotResult.error || examResult.error || roomResult.error) {
    return errorResponse("Không thể tải danh sách kíp thi. Hãy thử lại sau.", 503);
  }

  const exams = examResult.data ?? [];
  const rooms = roomResult.data ?? [];
  const examMap = new Map(exams.map(exam => [exam.id, exam]));
  const roomMap = new Map(rooms.map(room => [room.id, room]));
  const slotRows = slotResult.data ?? [];
  const slotIds = slotRows.map(slot => slot.id);
  const examIdsWithSlots = new Set(slotRows.map(slot => slot.exam_id));
  const examIds = exams.map(exam => exam.id);

  const [guestAttemptsResult, accountAttemptsResult] = await Promise.all([
    slotIds.length
      ? security.admin.from("guest_exam_attempts").select("slot_id,status").in("slot_id", slotIds)
      : Promise.resolve({ data: [], error: null } as { data: Array<{ slot_id: string; status: string }>; error: null }),
    examIds.length
      ? security.admin.from("exam_attempts").select("exam_id,status,mode").in("exam_id", examIds).eq("mode", "exam")
      : Promise.resolve({ data: [], error: null } as { data: Array<{ exam_id: string; status: string }>; error: null }),
  ]);
  if (guestAttemptsResult.error || accountAttemptsResult.error) return errorResponse("Không thể tải thống kê người tham gia.", 503);

  const guestCounts = countAttempts(guestAttemptsResult.data ?? []);
  const accountCounts = countAttempts(accountAttemptsResult.data ?? []);
  const combinedAccountCountApplied = new Set<string>();
  const rows: SessionCatalogRow[] = slotRows.flatMap(slot => {
    const exam = examMap.get(slot.exam_id);
    const room = exam ? roomMap.get(exam.room_id) : undefined;
    if (!exam || !room) return [];
    const counts = guestCounts.get(slot.id) ?? { total: 0, submitted: 0 };
    const scheduled = accountWindow(exam);
    const kind = scheduled?.policy.access.audience === "both" ? "both" : "link_qr";
    const accountExtra = kind === "both" && !combinedAccountCountApplied.has(exam.id) ? accountCounts.get(exam.id) ?? { total: 0, submitted: 0 } : { total: 0, submitted: 0 };
    if (kind === "both") combinedAccountCountApplied.add(exam.id);
    return [{
      id: slot.id,
      kind: kind as "link_qr" | "both",
      exam_id: exam.id,
      room_id: room.id,
      name: slot.name,
      exam_title: exam.title,
      exam_type: exam.exam_type,
      room_title: room.title,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      enabled: slot.enabled,
      results_released_at: slot.results_released_at,
      token_hint: slot.token_hint,
      attempt_count: counts.total + accountExtra.total,
      submitted_count: counts.submitted + accountExtra.submitted,
    }];
  });

  for (const exam of exams) {
    const scheduled = accountWindow(exam);
    const room = roomMap.get(exam.room_id);
    if (!scheduled || !room) continue;
    if (scheduled.policy.access.audience === "both" && examIdsWithSlots.has(exam.id)) continue;
    const counts = accountCounts.get(exam.id) ?? { total: 0, submitted: 0 };
    rows.push({
      id: `account:${exam.id}`,
      kind: scheduled.policy.access.audience === "both" ? "both" : "account",
      exam_id: exam.id,
      room_id: room.id,
      name: `${exam.title} · ${scheduled.policy.access.audience === "both" ? "Tài khoản + Link/QR" : "Tài khoản"}`,
      exam_title: exam.title,
      exam_type: exam.exam_type,
      room_title: room.title,
      starts_at: scheduled.startsAt,
      ends_at: scheduled.endsAt,
      enabled: true,
      results_released_at: exam.results_released_at ?? null,
      token_hint: null,
      attempt_count: counts.total,
      submitted_count: counts.submitted,
    });
  }

  const searchMatched = rows
    .filter(row => !query || sessionSearchText([row.name, row.exam_title, row.exam_type, row.room_title]).includes(query));
  const filtered = searchMatched
    .filter(row => !requestedState || sessionState(row, Date.now()) === requestedState)
    .sort((left, right) => {
      if (sort === "name_asc") return left.name.localeCompare(right.name, "vi");
      const delta = Date.parse(left.starts_at) - Date.parse(right.starts_at);
      return sort === "start_asc" ? delta : -delta;
    });
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);
  const summary = searchMatched.reduce<Record<SessionState, number>>((result, row) => {
    const state = sessionState(row);
    result[state] += 1;
    return result;
  }, { upcoming: 0, open: 0, ended: 0, disabled: 0 });

  return Response.json({ items, summary, page, limit, total: filtered.length, hasNextPage: start + limit < filtered.length, serverTime: new Date().toISOString() }, { headers });
}
