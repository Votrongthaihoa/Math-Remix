"use client";

import { useSyncExternalStore } from "react";
import { adminPermissionUserFromMetadata, permissionsForUser } from "./admin-permissions";
import { apiRequestUrl } from "./api-url";
import { supabase } from "./supabase";

export type AuthUser = {
  id?: string;
  username?: string;
  email?: string;
  identifier?: string;
  avatar?: string | null;
  role?: string | null;
  emailVerified?: boolean;
  isSuperAdmin?: boolean;
  adminPermissions?: string[];
  [key: string]: unknown;
};

export type AuthTokens = { token?: string | null; refreshToken?: string | null };

export type AuthStoreState = {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isCTV: boolean;
  initialize: () => Promise<boolean>;
  trySsoRefresh: () => Promise<boolean>;
  login: (tokens: AuthTokens, user?: AuthUser | null) => void;
  updateTokens: (token: string, refreshToken?: string | null, user?: AuthUser | null) => void;
  logout: (options?: boolean | { silent?: boolean; skipAuthProvider?: boolean }) => Promise<void>;
  updateUser: (partial: Partial<AuthUser>) => void;
};

const AUTH_STORAGE_KEY = "aeck.auth.v1";
const LEGACY_JWT_KEY = "jwt";
const USER_STORAGE_KEY = "user";
const REFRESH_TOKEN_KEY = "refreshToken";
const subscribers = new Set<() => void>();

const emptyState = (): Omit<AuthStoreState, keyof Actions> => ({
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isCTV: false,
});

type Actions = Pick<AuthStoreState, "initialize" | "trySsoRefresh" | "login" | "updateTokens" | "logout" | "updateUser">;
let state: AuthStoreState;
let initializePromise: Promise<boolean> | null = null;

function storage() {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

function emit() {
  for (const subscriber of subscribers) subscriber();
}

function setState(patch: Partial<AuthStoreState>) {
  state = { ...state, ...patch };
  emit();
}

function safeJson<T>(value: string | null): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

function persist() {
  const target = storage();
  if (!target) return;
  try {
    target.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: state.token, refreshToken: state.refreshToken }));
    if (state.token && state.refreshToken) target.setItem(LEGACY_JWT_KEY, JSON.stringify({ token: state.token, refreshToken: state.refreshToken }));
    else target.removeItem(LEGACY_JWT_KEY);
    if (state.refreshToken) target.setItem(REFRESH_TOKEN_KEY, state.refreshToken); else target.removeItem(REFRESH_TOKEN_KEY);
    if (state.user) target.setItem(USER_STORAGE_KEY, JSON.stringify(state.user)); else target.removeItem(USER_STORAGE_KEY);
  } catch {
    // Private browsing and storage quota errors must not make auth unusable.
  }
}

function clearPersisted() {
  const target = storage();
  if (!target) return;
  try {
    for (const key of [AUTH_STORAGE_KEY, LEGACY_JWT_KEY, USER_STORAGE_KEY, REFRESH_TOKEN_KEY]) target.removeItem(key);
  } catch { /* storage is optional */ }
}

function decodeJwtPayload(token: string) {
  const encoded = token.split(".")[1];
  if (!encoded) return null;
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const json = typeof atob === "function" ? atob(normalized) : Buffer.from(normalized, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch { return null; }
}

export function isJwtExpired(token: string, now = Date.now()) {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  return typeof exp !== "number" || !Number.isFinite(exp) || exp <= 0 || exp * 1_000 <= now;
}

export function persistedUserWithoutAuthorization(user: AuthUser | null) {
  if (!user) return null;
  const identity = { ...user };
  delete identity.role;
  delete identity.isSuperAdmin;
  delete identity.adminPermissions;
  return identity;
}

function ctvRole(user: AuthUser | null) {
  return [user?.role, ...(Array.isArray(user?.adminPermissions) ? user.adminPermissions : [])]
    .filter(Boolean)
    .some(value => String(value).toLocaleLowerCase("vi") === "ctv" || String(value).toLocaleLowerCase("vi") === "collaborator");
}

export function authUserFromSupabaseUser(value: {
  id?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  email_confirmed_at?: string | null;
} | null): AuthUser | null {
  if (!value) return null;
  const userMetadata = value.user_metadata ?? {};
  const appMetadata = value.app_metadata ?? {};
  const role = typeof appMetadata.role === "string" ? appMetadata.role : "student";
  const permissionUser = adminPermissionUserFromMetadata(role, appMetadata);
  const hasPermissionClaim = permissionUser.adminPermissions !== undefined;
  return {
    id: value.id,
    email: value.email,
    username: typeof userMetadata.username === "string" ? userMetadata.username : undefined,
    avatar: typeof userMetadata.avatar_url === "string" ? userMetadata.avatar_url : null,
    role,
    emailVerified: Boolean(value.email_confirmed_at),
    isSuperAdmin: permissionUser.isSuperAdmin,
    adminPermissions: hasPermissionClaim ? permissionsForUser(permissionUser) : undefined,
  };
}

async function tryExternalSsoRefresh() {
  if (typeof fetch !== "function") return null;
  try {
    const response = await fetch(apiRequestUrl("/auth/refresh-token"), { method: "POST", credentials: "include", headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null) as { token?: string; accessToken?: string; refreshToken?: string; user?: AuthUser } | null;
    const token = payload?.token ?? payload?.accessToken;
    return token ? { token, refreshToken: payload?.refreshToken ?? null, user: payload?.user ?? null } : null;
  } catch { return null; }
}

export async function trySsoRefresh() {
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.access_token) return tryExternalSsoRefresh();
      const claimsResult = await supabase.auth.getClaims(session.access_token);
      const claims = claimsResult.data?.claims;
      if (claimsResult.error || claims?.sub !== session.user.id) return null;
      const user = authUserFromSupabaseUser({
        ...session.user,
        app_metadata: claims.app_metadata as Record<string, unknown> | undefined,
      });
      if (session?.access_token && user?.role?.toLocaleLowerCase() === "admin") return null;
      if (session?.access_token) return { token: session.access_token, refreshToken: session.refresh_token ?? null, user };
    } catch { /* fall through to legacy SSO */ }
  }
  return tryExternalSsoRefresh();
}

async function initialize() {
  if (initializePromise) return initializePromise;
  initializePromise = (async () => {
    setState({ isLoading: true });
    const target = storage();
    // localStorage is only a convenience cache. Never restore role or
    // permissions from it; verified Auth app_metadata/profile data repopulates
    // authorization fields after session validation.
    const storedUser = persistedUserWithoutAuthorization(safeJson<AuthUser>(target?.getItem(USER_STORAGE_KEY) ?? null));
    // A syntactically valid local JWT is still user-controlled data. Restore
    // authentication only after Supabase (or the same-origin refresh endpoint)
    // returns the currently valid session; never admit the cached token alone.
    const refreshed = await trySsoRefresh();
    if (refreshed?.token && !isJwtExpired(refreshed.token)) {
      const user = refreshed.user ?? storedUser;
      setState({ token: refreshed.token, refreshToken: refreshed.refreshToken, user, isAuthenticated: true, isCTV: ctvRole(user), isLoading: false });
      persist();
      return true;
    }
    setState({ ...emptyState(), isLoading: false });
    clearPersisted();
    return false;
  })().finally(() => { initializePromise = null; });
  return initializePromise;
}

async function logout(options: boolean | { silent?: boolean; skipAuthProvider?: boolean } = {}) {
  const silent = typeof options === "boolean" ? options : Boolean(options.silent);
  const skipAuthProvider = typeof options === "boolean" ? false : Boolean(options.skipAuthProvider);
  const oldToken = state.token;
  setState({ ...emptyState(), isLoading: false });
  clearPersisted();
  if (supabase && !skipAuthProvider) await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  if (!silent && typeof window !== "undefined") {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    if (window.location.pathname !== "/login") window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  void oldToken;
}

function login(tokens: AuthTokens, user: AuthUser | null = null) {
  const token = tokens.token?.trim() || null;
  const nextUser = user ?? state.user;
  setState({ token, refreshToken: tokens.refreshToken?.trim() || null, user: nextUser, isAuthenticated: Boolean(token), isLoading: false, isCTV: ctvRole(nextUser) });
  persist();
}

function updateTokens(token: string, refreshToken: string | null = state.refreshToken, user: AuthUser | null = state.user) {
  login({ token, refreshToken }, user);
}

function updateUser(partial: Partial<AuthUser>) {
  const user = { ...(state.user ?? {}), ...partial };
  setState({ user, isCTV: ctvRole(user) });
  persist();
}

const actions: Actions = { initialize, trySsoRefresh: async () => {
  const refreshed = await trySsoRefresh();
  if (!refreshed?.token) return false;
  const user = refreshed.user ?? state.user;
  setState({ token: refreshed.token, refreshToken: refreshed.refreshToken, user, isAuthenticated: true, isLoading: false, isCTV: ctvRole(user) });
  persist();
  return true;
}, login, updateTokens, logout, updateUser };

state = { ...emptyState(), ...actions };

export function useAuthStore<T = AuthStoreState>(selector?: (value: AuthStoreState) => T): T {
  return useSyncExternalStore(
    callback => { subscribers.add(callback); return () => subscribers.delete(callback); },
    () => selector ? selector(state) : state as T,
    () => selector ? selector(state) : state as T,
  );
}

useAuthStore.getState = () => state;
useAuthStore.setState = (patch: Partial<AuthStoreState>) => setState(patch);
useAuthStore.subscribe = (callback: () => void) => { subscribers.add(callback); return () => subscribers.delete(callback); };
useAuthStore.initialize = initialize;
useAuthStore.trySsoRefresh = actions.trySsoRefresh;
useAuthStore.login = login;
useAuthStore.updateTokens = updateTokens;
useAuthStore.logout = logout;
useAuthStore.updateUser = updateUser;

export function getCurrentUser() { return state.user; }
export const authStorageKeys = { AUTH_STORAGE_KEY, LEGACY_JWT_KEY, USER_STORAGE_KEY, REFRESH_TOKEN_KEY } as const;
