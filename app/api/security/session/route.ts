import { banPayload, ensureActiveAccount, hashedRequestIp, haversineKm, requestLocation, riskScore, type ActivityType } from "../../../../lib/security-server";

type SecurityBody = {
  action?: "start" | "heartbeat" | "stop" | "verify-device" | "status";
  sessionId?: string;
  deviceId?: string;
  deviceName?: string;
  browser?: string;
  operatingSystem?: string;
  activityType?: ActivityType;
  resourceId?: string;
};

const noStore = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activities = new Set<ActivityType>(["idle","lesson","video","pdf","quiz","exam"]);
const clean = (value: string | undefined, max: number) => (value ?? "").trim().slice(0, max);

export async function POST(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  const { admin, user, profile, authSessionId } = security;
  const body = await request.json().catch(() => ({})) as SecurityBody;
  const action = body.action ?? "status";
  if (action === "status") return Response.json({ allowed: true, status: "active", serverTime: new Date().toISOString(), violationNumber: profile.violation_count }, { headers: noStore });

  const deviceId = clean(body.deviceId, 80);
  if (!uuidPattern.test(deviceId)) return Response.json({ allowed: false, code: "INVALID_DEVICE_ID", message: "Mã thiết bị không hợp lệ." }, { status: 400, headers: noStore });

  if (action === "verify-device") {
    const { data: challenge } = await admin.from("device_verification_challenges").select("id,initial_auth_session_id,expires_at").eq("user_id", user.id).eq("device_id", deviceId).is("verified_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!challenge || !authSessionId || challenge.initial_auth_session_id === authSessionId) return Response.json({ allowed: false, code: "OTP_VERIFICATION_REQUIRED", message: "Phiên OTP chưa được xác minh." }, { status: 428, headers: noStore });
    const { count } = await admin.from("trusted_devices").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("revoked_at", null).not("verified_at", "is", null);
    if ((count ?? 0) >= 2) return Response.json({ allowed: false, code: "DEVICE_LIMIT_REACHED", message: "Tài khoản đã có tối đa 2 thiết bị được xác minh." }, { status: 409, headers: noStore });
    await admin.from("trusted_devices").upsert({ user_id: user.id, device_id: deviceId, device_name: clean(body.deviceName, 100), browser: clean(body.browser, 80), operating_system: clean(body.operatingSystem, 80), verified_at: new Date().toISOString(), revoked_at: null, last_used_at: new Date().toISOString() }, { onConflict: "user_id,device_id" });
    await admin.from("device_verification_challenges").update({ verified_at: new Date().toISOString() }).eq("id", challenge.id);
    await admin.from("security_events").insert({ user_id: user.id, event_type: "otp_verified", reason: "Thiết bị mới đã xác minh OTP.", device_id: deviceId, evidence: { authSessionRotated: true } });
    return Response.json({ allowed: true, verified: true }, { headers: noStore });
  }

  if (action === "stop") {
    if (body.sessionId) await admin.from("user_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", body.sessionId).eq("user_id", user.id).eq("device_id", deviceId);
    return Response.json({ allowed: true, stopped: true }, { headers: noStore });
  }

  if (action === "heartbeat" && (!body.sessionId || !uuidPattern.test(body.sessionId))) {
    return Response.json({ allowed: false, code: "SESSION_REQUIRED", message: "Phiên học không hợp lệ. Vui lòng mở lại nội dung." }, { status: 409, headers: noStore });
  }

  const activityType = activities.has(body.activityType ?? "idle") ? body.activityType ?? "idle" : "idle";
  const resourceId = clean(body.resourceId, 180) || null;
  const now = new Date();
  const location = requestLocation(request);
  const ipHash = await hashedRequestIp(request);
  const { data: trusted } = await admin.from("trusted_devices").select("id,verified_at,revoked_at,trusted_by_admin").eq("user_id", user.id).eq("device_id", deviceId).maybeSingle();

  if (!trusted?.verified_at || trusted.revoked_at) {
    const { count } = await admin.from("trusted_devices").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("revoked_at", null).not("verified_at", "is", null);
    if ((count ?? 0) >= 2) {
      await admin.from("security_events").insert({ user_id: user.id, event_type: "device_limit", risk_score: 20, reason: "Thiết bị thứ ba yêu cầu quản trị viên xem xét.", device_id: deviceId });
      return Response.json({ allowed: false, code: "DEVICE_LIMIT_REACHED", message: "Tài khoản đã có tối đa 2 thiết bị. Hãy liên hệ quản trị viên để đổi thiết bị." }, { status: 409, headers: noStore });
    }
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    await admin.from("device_verification_challenges").insert({ user_id: user.id, device_id: deviceId, initial_auth_session_id: authSessionId, expires_at: expiresAt });
    await admin.from("security_events").insert([{ user_id: user.id, event_type: "new_device", risk_score: 20, reason: "Phát hiện thiết bị mới chưa xác minh.", device_id: deviceId }, { user_id: user.id, event_type: "otp_required", risk_score: 20, reason: "Yêu cầu OTP cho thiết bị mới.", device_id: deviceId }]);
    return Response.json({ allowed: false, code: "OTP_REQUIRED", requiresOtp: true, message: "Thiết bị mới cần xác minh qua email trước khi học.", email: user.email ?? "", expiresAt }, { status: 428, headers: noStore });
  }

  await admin.from("trusted_devices").update({ last_used_at: now.toISOString(), device_name: clean(body.deviceName, 100), browser: clean(body.browser, 80), operating_system: clean(body.operatingSystem, 80) }).eq("id", trusted.id);

  if (action === "heartbeat") {
    const { data: currentSession } = await admin.from("user_sessions").select("id,revoked_at").eq("id", body.sessionId).eq("user_id", user.id).eq("device_id", deviceId).maybeSingle();
    if (!currentSession || currentSession.revoked_at) return Response.json({ allowed: false, code: "SESSION_REVOKED", message: "Phiên học đã kết thúc vì có hoạt động trên thiết bị khác." }, { status: 409, headers: noStore });
  }

  const activeSince = new Date(Date.now() - 2 * 60_000).toISOString();
  const waitingSince = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: activeSessions } = await admin.from("user_sessions").select("id,device_id,activity_type,current_resource_id,last_seen_at,region_code,city,latitude,longitude").eq("user_id", user.id).is("revoked_at", null).gte("last_seen_at", activeSince).neq("device_id", deviceId);
  const conflict = activeSessions?.[0] ?? null;
  let warning: { code: string; message: string; riskScore: number } | null = null;
  let score = 0;

  if (conflict) {
    const distanceKm = haversineKm(location, { latitude: conflict.latitude, longitude: conflict.longitude });
    const { count: repeated7d } = await admin.from("security_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("event_type", "concurrent_session").gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString());
    const { count: repeated24h } = await admin.from("security_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("event_type", "concurrent_session").gte("created_at", new Date(Date.now() - 86400_000).toISOString());
    const { count: crossAccountDevice } = await admin.from("trusted_devices").select("id", { count: "exact", head: true }).eq("device_id", deviceId).neq("user_id", user.id).not("verified_at", "is", null);
    score = riskScore({ verifiedDevice: true, sameDevice: false, activeConflict: true, sameActivity: conflict.activity_type === activityType, activityType, distanceKm, regionChanged: Boolean(location.regionCode && conflict.region_code && location.regionCode !== conflict.region_code), repeated7d: (repeated7d ?? 0) > 0, repeated24h: (repeated24h ?? 0) > 0, trustedByAdmin: Boolean(trusted.trusted_by_admin), previousInactive: false }) + ((crossAccountDevice ?? 0) > 0 ? 30 : 0);
    const reason = activityType === "exam" ? "Phát hiện hai thiết bị cùng làm bài thi." : "Phát hiện nhiều thiết bị cùng truy cập nội dung học trong cùng thời điểm.";
    const { data: event } = await admin.from("security_events").insert({ user_id: user.id, event_type: "concurrent_session", risk_score: score, reason, device_id: deviceId, conflicting_device_id: conflict.device_id, distance_km: distanceKm, evidence: { activityType, conflictingActivityType: conflict.activity_type, sameResource: conflict.current_resource_id === resourceId, regionChanged: Boolean(location.regionCode && conflict.region_code && location.regionCode !== conflict.region_code), activeWindowSeconds: 120 } }).select("id").single();
    if (score >= 100 && event) {
      const { data: banRows } = await admin.rpc("apply_account_violation", { target_user_id: user.id, target_event_id: event.id, target_violation_type: "account_sharing", target_reason: reason });
      const ban = banRows?.[0];
      const bannedProfile = { ...profile, account_status: ban?.account_status ?? "temporarily_banned", violation_count: ban?.violation_number ?? profile.violation_count + 1, banned_at: ban?.banned_at ?? now.toISOString(), banned_until: ban?.banned_until ?? null, ban_reason: reason, ban_event_id: event.id };
      return Response.json(banPayload(bannedProfile), { status: 423, headers: noStore });
    }
    if (score >= 70) {
      await admin.from("user_sessions").update({ revoked_at: now.toISOString(), risk_score: score }).eq("id", conflict.id);
      await admin.from("security_events").insert({ user_id: user.id, event_type: "warning", risk_score: score, reason: "Đã dừng phiên cũ và cảnh báo tài khoản.", device_id: deviceId, conflicting_device_id: conflict.device_id, evidence: { sourceEventId: event?.id } });
      warning = { code: "CONCURRENT_SESSION_STOPPED", message: "Một phiên học trên thiết bị khác đã được dừng. Nếu tiếp tục xảy ra, tài khoản có thể bị khóa.", riskScore: score };
    } else if (score >= 40) {
      await admin.from("device_verification_challenges").insert({ user_id: user.id, device_id: deviceId, initial_auth_session_id: authSessionId, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
      return Response.json({ allowed: false, code: "RISK_OTP_REQUIRED", requiresOtp: true, message: "Hoạt động cần được xác minh lại qua email.", riskScore: score, email: user.email ?? "" }, { status: 428, headers: noStore });
    }
  }

  const sessionPayload = { user_id: user.id, auth_session_id: authSessionId, device_id: deviceId, activity_type: activityType, current_resource_id: resourceId, ip_hash: ipHash, country_code: location.countryCode, region_code: location.regionCode, city: location.city, latitude: location.latitude, longitude: location.longitude, risk_score: score, last_seen_at: now.toISOString() };
  let sessionId = body.sessionId && uuidPattern.test(body.sessionId) ? body.sessionId : null;
  if (sessionId) {
    const { data: updated } = await admin.from("user_sessions").update(sessionPayload).eq("id", sessionId).eq("user_id", user.id).eq("device_id", deviceId).is("revoked_at", null).select("id").maybeSingle();
    if (!updated) sessionId = null;
  }
  if (!sessionId) {
    const { data: created, error } = await admin.from("user_sessions").insert(sessionPayload).select("id").single();
    if (error || !created) return Response.json({ allowed: false, code: "SESSION_CREATE_FAILED", message: "Không thể tạo phiên học an toàn." }, { status: 500, headers: noStore });
    sessionId = created.id;
  }

  await admin.from("user_sessions").update({ revoked_at: now.toISOString() }).eq("user_id", user.id).is("revoked_at", null).lt("last_seen_at", waitingSince);
  return Response.json({ allowed: true, status: "active", sessionId, nextHeartbeatSeconds: 60, warning, serverTime: now.toISOString() }, { headers: noStore });
}
