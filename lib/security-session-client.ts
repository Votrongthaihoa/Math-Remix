import { apiRequestUrl } from "./api-url";

export type SecurityActivityType = "idle" | "lesson" | "video" | "pdf" | "quiz" | "exam";

export type SecuritySessionReply = {
  allowed?: boolean;
  code?: string;
  message?: string;
  reason?: string;
  sessionId?: string;
  bannedUntil?: string | null;
  serverTime?: string;
  violationNumber?: number;
  eventCode?: string | null;
  warning?: { message?: string } | null;
  exempt?: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StartLoginSecuritySessionOptions = {
  accessToken: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  localStorage?: StorageLike | null;
  sessionStorage?: StorageLike | null;
  randomUUID?: () => string;
  userAgent?: string;
};

export type LoginSecurityResult =
  | { allowed: true; sessionId: string | null; exempt: boolean; warning: SecuritySessionReply["warning"] }
  | { allowed: false; code: string; message: string };

export const SECURITY_DEVICE_STORAGE_KEY = "remix.security.device-id.v1";
export const SECURITY_SESSION_STORAGE_KEY = "remix.security.learning-session.v1";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_LOGIN_SECURITY_ERROR = "Không thể xác minh an toàn phiên đăng nhập. Vui lòng thử lại.";
let volatileDeviceId = "";
let volatileSessionId: string | null = null;

function browserStorage(kind: "localStorage" | "sessionStorage") {
  if (typeof window === "undefined") return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function readStorage(storage: StorageLike | null, key: string) {
  try {
    return storage?.getItem(key)?.trim() ?? "";
  } catch {
    return null;
  }
}

function writeStorage(storage: StorageLike | null, key: string, value: string | null) {
  try {
    if (value) storage?.setItem(key, value);
    else storage?.removeItem(key);
  } catch {
    // The in-memory fallback still keeps one browser-page flow consistent
    // when storage is unavailable in privacy mode.
  }
}

export function isSecurityUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function getOrCreateSecurityDeviceId(options: Pick<StartLoginSecuritySessionOptions, "localStorage" | "randomUUID"> = {}) {
  const storage = options.localStorage === undefined ? browserStorage("localStorage") : options.localStorage;
  const stored = readStorage(storage, SECURITY_DEVICE_STORAGE_KEY);
  if (isSecurityUuid(stored)) {
    volatileDeviceId = stored;
    return stored;
  }
  if (stored) writeStorage(storage, SECURITY_DEVICE_STORAGE_KEY, null);
  if ((!storage || stored === null) && isSecurityUuid(volatileDeviceId)) return volatileDeviceId;

  let generated = "";
  try {
    generated = options.randomUUID?.() ?? globalThis.crypto?.randomUUID?.() ?? "";
  } catch {
    generated = "";
  }
  if (!isSecurityUuid(generated)) return "";
  volatileDeviceId = generated;
  writeStorage(storage, SECURITY_DEVICE_STORAGE_KEY, generated);
  return generated;
}

export function readSecuritySessionId(storage?: StorageLike | null) {
  const target = storage === undefined ? browserStorage("sessionStorage") : storage;
  const stored = readStorage(target, SECURITY_SESSION_STORAGE_KEY);
  if (isSecurityUuid(stored)) {
    volatileSessionId = stored;
    return stored;
  }
  if (stored) writeStorage(target, SECURITY_SESSION_STORAGE_KEY, null);
  return (!target || stored === null) && isSecurityUuid(volatileSessionId) ? volatileSessionId : null;
}

export function persistSecuritySessionId(value: string | null | undefined, storage?: StorageLike | null) {
  const target = storage === undefined ? browserStorage("sessionStorage") : storage;
  const safeValue = isSecurityUuid(value) ? value : null;
  volatileSessionId = safeValue;
  writeStorage(target, SECURITY_SESSION_STORAGE_KEY, safeValue);
  return safeValue;
}

export function securityDeviceInfo(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent) {
  const browser = /Edg\//.test(userAgent) ? "Microsoft Edge" : /Chrome\//.test(userAgent) ? "Google Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "Trình duyệt khác";
  const operatingSystem = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS/iPadOS" : /Mac OS/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "Hệ điều hành khác";
  return { browser, operatingSystem, deviceName: `${browser} trên ${operatingSystem}` };
}

export function loginSessionMatches(
  session: { access_token?: unknown; user?: { id?: unknown } } | null | undefined,
  expectedUserId: string,
  expectedAccessToken: string,
) {
  return session?.user?.id === expectedUserId && session.access_token === expectedAccessToken;
}

function safeLoginSecurityError(code: unknown) {
  const normalized = typeof code === "string" ? code.toLocaleUpperCase("en-US") : "";
  if (normalized === "DEVICE_LIMIT_REACHED") {
    return "Tài khoản đã đạt giới hạn thiết bị. Vui lòng liên hệ quản trị viên để được hỗ trợ.";
  }
  if (normalized.includes("BANNED") || normalized === "ACCOUNT_LOCKED") {
    return "Tài khoản đang bị khóa theo chính sách bảo mật. Vui lòng liên hệ quản trị viên.";
  }
  if (normalized.startsWith("AUTH_") || normalized === "AUTH_REQUIRED") {
    return "Không thể xác minh phiên đăng nhập. Vui lòng đăng nhập lại.";
  }
  return DEFAULT_LOGIN_SECURITY_ERROR;
}

/**
 * Establish the idle security session before the application trusts a fresh
 * password login. The supplied token pins the check to that exact login so an
 * account switch cannot silently run the gate under a newer browser session.
 */
export async function startLoginSecuritySession(options: StartLoginSecuritySessionOptions): Promise<LoginSecurityResult> {
  const accessToken = options.accessToken.trim();
  const deviceId = getOrCreateSecurityDeviceId(options);
  if (!accessToken || !deviceId) {
    return { allowed: false, code: "SECURITY_CLIENT_UNAVAILABLE", message: DEFAULT_LOGIN_SECURITY_ERROR };
  }
  const previousSessionId = readSecuritySessionId(options.sessionStorage);
  const info = securityDeviceInfo(options.userAgent);
  const headers = new Headers({
    "content-type": "application/json",
    authorization: `Bearer ${accessToken}`,
    "x-supabase-access-token": accessToken,
    "x-remix-device-id": deviceId,
  });
  if (previousSessionId) headers.set("x-remix-security-session-id", previousSessionId);

  try {
    const response = await (options.fetcher ?? fetch)(apiRequestUrl("/api/security/session"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "start",
        sessionId: previousSessionId,
        deviceId,
        activityType: "idle",
        resourceId: "login",
        ...info,
      }),
      cache: "no-store",
      signal: options.signal,
    });
    const payload = await response.json().catch(() => null) as SecuritySessionReply | null;
    if (!response.ok || payload?.allowed !== true) {
      const code = typeof payload?.code === "string" ? payload.code : `SECURITY_HTTP_${response.status}`;
      return { allowed: false, code, message: safeLoginSecurityError(code) };
    }
    if (payload.exempt === true) {
      persistSecuritySessionId(null, options.sessionStorage);
      return { allowed: true, sessionId: null, exempt: true, warning: payload.warning };
    }
    const sessionId = persistSecuritySessionId(payload.sessionId, options.sessionStorage);
    if (!sessionId) {
      return { allowed: false, code: "SECURITY_RESPONSE_INVALID", message: DEFAULT_LOGIN_SECURITY_ERROR };
    }
    return { allowed: true, sessionId, exempt: false, warning: payload.warning };
  } catch {
    return { allowed: false, code: "SECURITY_CHECK_FAILED", message: DEFAULT_LOGIN_SECURITY_ERROR };
  }
}
