import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { registerTestLoader } from "./support/test-loader.mjs";

const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const PREVIOUS_SESSION_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const TOKEN = "synthetic-access-token";

const moduleUrl = new URL("../lib/security-session-client.ts", import.meta.url).href;
await registerTestLoader([{ parentURL: moduleUrl, specifier: "./api-url", appendExtension: ".ts" }]);
const securityClient = await import(moduleUrl);

function storage(initial = {}, options = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    values,
    calls,
    getItem(key) {
      calls.push(["getItem", key]);
      if (options.throwOnRead) throw new Error("synthetic storage read failure");
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      calls.push(["setItem", key, value]);
      if (options.throwOnWrite) throw new Error("synthetic storage write failure");
      values.set(key, value);
    },
    removeItem(key) {
      calls.push(["removeItem", key]);
      if (options.throwOnWrite) throw new Error("synthetic storage write failure");
      values.delete(key);
    },
  };
}

function response(payload, status = 200) {
  return Response.json(payload, { status });
}

test("device identity reuses a valid UUID and replaces malformed storage", () => {
  const valid = storage({ [securityClient.SECURITY_DEVICE_STORAGE_KEY]: DEVICE_ID });
  assert.equal(securityClient.getOrCreateSecurityDeviceId({ localStorage: valid, randomUUID: () => assert.fail("must not regenerate") }), DEVICE_ID);

  const malformed = storage({ [securityClient.SECURITY_DEVICE_STORAGE_KEY]: "../../bad-device" });
  assert.equal(securityClient.getOrCreateSecurityDeviceId({ localStorage: malformed, randomUUID: () => DEVICE_ID }), DEVICE_ID);
  assert.equal(malformed.values.get(securityClient.SECURITY_DEVICE_STORAGE_KEY), DEVICE_ID);
});

test("login risk gate posts a pinned idle session and persists only a valid returned session", async () => {
  const local = storage({ [securityClient.SECURITY_DEVICE_STORAGE_KEY]: DEVICE_ID });
  const session = storage({ [securityClient.SECURITY_SESSION_STORAGE_KEY]: PREVIOUS_SESSION_ID });
  const calls = [];
  const result = await securityClient.startLoginSecuritySession({
    accessToken: TOKEN,
    localStorage: local,
    sessionStorage: session,
    userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0",
    fetcher: async (...args) => {
      calls.push(args);
      return response({ allowed: true, sessionId: SESSION_ID, warning: null });
    },
  });

  assert.deepEqual(result, { allowed: true, sessionId: SESSION_ID, exempt: false, warning: null });
  assert.equal(session.values.get(securityClient.SECURITY_SESSION_STORAGE_KEY), SESSION_ID);
  assert.equal(calls.length, 1);
  const [url, init] = calls[0];
  assert.match(String(url), /\/api\/security\/session$/);
  assert.equal(init.method, "POST");
  assert.equal(init.cache, "no-store");
  assert.equal(init.headers.get("authorization"), `Bearer ${TOKEN}`);
  assert.equal(init.headers.get("x-supabase-access-token"), TOKEN);
  assert.equal(init.headers.get("x-remix-device-id"), DEVICE_ID);
  assert.equal(init.headers.get("x-remix-security-session-id"), PREVIOUS_SESSION_ID);
  assert.deepEqual(JSON.parse(init.body), {
    action: "start",
    sessionId: PREVIOUS_SESSION_ID,
    deviceId: DEVICE_ID,
    activityType: "idle",
    resourceId: "login",
    browser: "Google Chrome",
    operatingSystem: "Windows",
    deviceName: "Google Chrome trên Windows",
  });
});

test("admin exemption is an explicit allow and clears a learner session id", async () => {
  const local = storage({ [securityClient.SECURITY_DEVICE_STORAGE_KEY]: DEVICE_ID });
  const session = storage({ [securityClient.SECURITY_SESSION_STORAGE_KEY]: PREVIOUS_SESSION_ID });
  const result = await securityClient.startLoginSecuritySession({
    accessToken: TOKEN,
    localStorage: local,
    sessionStorage: session,
    fetcher: async () => response({ allowed: true, exempt: true }),
  });
  assert.deepEqual(result, { allowed: true, sessionId: null, exempt: true, warning: undefined });
  assert.equal(session.values.has(securityClient.SECURITY_SESSION_STORAGE_KEY), false);
});

test("denials and service failures fail closed with sanitized Vietnamese errors", async () => {
  const cases = [
    [async () => response({ allowed: false, code: "DEVICE_LIMIT_REACHED", message: "private backend detail" }, 409), /giới hạn thiết bị/i],
    [async () => response({ error: "private proxy detail" }, 503), /xác minh an toàn/i],
    [async () => { throw new Error("private network hostname"); }, /xác minh an toàn/i],
    [async () => response({ allowed: true }), /xác minh an toàn/i],
  ];
  for (const [fetcher, expectedMessage] of cases) {
    const result = await securityClient.startLoginSecuritySession({
      accessToken: TOKEN,
      localStorage: storage({ [securityClient.SECURITY_DEVICE_STORAGE_KEY]: DEVICE_ID }),
      sessionStorage: storage(),
      fetcher,
    });
    assert.equal(result.allowed, false);
    assert.match(result.message, expectedMessage);
    assert.doesNotMatch(result.message, /private|backend|proxy|hostname/i);
  }
});

test("unavailable UUID generation fails before network work", async () => {
  let fetched = false;
  const result = await securityClient.startLoginSecuritySession({
    accessToken: TOKEN,
    localStorage: storage(),
    sessionStorage: storage(),
    randomUUID: () => "not-a-uuid",
    fetcher: async () => { fetched = true; return response({ allowed: true, sessionId: SESSION_ID }); },
  });
  assert.equal(result.allowed, false);
  assert.equal(fetched, false);
});

test("session ownership requires both the exact user and token", () => {
  const current = { user: { id: "user-a" }, access_token: "token-a" };
  assert.equal(securityClient.loginSessionMatches(current, "user-a", "token-a"), true);
  assert.equal(securityClient.loginSessionMatches(current, "user-b", "token-a"), false);
  assert.equal(securityClient.loginSessionMatches(current, "user-a", "token-b"), false);
  assert.equal(securityClient.loginSessionMatches(null, "user-a", "token-a"), false);
});

test("password login runs the risk gate before profile admission and navigation", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");
  const loginStart = platform.indexOf("async function login(e: React.FormEvent)");
  const loginEnd = platform.indexOf("async function signup(e: React.FormEvent)", loginStart);
  const source = platform.slice(loginStart, loginEnd);
  const passwordAuth = source.indexOf("signInWithPassword");
  const riskGate = source.indexOf("startLoginSecuritySession");
  const profileGate = source.indexOf("loadUserData");
  const admission = source.indexOf("setSignedIn(true)");
  const navigation = source.indexOf("router.replace");
  assert.ok(passwordAuth >= 0 && passwordAuth < riskGate);
  assert.ok(riskGate < profileGate && profileGate < admission && admission < navigation);
  assert.match(source, /loginSessionMatches/);
  assert.match(source, /authOperationRef\.current === operationId/);
  assert.match(source, /if \(!security\.allowed\)[\s\S]*?signOut\(\{ scope: "local" \}\)/);
});
