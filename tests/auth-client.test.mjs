import assert from "node:assert/strict";
import test from "node:test";
import { registerTestLoader } from "./support/test-loader.mjs";
import { setSupabase } from "./support/supabase-auth-stub.mjs";

const NOW = 1_800_000_000_000;
const session = (token = "old-token", userId = "user-a", expiresAt = NOW / 1000 + 3600) => ({ access_token: token, expires_at: expiresAt, user: { id: userId } });
const authResult = value => ({ data: { session: value }, error: null });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
};
// Import the production module once. The previous harness appended a unique
// query string for every test so each case got a fresh module-level
// refreshPromise, but Node's coverage reporter then counted every copy as a
// separate source file. The live test binding below preserves branch coverage
// while still exercising configured and missing-Supabase cases.
let activeHarness = null;
const sharedAuth = {};
for (const name of ["getSession", "refreshSession", "getUser", "signOut"]) {
  sharedAuth[name] = (...args) => {
    const current = activeHarness;
    if (!current) throw new Error(`No active auth-client test harness for ${name}`);
    current.calls[name].push(args);
    return current.implementations[name](...args);
  };
}
const sharedModuleUrl = new URL("../lib/auth-client.ts", import.meta.url).href;
const sharedStubUrl = new URL("./support/supabase-auth-stub.mjs", import.meta.url).href;
await registerTestLoader([
  { parentURL: sharedModuleUrl, specifier: "./supabase", url: sharedStubUrl },
  { parentURL: sharedModuleUrl, specifier: "./api-url", appendExtension: ".ts" },
]);
const sharedApi = await import(sharedModuleUrl);

async function harness(t, overrides = {}, options = {}) {
  t.mock.method(Date, "now", () => NOW);
  const calls = { getSession: [], refreshSession: [], getUser: [], signOut: [], fetch: [] };
  const state = { session: session() };
  const implementations = {
    getSession: async () => authResult(state.session),
    refreshSession: async () => { state.session = session("fresh-token"); return authResult(state.session); },
    getUser: async () => ({ data: { user: { id: "user-a" } }, error: null }),
    signOut: async () => { state.session = null; return { error: null }; },
    ...overrides,
  };
  // The shared module's Supabase dependency dispatches to this harness through
  // a live ES module binding, including the missing-configuration branch.
  const context = { calls, state, implementations };
  activeHarness = context;
  t.after(() => { if (activeHarness === context) activeHarness = null; });
  setSupabase(options.supabase === false ? null : { auth: sharedAuth });
  t.mock.method(globalThis, "fetch", async (...args) => {
    calls.fetch.push(args);
    assert.ok(implementations.fetch, "Unexpected fetch; tests must explicitly script all network calls");
    return implementations.fetch(...args);
  });
  return { ...sharedApi, calls, state, implementations };
}

test("missing Supabase configuration fails closed before protected network work", async t => {
  const h = await harness(t, {}, { supabase: false });
  await assert.rejects(h.activeSessionToken(), /Chưa cấu hình Supabase/);
  await assert.rejects(h.authenticatedFetch("https://example.invalid/protected"), /Chưa cấu hình Supabase/);
  assert.equal(h.calls.fetch.length, 0);
});

test("unexpired session returns its token without refreshing", async t => {
  const h = await harness(t);
  assert.equal(await h.activeSessionToken(), "old-token");
  assert.equal(h.calls.refreshSession.length, 0);
});

test("parallel near-expiry requests share one refresh and the single-flight resets afterward", async t => {
  const started = deferred();
  const refresh = deferred();
  const h = await harness(t, { refreshSession: () => { started.resolve(); return refresh.promise; } });
  h.state.session = session("expiring", "user-a", NOW / 1000 + 30);
  const pending = [h.activeSessionToken(), h.activeSessionToken(), h.activeSessionToken()];
  await started.promise;
  assert.equal(h.calls.refreshSession.length, 1);
  refresh.resolve(authResult(session("shared-token")));
  assert.deepEqual(await Promise.all(pending), ["shared-token", "shared-token", "shared-token"]);
  h.implementations.refreshSession = async () => authResult(session("next-refresh"));
  assert.equal(await h.activeSessionToken(), "next-refresh");
  assert.equal(h.calls.refreshSession.length, 2);
});

test("first 401 refreshes and retries exactly once with both new auth headers", async t => {
  const first = new Response("expired", { status: 401 });
  const success = new Response("ok");
  const h = await harness(t);
  h.implementations.fetch = async () => h.calls.fetch.length === 1 ? first : success;
  const controller = new AbortController();
  const headers = new Headers({ "x-request-id": "synthetic", authorization: "Bearer supplied-stale-token" });
  const init = { method: "POST", body: "synthetic body", headers, signal: controller.signal };
  assert.equal(await h.authenticatedFetch("https://example.invalid/protected", init), success);
  assert.equal(h.calls.fetch.length, 2);
  for (const [index, [url, sent]] of h.calls.fetch.entries()) {
    const token = index === 0 ? "old-token" : "fresh-token";
    assert.equal(url, "https://example.invalid/protected");
    assert.equal(sent.headers.get("authorization"), `Bearer ${token}`);
    assert.equal(sent.headers.get("x-supabase-access-token"), token);
    assert.equal(sent.headers.get("x-request-id"), "synthetic");
    assert.equal(sent.signal, controller.signal);
    assert.equal(sent.body, init.body);
    assert.equal(sent.method, "POST");
  }
  assert.equal(headers.get("authorization"), "Bearer supplied-stale-token");
  assert.equal(h.calls.refreshSession.length, 1);
  assert.equal(h.calls.getUser.length, 0);
  assert.equal(h.calls.signOut.length, 0);
});

test("parallel first-401 responses share the in-flight refresh", async t => {
  const bothFirstRequests = deferred();
  const started = deferred();
  const refresh = deferred();
  let originals = 0;
  const h = await harness(t, {
    refreshSession: () => { started.resolve(); return refresh.promise; },
    fetch: async (_url, init) => {
      if (init.headers.get("x-supabase-access-token") === "old-token") {
        if (++originals === 2) bothFirstRequests.resolve();
        await bothFirstRequests.promise;
        return new Response(null, { status: 401 });
      }
      return new Response("ok");
    },
  });
  const pending = [h.authenticatedFetch("https://example.invalid/a"), h.authenticatedFetch("https://example.invalid/b")];
  await started.promise;
  assert.equal(h.calls.refreshSession.length, 1);
  refresh.resolve(authResult(session("shared-token")));
  assert.deepEqual((await Promise.all(pending)).map(response => response.status), [200, 200]);
  assert.equal(h.calls.fetch.length, 4);
  assert.equal(h.calls.refreshSession.length, 1);
});

for (const [label, verification, signsOut] of [
  ["valid Auth identity", async () => ({ data: { user: { id: "user-a" } }, error: null }), false],
  ["rejected Auth identity", async () => ({ data: { user: null }, error: { message: "invalid" } }), true],
  ["unreachable Auth service", async () => { throw new Error("synthetic network failure"); }, false],
]) {
  test(`second 401 with ${label} never retries again`, async t => {
    const h = await harness(t, { getUser: verification });
    const responses = [new Response("first", { status: 401 }), new Response("second", { status: 401 })];
    h.implementations.fetch = async () => responses[h.calls.fetch.length - 1];
    assert.equal(await h.authenticatedFetch("https://example.invalid/protected"), responses[1]);
    assert.equal(h.calls.fetch.length, 2);
    assert.equal(h.calls.refreshSession.length, 1);
    assert.deepEqual(h.calls.getUser, [["fresh-token"]]);
    assert.deepEqual(h.calls.signOut, signsOut ? [[{ scope: "local" }]] : []);
  });
}

for (const throws of [false, true]) {
  test(`refresh ${throws ? "rejection" : "error response"} preserves first 401 and clears only the invalid local session`, async t => {
    const h = await harness(t, { refreshSession: async () => {
      if (throws) throw new Error("synthetic refresh failure");
      return { data: { session: null }, error: { message: "invalid refresh" } };
    } });
    const response = new Response("original", { status: 401 });
    h.implementations.fetch = async () => response;
    assert.equal(await h.authenticatedFetch("https://example.invalid/protected"), response);
    assert.equal(h.calls.fetch.length, 1);
    assert.deepEqual(h.calls.signOut, [[{ scope: "local" }]]);
  });
}

test("initial refresh failure returns private session-invalid JSON without issuing a request", async t => {
  const h = await harness(t, { refreshSession: async () => authResult(null) });
  h.state.session = null;
  const response = await h.authenticatedFetch("https://example.invalid/protected");
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "AUTH_SESSION_INVALID");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(h.calls.fetch.length, 0);
  assert.equal(h.calls.signOut.length, 0);
});

test("getSession read errors propagate and do not refresh, fetch, or sign out", async t => {
  const h = await harness(t, { getSession: async () => ({ data: { session: null }, error: { message: "storage unavailable" } }) });
  await assert.rejects(h.authenticatedFetch("https://example.invalid/protected"), /Không thể đọc phiên đăng nhập/);
  assert.equal(h.calls.fetch.length, 0);
  assert.equal(h.calls.refreshSession.length, 0);
  assert.equal(h.calls.signOut.length, 0);
});

test("aborted first fetch propagates AbortError without refresh or sign-out", async t => {
  const controller = new AbortController();
  const started = deferred();
  const h = await harness(t, { fetch: async (_url, init) => {
    started.resolve();
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }));
  } });
  const pending = h.authenticatedFetch("https://example.invalid/protected", { signal: controller.signal });
  const rejected = assert.rejects(pending, error => error.name === "AbortError");
  await started.promise;
  controller.abort();
  await rejected;
  assert.equal(h.calls.refreshSession.length, 0);
  assert.equal(h.calls.signOut.length, 0);
});

test("abort during refresh is forwarded to the retry and does not verify or sign out", async t => {
  const controller = new AbortController();
  const started = deferred();
  const refresh = deferred();
  const h = await harness(t, { refreshSession: () => { started.resolve(); return refresh.promise; } });
  h.implementations.fetch = async (_url, init) => {
    init.signal.throwIfAborted();
    return new Response(null, { status: 401 });
  };
  const pending = h.authenticatedFetch("https://example.invalid/protected", { signal: controller.signal });
  const rejected = assert.rejects(pending, error => error.name === "AbortError");
  await started.promise;
  controller.abort();
  refresh.resolve(authResult(session("fresh-token")));
  await rejected;
  assert.equal(h.calls.getUser.length, 0);
  assert.equal(h.calls.signOut.length, 0);
});

test("failed old refresh cannot sign out a newer user session", async t => {
  const started = deferred();
  const refresh = deferred();
  const h = await harness(t, { refreshSession: () => { started.resolve(); return refresh.promise; }, fetch: async () => new Response(null, { status: 401 }) });
  const pending = h.authenticatedFetch("https://example.invalid/protected");
  await started.promise;
  h.state.session = session("new-user-token", "user-b");
  refresh.resolve(authResult(null));
  assert.equal((await pending).status, 401);
  assert.equal(h.calls.signOut.length, 0);
  assert.equal(h.state.session.user.id, "user-b");
});

test("late rejection of refreshed old token cannot sign out a newer session", async t => {
  const started = deferred();
  const verification = deferred();
  const h = await harness(t, { getUser: () => { started.resolve(); return verification.promise; }, fetch: async () => new Response(null, { status: 401 }) });
  const pending = h.authenticatedFetch("https://example.invalid/protected");
  await started.promise;
  h.state.session = session("new-user-token", "user-b");
  verification.resolve({ data: { user: null }, error: { message: "invalid old token" } });
  assert.equal((await pending).status, 401);
  assert.equal(h.calls.signOut.length, 0);
});

test("invalid-session cleanup tolerates storage and sign-out failures", async t => {
  let reads = 0;
  const h = await harness(t, {
    getSession: async () => {
      if (++reads === 1) return authResult(h.state.session);
      throw new Error("synthetic storage failure during cleanup");
    },
    refreshSession: async () => authResult(null),
    signOut: async () => { throw new Error("synthetic sign-out failure"); },
    fetch: async () => new Response("expired", { status: 401 }),
  });
  const response = await h.authenticatedFetch("https://example.invalid/protected");
  assert.equal(response.status, 401);
  assert.equal(h.calls.fetch.length, 1);
  assert.equal(h.calls.signOut.length, 1);
  assert.equal(reads, 2);
});

// Intended session-generation safety contracts: the client currently has no
// generation/logout signal. These executable TODOs expose the gap rather than
// asserting that replay under a stale identity is correct.
for (const switched of [false, true]) {
  test.todo(`a late refresh must not replay the old request after ${switched ? "user switch" : "logout"}`, async t => {
    const started = deferred();
    const refresh = deferred();
    const h = await harness(t, { refreshSession: () => { started.resolve(); return refresh.promise; } });
    h.implementations.fetch = async () => new Response(null, { status: h.calls.fetch.length === 1 ? 401 : 200 });
    const pending = h.authenticatedFetch("https://example.invalid/protected");
    await started.promise;
    h.state.session = switched ? session("new-user-token", "user-b") : null;
    refresh.resolve(authResult(session("late-old-user-token")));
    await pending;
    assert.equal(h.calls.fetch.length, 1, "Requests from a previous session generation must not be replayed");
  });
}
