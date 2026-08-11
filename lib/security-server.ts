import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type ActivityType = "idle" | "lesson" | "video" | "pdf" | "quiz" | "exam";
export type SecurityProfile = {
  id: string;
  role: "student" | "admin";
  status: "active" | "locked";
  account_status: "active" | "temporarily_banned" | "permanently_banned";
  violation_count: number;
  banned_at: string | null;
  banned_until: string | null;
  ban_reason: string | null;
  ban_event_id: number | null;
};

type AuthUserResolution =
  | { status: "authenticated"; user: User }
  | { status: "invalid" }
  | { status: "unavailable" };

class AuthServiceUnavailableError extends Error {
  constructor() {
    super("Supabase Auth is temporarily unavailable.");
    this.name = "AuthServiceUnavailableError";
  }
}

export function securityAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;
}

export async function authenticatedSecurityUser(request: Request, admin: SupabaseClient) {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
    || request.headers.get("x-supabase-access-token")?.trim()
    || "";
  if (!accessToken) return null;
  const resolution = await resolveAuthUserResult(accessToken, admin);
  if (resolution.status === "unavailable") throw new AuthServiceUnavailableError();
  if (resolution.status === "invalid") return null;
  const user = resolution.user;
  let profileResult;
  try {
    profileResult = await admin.from("profiles").select("id,role,status,account_status,violation_count,banned_at,banned_until,ban_reason,ban_event_id").eq("id", user.id).single();
  } catch {
    throw new AuthServiceUnavailableError();
  }
  const { data: profile, error: profileError } = profileResult;
  if (profileError) {
    console.warn("[auth] profile lookup failed", { code: profileError.code, message: profileError.message });
    throw new AuthServiceUnavailableError();
  }
  if (!profile) return null;
  return { user, profile: profile as SecurityProfile, accessToken, authSessionId: jwtSessionId(accessToken) };
}

function jwtSessionId(token: string) {
  try {
    const payload = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))) as { session_id?: string };
    return decoded.session_id ?? null;
  } catch { return null; }
}

export function activeAccount(profile: SecurityProfile) {
  if (profile.status !== "active" || profile.account_status === "permanently_banned") return false;
  if (profile.account_status !== "temporarily_banned") return true;
  return Boolean(profile.banned_until && new Date(profile.banned_until).getTime() <= Date.now());
}

export function banPayload(profile: SecurityProfile) {
  const date = (profile.banned_at ? new Date(profile.banned_at) : new Date()).toISOString().slice(0, 10).replaceAll("-", "");
  return {
    allowed: false,
    code: profile.account_status === "permanently_banned" || profile.status === "locked" ? "ACCOUNT_PERMANENTLY_BANNED" : "ACCOUNT_TEMPORARILY_BANNED",
    reason: profile.ban_reason || (profile.status === "locked" ? "Tài khoản đã bị quản trị viên khóa." : "Tài khoản đang bị tạm khóa vì lý do bảo mật."),
    bannedAt: profile.banned_at,
    bannedUntil: profile.banned_until,
    serverTime: new Date().toISOString(),
    violationNumber: profile.violation_count,
    eventCode: profile.ban_event_id ? `SEC-${date}-${String(profile.ban_event_id).padStart(6, "0")}` : null,
  };
}

async function resolveAuthUserResult(accessToken: string, admin: SupabaseClient): Promise<AuthUserResolution> {
  let receivedInvalidResponse = false;
  let verificationUnavailable = false;
  try {
    const sdkResult = await admin.auth.getUser(accessToken);
    if (sdkResult.data.user) return { status: "authenticated", user: sdkResult.data.user };
    if (sdkResult.error) {
      console.warn("[auth] Supabase SDK rejected access token", { status: sdkResult.error.status, code: sdkResult.error.code, message: sdkResult.error.message });
      const status = Number(sdkResult.error.status ?? 0);
      if (!status || status === 429 || status >= 500) verificationUnavailable = true;
      else receivedInvalidResponse = true;
    }
  } catch {
    // Fall through to the direct auth endpoint below.
    console.warn("[auth] Supabase SDK user check threw");
    verificationUnavailable = true;
  }

  // The Supabase auth SDK can fail to validate a user token inside the
  // Cloudflare/Worker module runner even though the same token is accepted by
  // Supabase's auth endpoint. Keep the server-side validation, but fall back
  // to that endpoint instead of treating a valid session as anonymous.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const keys = [
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter((key, index, values): key is string => Boolean(key) && values.indexOf(key) === index);
  if (!url || !keys.length) return { status: "unavailable" };
  for (const key of keys) {
    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
        cache: "no-store",
        headers: { apikey: key, authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) console.warn("[auth] direct Supabase user check rejected", { status: response.status });
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) verificationUnavailable = true;
        else receivedInvalidResponse = true;
        continue;
      }
      const user = await response.json() as Partial<User>;
      if (user.id) return { status: "authenticated", user: user as User };
      verificationUnavailable = true;
    } catch {
      // Try the other configured Supabase key before rejecting the session.
      console.warn("[auth] direct Supabase user check threw");
      verificationUnavailable = true;
    }
  }
  if (receivedInvalidResponse && !verificationUnavailable) return { status: "invalid" };
  return { status: "unavailable" };
}

export async function resolveAuthUser(accessToken: string, admin: SupabaseClient) {
  const resolution = await resolveAuthUserResult(accessToken, admin);
  return resolution.status === "authenticated" ? resolution.user : null;
}

export async function ensureActiveAccount(request: Request, admin?: SupabaseClient) {
  const client = admin ?? securityAdminClient();
  if (!client) return { ok: false as const, response: Response.json({ error: "Chưa cấu hình máy chủ bảo mật." }, { status: 503 }) };
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
    || request.headers.get("x-supabase-access-token")?.trim()
    || "";
  if (!accessToken) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Chưa đăng nhập hoặc phiên đăng nhập đã bị mất.", code: "AUTH_REQUIRED" },
        { status: 401, headers: { "cache-control": "private, no-store", "www-authenticate": "Bearer" } },
      ),
    };
  }
  let auth;
  try {
    auth = await authenticatedSecurityUser(request, client);
  } catch (value) {
    if (!(value instanceof AuthServiceUnavailableError)) throw value;
    return {
      ok: false as const,
      response: Response.json(
        { error: "Không thể xác thực phiên đăng nhập lúc này. Hãy thử lại.", code: "AUTH_SERVICE_UNAVAILABLE" },
        { status: 503, headers: { "cache-control": "private, no-store", "retry-after": "3" } },
      ),
    };
  }
  if (!auth) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.", code: "AUTH_SESSION_INVALID" },
        { status: 401, headers: { "cache-control": "private, no-store", "www-authenticate": "Bearer" } },
      ),
    };
  }
  if (!activeAccount(auth.profile)) return { ok: false as const, response: Response.json(banPayload(auth.profile), { status: 423, headers: { "cache-control": "private, no-store" } }) };
  if (auth.profile.account_status === "temporarily_banned") await client.from("profiles").update({ account_status: "active", banned_at: null, banned_until: null, ban_reason: null, ban_event_id: null }).eq("id", auth.user.id);
  return { ok: true as const, admin: client, ...auth };
}

export type RequestLocation = { countryCode: string | null; regionCode: string | null; city: string | null; latitude: number | null; longitude: number | null };

export function requestLocation(request: Request): RequestLocation {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {};
  const number = (value: unknown) => typeof value === "number" ? value : typeof value === "string" && value ? Number(value) : null;
  return {
    countryCode: stringOrNull(cf.country ?? request.headers.get("cf-ipcountry"), 8),
    regionCode: stringOrNull(cf.regionCode ?? cf.region, 80),
    city: stringOrNull(cf.city, 100),
    latitude: number(cf.latitude),
    longitude: number(cf.longitude),
  };
}

function stringOrNull(value: unknown, max: number) { return typeof value === "string" && value ? value.slice(0, max) : null; }

export async function hashedRequestIp(request: Request) {
  const rawIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const configuredSecret = process.env.SECURITY_IP_HASH_SECRET;
  if (!configuredSecret && process.env.NODE_ENV === "production") {
    throw new Error("SECURITY_IP_HASH_SECRET is required in production.");
  }
  const secret = configuredSecret || "local-security-development-only";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawIp));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function haversineKm(a: { latitude: number | null; longitude: number | null }, b: { latitude: number | null; longitude: number | null }) {
  if (a.latitude === null || a.longitude === null || b.latitude === null || b.longitude === null) return null;
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude); const dLon = rad(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)) * 10) / 10;
}

export function riskScore(input: { verifiedDevice: boolean; sameDevice: boolean; activeConflict: boolean; sameActivity: boolean; activityType: ActivityType; distanceKm: number | null; regionChanged: boolean; repeated7d: boolean; repeated24h: boolean; trustedByAdmin: boolean; previousInactive: boolean }) {
  let score = 0;
  if (!input.verifiedDevice) score += 20;
  if (!input.sameDevice) score += 15;
  if (input.regionChanged) score += 10;
  if (input.distanceKm !== null) score += input.distanceKm > 500 ? 45 : input.distanceKm > 300 ? 35 : input.distanceKm >= 100 ? 20 : 0;
  if (input.activeConflict) score += 50;
  if (input.sameActivity && ["lesson","video","pdf"].includes(input.activityType)) score += 20;
  if (input.sameActivity && ["quiz","exam"].includes(input.activityType)) score += 40;
  if (input.repeated7d) score += 30;
  if (input.repeated24h) score += 40;
  if (input.verifiedDevice && input.sameDevice) score -= 40;
  if (input.previousInactive) score -= 30;
  if (input.trustedByAdmin) score -= 50;
  return Math.max(0, score);
}
