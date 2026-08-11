import { supabase } from "./supabase";
import type { Session } from "@supabase/supabase-js";

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

async function clearInvalidLocalSession(expectedToken?: string) {
  if (!supabase) return;
  if (expectedToken) {
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    // A request from the previous login must never sign out a newer login.
    if (data.session?.access_token && data.session.access_token !== expectedToken) return;
  }
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
}

export async function activeSessionToken() {
  if (!supabase) throw new Error("Chưa cấu hình Supabase.");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("Không thể đọc phiên đăng nhập.");

  let session = data.session;
  if (!session || (session.expires_at && session.expires_at * 1000 <= Date.now() + SESSION_EXPIRY_SKEW_MS)) {
    session = await refreshAuthSession();
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
  return { ...init, headers };
}

export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit) {
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
  let response = await fetch(input, withAuthorization(init, token));
  if (response.status !== 401 || !supabase) return response;

  const refreshed = await refreshAuthSession();
  const refreshedToken = refreshed?.access_token;
  if (!refreshedToken) {
    await clearInvalidLocalSession(token);
    return response;
  }
  response = await fetch(input, withAuthorization(init, refreshedToken));
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
