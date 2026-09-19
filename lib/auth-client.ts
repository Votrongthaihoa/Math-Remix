import { supabase } from "./supabase";
import type { Session } from "@supabase/supabase-js";
import { apiRequestUrl } from "./api-url";

const SESSION_EXPIRY_SKEW_MS = 30_000;
let refreshPromise: Promise<Session | null> | null = null;

function sessionExpiredError() {
  const error = new Error("Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.");
  error.name = "AuthSessionError";
  return error;
}

async function refreshAuthSession() {
  if (!supabase) return null;
  // Several protected requests can start together when a page resumes. A
  // single refresh prevents those requests from racing the same refresh token.
  if (!refreshPromise) {
    refreshPromise = supabase.auth.refreshSession()
      .then(({ data, error }) => error ? null : data.session)
      .catch(() => null)
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

/** Explicit SSO refresh hook used by route guards and legacy-compatible auth stores. */
export async function trySsoRefresh() {
  const session = await refreshAuthSession();
  if (!session) return null;
  const role = String(session.user?.app_metadata?.role ?? "").toLocaleLowerCase("en-US");
  // The reference SSO flow is for learners; admin sessions stay in the
  // admin app and must not be silently crossed into the learner shell.
  if (role === "admin") return null;
  return session;
}

async function clearInvalidLocalSession(expectedToken?: string) {
  if (!supabase) return;
  if (expectedToken) {
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    // A request from the previous login must never sign out a newer login.
    if (data.session?.access_token && data.session.access_token !== expectedToken) return;
  }
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
}

async function refreshStillBelongsToCurrentSession(refreshed: Session, previousToken: string) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    const current = data.session;
    // A refresh can finish after the user logs out or signs into another
    // account. Never replay the previous request under that newer identity.
    if (error || !current || current.user.id !== refreshed.user.id) return false;
    return current.access_token === previousToken || current.access_token === refreshed.access_token;
  } catch {
    // When current ownership cannot be proven, preserve the original 401.
    return false;
  }
}

export async function activeSessionToken() {
  if (!supabase) throw new Error("Chưa cấu hình Supabase.");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("Không thể đọc phiên đăng nhập.");

  let session = data.session;
  if (!session || (session.expires_at && session.expires_at * 1000 <= Date.now() + SESSION_EXPIRY_SKEW_MS)) {
    const previousToken = session?.access_token ?? "";
    const refreshed = await refreshAuthSession();
    if (!refreshed || !await refreshStillBelongsToCurrentSession(refreshed, previousToken)) {
      throw sessionExpiredError();
    }
    session = refreshed;
  }

  const token = session?.access_token;
  if (!token) throw sessionExpiredError();
  return token;
}

function withAuthorization(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  // Some local Worker/Vite adapters do not forward the standard authorization
  // header to the route handler. Keep a private duplicate for that adapter;
  // the server still validates the token with Supabase before serving data.
  headers.set("x-supabase-access-token", token);
  if (typeof window !== "undefined") {
    try {
      const deviceId = window.localStorage.getItem("remix.security.device-id.v1")?.trim() ?? "";
      const sessionId = window.sessionStorage.getItem("remix.security.learning-session.v1")?.trim() ?? "";
      if (/^[0-9a-f-]{36}$/i.test(deviceId)) headers.set("x-remix-device-id", deviceId);
      if (/^[0-9a-f-]{36}$/i.test(sessionId)) headers.set("x-remix-security-session-id", sessionId);
    } catch {
      // Storage can be unavailable in privacy mode; the server still applies
      // the risk backstop to active sessions it can see.
    }
  }
  return { ...init, headers };
}

export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const requestUrl = apiRequestUrl(input);
  let token: string;
  try {
    token = await activeSessionToken();
  } catch (value) {
    if (!(value instanceof Error) || value.name !== "AuthSessionError") throw value;
    return new Response(JSON.stringify({ error: value.message, code: "AUTH_SESSION_INVALID" }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": "private, no-store" },
    });
  }
  let response = await fetch(requestUrl, withAuthorization(init, token));
  if (response.status !== 401 || !supabase) return response;

  const refreshed = await refreshAuthSession();
  const refreshedToken = refreshed?.access_token;
  if (!refreshedToken) {
    await clearInvalidLocalSession(token);
    return response;
  }
  init?.signal?.throwIfAborted();
  if (!await refreshStillBelongsToCurrentSession(refreshed, token)) return response;
  init?.signal?.throwIfAborted();
  response = await fetch(requestUrl, withAuthorization(init, refreshedToken));
  if (response.status === 401) {
    try {
      // A local route can fail to validate a perfectly valid Supabase token
      // during a transient server/runtime outage. Do not turn that route-level
      // failure into a browser-wide sign-out unless Supabase Auth also rejects
      // the refreshed token.
      const { data: verifiedUser, error: verificationError } = await supabase.auth.getUser(refreshedToken);
      if (!verificationError && verifiedUser.user) return response;
      await clearInvalidLocalSession(refreshedToken);
    } catch {
      // Keep the local session when Auth itself cannot be reached. The caller
      // still receives the original 401 and can render an actionable error.
    }
  }
  return response;
}
