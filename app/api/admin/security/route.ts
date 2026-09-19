import { ensureAdminPermission } from "../../../../lib/admin-authorization-server";
import { hashedRequestIp } from "../../../../lib/security-server";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { consumeRequestBudget } from "../../../../lib/rate-limit-server";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const listStatuses = new Set(["all", "active", "temporarily_banned", "permanently_banned", "violations"]);
const defaultPageSize = 20;
const maxPageSize = 50;
const authLookupConcurrency = 5;
const authLookupMaxPages = 20;
const authEmailCacheTtlMs = 60_000;
const authEmailCacheMaxEntries = 2_000;
const authEmailCache = new Map<string, { email: string; expiresAt: number }>();

function providerFailure(context: string, error: { message?: string } | null | undefined) {
  if (error) console.error(`[admin-security] ${context}:`, error.message ?? "unknown provider error");
  return Response.json({ error: "Không thể hoàn tất thao tác bảo mật lúc này.", code: "SECURITY_PROVIDER_ERROR" }, { status: 503, headers });
}

function cacheAuthEmail(id: string, email: string) {
  if (!authEmailCache.has(id) && authEmailCache.size >= authEmailCacheMaxEntries) {
    const oldestId = authEmailCache.keys().next().value;
    if (oldestId) authEmailCache.delete(oldestId);
  }
  authEmailCache.set(id, { email, expiresAt: Date.now() + authEmailCacheTtlMs });
}

function positiveInteger(value: string | null, fallback: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function safeSearchTerm(value: string | null) {
  return (value ?? "")
    .trim()
    .slice(0, 100)
    .replace(/[^\p{L}\p{N}\s@._+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function adminRequest(request: Request) {
  return ensureAdminPermission(request, "system-admin");
}

export async function GET(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const { admin, user } = security;
  let listBudget;
  try {
    const ipHash = await hashedRequestIp(request);
    listBudget = await consumeRequestBudget(admin, "admin-security-list", `${user.id}:${ipHash}`, { capacity: 30, refillSeconds: 2 });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers });
  }
  if (!listBudget.allowed) return Response.json({ error: "Bạn tải danh sách quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: listBudget.retryAfterSeconds }, { status: 429, headers: { ...headers, "retry-after": String(listBudget.retryAfterSeconds) } });
  const searchParams = new URL(request.url).searchParams;
  const userId = searchParams.get("userId")?.trim() || "";
  if (userId && !uuid.test(userId)) return Response.json({ error: "Mã tài khoản không hợp lệ." }, { status: 400, headers });

  if (!userId) {
    const q = safeSearchTerm(searchParams.get("q"));
    const requestedStatus = searchParams.get("status")?.trim() || "all";
    if (!listStatuses.has(requestedStatus)) return Response.json({ error: "Bộ lọc trạng thái không hợp lệ." }, { status: 400, headers });
    let page = positiveInteger(searchParams.get("page"), 1, 10_000);
    const limit = positiveInteger(searchParams.get("limit"), defaultPageSize, maxPageSize);
    let offset = (page - 1) * limit;
    const emailMatchIds: string[] = [];
    const scannedEmails = new Map<string, string>();

    if (q.includes("@")) {
      const emailQuery = q.toLocaleLowerCase("vi");
      const authPageSize = 1000;
      let authPage = 1;
      let authSearchTruncated = false;
      while (authPage > 0 && authPage <= authLookupMaxPages) {
        const { data: authUsers, error: authError } = await admin.auth.admin.listUsers({ page: authPage, perPage: authPageSize });
        if (authError) return providerFailure("auth list", authError);
        for (const user of authUsers.users) {
          const id = user.id;
          if (!uuid.test(id)) continue;
          const email = user.email ?? "";
          scannedEmails.set(id, email);
          cacheAuthEmail(id, email);
          if (email.toLocaleLowerCase("vi").includes(emailQuery)) emailMatchIds.push(id);
        }
        const nextPage = Number(authUsers.nextPage ?? 0);
        if (!Number.isInteger(nextPage) || nextPage < 0 || nextPage > authLookupMaxPages || (nextPage > 0 && nextPage <= authPage)) {
          authSearchTruncated = true;
          break;
        }
        authPage = nextPage;
      }
      if (authSearchTruncated || authPage > 0) return Response.json({ error: "Từ khóa email quá rộng. Hãy nhập thêm ký tự để thu hẹp tìm kiếm.", code: "EMAIL_SEARCH_TOO_BROAD" }, { status: 400, headers });
    }

    const serverNow = new Date().toISOString();
    const executeProfilesPage = async (targetOffset: number) => {
      let query = admin
        .from("profiles")
        .select("id,full_name,student_code,role,status,account_status,violation_count,banned_at,banned_until,ban_reason,ban_event_id,created_at", { count: "exact" })
        .eq("role", "student");
      if (requestedStatus === "violations") query = query.gt("violation_count", 0);
      else if (requestedStatus === "active") query = query.or(`account_status.eq.active,and(account_status.eq.temporarily_banned,banned_until.lte.${serverNow})`);
      else if (requestedStatus === "temporarily_banned") query = query.eq("account_status", "temporarily_banned").or(`banned_until.is.null,banned_until.gt.${serverNow}`);
      else if (requestedStatus === "permanently_banned") query = query.eq("account_status", "permanently_banned");
      if (q) {
        const filters = [`full_name.ilike.%${q}%`, `student_code.ilike.%${q}%`];
        if (emailMatchIds.length) filters.push(`id.in.(${emailMatchIds.join(",")})`);
        query = query.or(filters.join(","));
      }
      return query
        .order("banned_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(targetOffset, targetOffset + limit - 1);
    };

    let profilePage = await executeProfilesPage(offset);
    if (profilePage.error) return providerFailure("profile list", profilePage.error);
    const total = profilePage.count ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / limit));
    if (page > pageCount) {
      page = pageCount;
      offset = (page - 1) * limit;
      profilePage = await executeProfilesPage(offset);
      if (profilePage.error) return providerFailure("profile page", profilePage.error);
    }

    const profiles = profilePage.data ?? [];
    const emails = new Map(scannedEmails);
    const missingIds = profiles.map(profile => profile.id).filter(id => {
      if (emails.has(id)) return false;
      const cached = authEmailCache.get(id);
      if (!cached || cached.expiresAt <= Date.now()) {
        authEmailCache.delete(id);
        return true;
      }
      emails.set(id, cached.email);
      return false;
    });
    for (let index = 0; index < missingIds.length; index += authLookupConcurrency) {
      const batch = await Promise.all(missingIds.slice(index, index + authLookupConcurrency).map(async id => {
        const authUser = await admin.auth.admin.getUserById(id);
        return [id, authUser.data.user?.email ?? ""] as const;
      }));
      for (const [id, email] of batch) {
        emails.set(id, email);
        cacheAuthEmail(id, email);
      }
    }
    const rows = profiles.map(profile => ({ ...profile, email: emails.get(profile.id) ?? "" }));
    return Response.json({ items: rows, total, page, limit, hasNextPage: offset + rows.length < total, serverTime: new Date().toISOString() }, { headers });
  }

  const { data: targetProfile, error: targetProfileError } = await admin.from("profiles").select("id,role").eq("id", userId).maybeSingle();
  if (targetProfileError) return providerFailure("target profile", targetProfileError);
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
  if (firstError) return providerFailure("security detail", firstError);
  const authUser = await admin.auth.admin.getUserById(userId);
  if (authUser.error) return providerFailure("auth detail", authUser.error);
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
  if (targetProfileError) return providerFailure("target profile", targetProfileError);
  if (!targetProfile) return Response.json({ error: "Không tìm thấy tài khoản học viên." }, { status: 404, headers });
  if (targetProfile.id === user.id || targetProfile.role !== "student") return Response.json({ error: "Chỉ có thể quản trị tài khoản học viên." }, { status: 403, headers });
  const now = new Date().toISOString();
  let metadata: Record<string, unknown> = {};
  let operationError: { message: string } | null = null;
  const sideEffectErrors: string[] = [];

  if (action === "unban") {
    const result = await admin.from("profiles").update({ account_status: "active", status: "active", banned_at: null, banned_until: null, ban_reason: null, ban_event_id: null, banned_by: null }).eq("id", userId);
    operationError = result.error;
    if (!operationError) {
      const eventResult = await admin.from("security_events").insert({ user_id: userId, event_type: "admin_unban", reason, evidence: { adminId: user.id } });
      if (eventResult.error) sideEffectErrors.push("security event");
    }
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
    const result = await admin.from("security_events").update({ reviewed_at: now, reviewed_by: user.id, review_result: "false_positive" }).eq("id", body.eventId).eq("user_id", userId).select("id").maybeSingle();
    operationError = result.error; metadata = { eventId: body.eventId };
    if (!operationError && !result.data) return Response.json({ error: "Không tìm thấy sự kiện bảo mật thuộc tài khoản." }, { status: 404, headers });
  } else if (action === "trust_device" || action === "revoke_device") {
    if (!body.deviceId || !uuid.test(body.deviceId)) return Response.json({ error: "Thiếu mã thiết bị." }, { status: 400, headers });
    const changes = action === "trust_device" ? { trusted_by_admin: true, revoked_at: null, verified_at: now } : { trusted_by_admin: false, revoked_at: now };
    const result = await admin.from("trusted_devices").update(changes).eq("id", body.deviceId).eq("user_id", userId).select("id").maybeSingle();
    operationError = result.error; metadata = { deviceId: body.deviceId };
    if (!operationError && !result.data) return Response.json({ error: "Không tìm thấy thiết bị thuộc tài khoản." }, { status: 404, headers });
    if (action === "revoke_device" && !operationError) {
      const sessionResult = await admin.from("user_sessions").update({ revoked_at: now }).eq("user_id", userId).eq("device_id", body.deviceId).is("revoked_at", null);
      if (sessionResult.error) sideEffectErrors.push("device sessions");
    }
  } else if (action === "reset_violation_count") {
    const count = Math.min(4, Math.max(0, Math.round(Number(body.violationCount) || 0)));
    const result = await admin.from("profiles").update({ violation_count: count }).eq("id", userId);
    operationError = result.error; metadata = { violationCount: count };
  }

  if (operationError) return providerFailure("security action", operationError);
  const { error: auditError } = await admin.from("admin_actions").insert({ admin_id: user.id, target_user_id: userId, action, reason, metadata });
  if (auditError) {
    console.error("[admin-security] audit log:", auditError.message);
    return Response.json({ error: "Thao tác đã thực hiện nhưng chưa ghi được audit log.", code: "AUDIT_LOG_FAILED", recoverable: true }, { status: 503, headers });
  }
  if (["unban", "extend_ban", "permanent_ban"].includes(action)) {
    const sessionResult = await admin.from("user_sessions").update({ revoked_at: now }).eq("user_id", userId).is("revoked_at", null);
    if (sessionResult.error) sideEffectErrors.push("active sessions");
  }
  if (sideEffectErrors.length) {
    return Response.json({ ok: true, partial: true, warning: "Thao tác chính đã thực hiện nhưng một số bước phụ chưa hoàn tất.", failedSteps: sideEffectErrors, code: "ACTION_PARTIALLY_COMPLETED" }, { headers });
  }
  return Response.json({ ok: true }, { headers });
}
