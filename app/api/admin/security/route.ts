import { ensureActiveAccount, hashedRequestIp } from "../../../../lib/security-server";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { consumeRequestBudget } from "../../../../lib/rate-limit-server";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function adminRequest(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security;
  if (security.profile.role !== "admin") return { ok: false as const, response: Response.json({ error: "Bạn không có quyền quản trị bảo mật." }, { status: 403, headers }) };
  return security;
}

export async function GET(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const { admin, user } = security;
  const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
  if (userId && !uuid.test(userId)) return Response.json({ error: "Mã tài khoản không hợp lệ." }, { status: 400, headers });

  if (!userId) {
    const [{ data: profiles, error }, { data: authPage }] = await Promise.all([
      admin.from("profiles").select("id,full_name,student_code,role,status,account_status,violation_count,banned_at,banned_until,ban_reason,ban_event_id,created_at").eq("role", "student").order("banned_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (error) return Response.json({ error: error.message }, { status: 400, headers });
    const emails = new Map((authPage?.users ?? []).map(user => [user.id, user.email ?? ""]));
    const rows = (profiles ?? []).map(profile => ({ ...profile, email: emails.get(profile.id) ?? "" }));
    return Response.json({ users: rows, serverTime: new Date().toISOString() }, { headers });
  }

  const { data: targetProfile, error: targetProfileError } = await admin.from("profiles").select("id,role").eq("id", userId).maybeSingle();
  if (targetProfileError) return Response.json({ error: targetProfileError.message }, { status: 400, headers });
  if (!targetProfile) return Response.json({ error: "Không tìm thấy tài khoản học viên." }, { status: 404, headers });
  if (targetProfile.id === user.id || targetProfile.role !== "student") return Response.json({ error: "Chỉ có thể quản trị tài khoản học viên." }, { status: 403, headers });

  const [profile, devices, sessions, events, violations, actions] = await Promise.all([
    admin.from("profiles").select("id,full_name,student_code,role,status,account_status,violation_count,banned_at,banned_until,ban_reason,ban_event_id").eq("id", userId).single(),
    admin.from("trusted_devices").select("id,device_id,device_name,browser,operating_system,trusted_by_admin,verified_at,last_used_at,revoked_at,created_at").eq("user_id", userId).order("last_used_at", { ascending: false }),
    admin.from("user_sessions").select("id,device_id,activity_type,current_resource_id,country_code,region_code,city,latitude,longitude,risk_score,created_at,last_seen_at,revoked_at").eq("user_id", userId).order("last_seen_at", { ascending: false }).limit(50),
    admin.from("security_events").select("id,event_type,risk_score,reason,device_id,conflicting_device_id,distance_km,evidence,created_at,reviewed_at,review_result").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    admin.from("account_violations").select("id,violation_number,violation_type,reason,security_event_id,ban_started_at,ban_ends_at,permanent,created_at,cancelled_at,cancellation_reason").eq("user_id", userId).order("created_at", { ascending: false }),
    admin.from("admin_actions").select("id,admin_id,action,reason,metadata,created_at").eq("target_user_id", userId).order("created_at", { ascending: false }).limit(100),
  ]);
  const firstError = profile.error || devices.error || sessions.error || events.error || violations.error || actions.error;
  if (firstError) return Response.json({ error: firstError.message }, { status: 400, headers });
  const authUser = await admin.auth.admin.getUserById(userId);
  return Response.json({ profile: { ...profile.data, email: authUser.data.user?.email ?? "" }, devices: devices.data ?? [], sessions: sessions.data ?? [], events: events.data ?? [], violations: violations.data ?? [], actions: actions.data ?? [], serverTime: new Date().toISOString() }, { headers });
}

type AdminAction = "unban" | "extend_ban" | "permanent_ban" | "mark_false_positive" | "trust_device" | "revoke_device" | "reset_violation_count";
type Body = { action?: AdminAction; userId?: string; deviceId?: string; eventId?: number; reason?: string; durationHours?: number; violationCount?: number };

export async function POST(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const { admin, user } = security;
  let ipHash = "";
  try {
    ipHash = await hashedRequestIp(request);
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers });
  }
  const budget = await consumeRequestBudget(admin, "admin-security-action", `${user.id}:${ipHash}`, { capacity: 5, refillSeconds: 120 });
  if (!budget.allowed) return Response.json({ error: "Bạn thao tác quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...headers, "retry-after": String(budget.retryAfterSeconds) } });
  const parsedBody = await readJsonBody<Body>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400, headers });
  const body = parsedBody.body;
  const action = body.action;
  const userId = body.userId?.trim() || "";
  const reason = body.reason?.trim().slice(0, 500) || "Thao tác quản trị bảo mật.";
  const allowed = new Set<AdminAction>(["unban", "extend_ban", "permanent_ban", "mark_false_positive", "trust_device", "revoke_device", "reset_violation_count"]);
  if (!action || !allowed.has(action) || !uuid.test(userId)) return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 400, headers });
  const { data: targetProfile, error: targetProfileError } = await admin.from("profiles").select("id,role").eq("id", userId).maybeSingle();
  if (targetProfileError) return Response.json({ error: targetProfileError.message }, { status: 400, headers });
  if (!targetProfile) return Response.json({ error: "Không tìm thấy tài khoản học viên." }, { status: 404, headers });
  if (targetProfile.id === user.id || targetProfile.role !== "student") return Response.json({ error: "Chỉ có thể quản trị tài khoản học viên." }, { status: 403, headers });
  const now = new Date().toISOString();
  let metadata: Record<string, unknown> = {};
  let operationError: { message: string } | null = null;

  if (action === "unban") {
    const result = await admin.from("profiles").update({ account_status: "active", status: "active", banned_at: null, banned_until: null, ban_reason: null, ban_event_id: null, banned_by: null }).eq("id", userId);
    operationError = result.error;
    if (!operationError) await admin.from("security_events").insert({ user_id: userId, event_type: "admin_unban", reason, evidence: { adminId: user.id } });
  } else if (action === "extend_ban") {
    const hours = Math.min(24 * 30, Math.max(1, Math.round(Number(body.durationHours) || 24)));
    const until = new Date(Date.now() + hours * 3600_000).toISOString();
    const result = await admin.from("profiles").update({ account_status: "temporarily_banned", banned_at: now, banned_until: until, ban_reason: reason, banned_by: user.id }).eq("id", userId);
    operationError = result.error; metadata = { durationHours: hours, bannedUntil: until };
  } else if (action === "permanent_ban") {
    const result = await admin.from("profiles").update({ account_status: "permanently_banned", banned_at: now, banned_until: null, ban_reason: reason, banned_by: user.id }).eq("id", userId);
    operationError = result.error;
  } else if (action === "mark_false_positive") {
    if (!body.eventId) return Response.json({ error: "Thiếu mã sự kiện." }, { status: 400, headers });
    const result = await admin.from("security_events").update({ reviewed_at: now, reviewed_by: user.id, review_result: "false_positive" }).eq("id", body.eventId).eq("user_id", userId);
    operationError = result.error; metadata = { eventId: body.eventId };
  } else if (action === "trust_device" || action === "revoke_device") {
    if (!body.deviceId || !uuid.test(body.deviceId)) return Response.json({ error: "Thiếu mã thiết bị." }, { status: 400, headers });
    const changes = action === "trust_device" ? { trusted_by_admin: true, revoked_at: null, verified_at: now } : { trusted_by_admin: false, revoked_at: now };
    const result = await admin.from("trusted_devices").update(changes).eq("id", body.deviceId).eq("user_id", userId);
    operationError = result.error; metadata = { deviceId: body.deviceId };
    if (action === "revoke_device" && !operationError) await admin.from("user_sessions").update({ revoked_at: now }).eq("user_id", userId).eq("device_id", body.deviceId).is("revoked_at", null);
  } else if (action === "reset_violation_count") {
    const count = Math.min(4, Math.max(0, Math.round(Number(body.violationCount) || 0)));
    const result = await admin.from("profiles").update({ violation_count: count }).eq("id", userId);
    operationError = result.error; metadata = { violationCount: count };
  }

  if (operationError) return Response.json({ error: operationError.message }, { status: 400, headers });
  const { error: auditError } = await admin.from("admin_actions").insert({ admin_id: user.id, target_user_id: userId, action, reason, metadata });
  if (auditError) return Response.json({ error: `Thao tác đã thực hiện nhưng không thể ghi audit log: ${auditError.message}` }, { status: 500, headers });
  if (["unban", "extend_ban", "permanent_ban"].includes(action)) await admin.from("user_sessions").update({ revoked_at: now }).eq("user_id", userId).is("revoked_at", null);
  return Response.json({ ok: true }, { headers });
}
