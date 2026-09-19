import assert from "node:assert/strict";
import test from "node:test";
import { registerTestLoader } from "./support/test-loader.mjs";

const storeUrl = new URL("../lib/auth-store.ts", import.meta.url);
await registerTestLoader([
  { specifier: "./supabase", url: new URL("./support/supabase-auth-stub.mjs", import.meta.url).href },
  { specifier: "./api-url", appendExtension: ".ts" },
  { specifier: "./admin-permissions", appendExtension: ".ts" },
]);

test("auth store exposes a persistent token/user state and derived CTV flag", async () => {
  const store = await import(`${storeUrl.href}?contract=1`);
  store.useAuthStore.logout({ silent: true });
  store.useAuthStore.login({ token: "token-1", refreshToken: "refresh-1" }, { id: "u1", role: "CTV", email: "a@example.test" });
  const state = store.useAuthStore.getState();
  assert.equal(state.token, "token-1");
  assert.equal(state.refreshToken, "refresh-1");
  assert.equal(state.isAuthenticated, true);
  assert.equal(state.isCTV, true);
  assert.equal(store.getCurrentUser()?.email, "a@example.test");
  store.useAuthStore.logout({ silent: true });
});

test("expired, malformed, and expiry-less JWTs fail closed", async () => {
  const store = await import(`${storeUrl.href}?contract=2`);
  const payload = Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url");
  assert.equal(store.isJwtExpired(`header.${payload}.signature`), true);
  const future = Buffer.from(JSON.stringify({ exp: Date.now() / 1_000 + 60 })).toString("base64url");
  const noExpiry = Buffer.from(JSON.stringify({ sub: "user-a" })).toString("base64url");
  assert.equal(store.isJwtExpired(`header.${future}.signature`), false);
  assert.equal(store.isJwtExpired(`header.${noExpiry}.signature`), true);
  assert.equal(store.isJwtExpired("not-a-jwt"), true);
});

test("Supabase users never receive authorization fields from user_metadata", async () => {
  const store = await import(`${storeUrl.href}?contract=3`);
  const user = store.authUserFromSupabaseUser({
    id: "u-safe",
    email: "safe@example.test",
    user_metadata: {
      username: "Tên hiển thị",
      avatar_url: "https://example.test/avatar.png",
      role: "admin",
      admin_permissions: ["finance"],
      is_super_admin: true,
    },
    app_metadata: {
      role: "student",
      admin_permissions: ["courses", "unknown"],
      is_super_admin: false,
    },
    email_confirmed_at: "2026-09-15T00:00:00.000Z",
  });

  assert.equal(user.role, "student");
  assert.deepEqual(user.adminPermissions, ["courses"]);
  assert.equal(user.isSuperAdmin, false);
  assert.equal(user.username, "Tên hiển thị");
  assert.equal(user.emailVerified, true);
});

test("persisted browser identity cannot restore authorization fields", async () => {
  const store = await import(`${storeUrl.href}?contract=4`);
  assert.deepEqual(store.persistedUserWithoutAuthorization({
    id: "u-local",
    email: "local@example.test",
    role: "admin",
    isSuperAdmin: true,
    adminPermissions: ["users"],
  }), {
    id: "u-local",
    email: "local@example.test",
  });
});

test("a forged future local JWT cannot bootstrap authentication without provider validation", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() / 1_000 + 3_600, sub: "forged-admin" })).toString("base64url");
  const values = new Map([
    ["aeck.auth.v1", JSON.stringify({ token: `header.${payload}.signature`, refreshToken: "forged-refresh" })],
    ["user", JSON.stringify({ id: "forged-admin", role: "admin", isSuperAdmin: true, adminPermissions: ["users"] })],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    },
    location: { pathname: "/dashboard", search: "", assign() {} },
  };
  globalThis.fetch = async () => new Response(null, { status: 401 });
  try {
    const store = await import(`${storeUrl.href}?contract=5`);
    assert.equal(await store.useAuthStore.initialize(), false);
    assert.equal(store.useAuthStore.getState().isAuthenticated, false);
    assert.equal(store.useAuthStore.getState().user, null);
    assert.equal(values.has("aeck.auth.v1"), false);
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});
