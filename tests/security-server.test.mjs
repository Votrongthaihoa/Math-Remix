import assert from "node:assert/strict";
import test from "node:test";

import {
  activeAccount,
  authenticatedSecurityUser,
  banPayload,
  ensureActiveAccount,
  hashedRequestIp,
  haversineKm,
  requestLocation,
  resolveAuthUser,
  riskScore,
} from "../lib/security-server.ts";

const baseProfile = {
  id: "student-1",
  role: "student",
  status: "active",
  account_status: "active",
  violation_count: 0,
  banned_at: null,
  banned_until: null,
  ban_reason: null,
  ban_event_id: null,
};

const user = { id: "student-1", aud: "authenticated", role: "authenticated" };

function fakeAdmin({ authUser = user, authError = null, throwAuth = false, profile = baseProfile, profileError = null } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      async getUser(token) {
        calls.push(["getUser", token]);
        if (throwAuth) throw new Error("synthetic auth transport failure");
        return { data: { user: authUser }, error: authError };
      },
    },
    from(table) {
      assert.equal(table, "profiles");
      calls.push(["from", table]);
      const chain = {
        select(fields) {
          calls.push(["select", fields]);
          return chain;
        },
        eq(field, value) {
          calls.push(["eq", field, value]);
          return chain;
        },
        async single() {
          calls.push(["single"]);
          return { data: profile, error: profileError };
        },
        update(values) {
          calls.push(["update", values]);
          return {
            async eq(field, value) {
              calls.push(["update.eq", field, value]);
              return { data: null, error: null };
            },
          };
        },
      };
      return chain;
    },
  };
}

function requestWithToken(token = "synthetic-token") {
  return new Request("https://synthetic.test/api/security", {
    headers: { authorization: `Bearer ${token}` },
  });
}

test("activeAccount fails closed for locked/permanently banned/future temporary accounts", () => {
  assert.equal(activeAccount({ ...baseProfile }), true);
  assert.equal(activeAccount({ ...baseProfile, status: "locked" }), false);
  assert.equal(activeAccount({ ...baseProfile, account_status: "permanently_banned" }), false);
  assert.equal(activeAccount({ ...baseProfile, account_status: "temporarily_banned", banned_until: "2999-01-01T00:00:00.000Z" }), false);
  assert.equal(activeAccount({ ...baseProfile, account_status: "temporarily_banned", banned_until: "2020-01-01T00:00:00.000Z" }), true);
  assert.equal(activeAccount({ ...baseProfile, account_status: "temporarily_banned", banned_until: "not-a-date" }), false);
});

test("banPayload exposes safe status metadata and stable event codes without identity data", () => {
  const temporary = banPayload({
    ...baseProfile,
    account_status: "temporarily_banned",
    banned_at: "2026-09-11T10:20:30.000Z",
    banned_until: "2026-09-12T10:20:30.000Z",
    violation_count: 3,
    ban_event_id: 42,
  });
  assert.equal(temporary.allowed, false);
  assert.equal(temporary.code, "ACCOUNT_TEMPORARILY_BANNED");
  assert.equal(temporary.eventCode, "SEC-20260911-000042");
  assert.equal(temporary.violationNumber, 3);
  assert.equal("id" in temporary, false);
  assert.equal("email" in temporary, false);

  const locked = banPayload({ ...baseProfile, status: "locked", ban_reason: "Synthetic reason" });
  assert.equal(locked.code, "ACCOUNT_PERMANENTLY_BANNED");
  assert.equal(locked.reason, "Synthetic reason");
  assert.equal(locked.eventCode, null);
});

test("requestLocation prefers trusted request metadata, truncates strings, and normalizes coordinates", () => {
  const request = new Request("https://synthetic.test");
  Object.defineProperty(request, "cf", {
    configurable: true,
    value: {
      country: "US",
      regionCode: "R".repeat(100),
      city: "C".repeat(140),
      latitude: "10.25",
      longitude: 106.75,
    },
  });
  assert.deepEqual(requestLocation(request), {
    countryCode: "US",
    regionCode: "R".repeat(80),
    city: "C".repeat(100),
    latitude: 10.25,
    longitude: 106.75,
  });

  const headerOnly = new Request("https://synthetic.test", { headers: { "cf-ipcountry": "VN" } });
  assert.deepEqual(requestLocation(headerOnly), {
    countryCode: "VN", regionCode: null, city: null, latitude: null, longitude: null,
  });
});

test("haversineKm returns rounded distance or null when coordinates are incomplete", () => {
  assert.equal(haversineKm({ latitude: null, longitude: 0 }, { latitude: 0, longitude: 0 }), null);
  assert.equal(haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  assert.equal(haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }), 111.2);
});

test("riskScore applies activity, distance, repetition, trust, and lower-bound rules", () => {
  const score = riskScore({
    verifiedDevice: false,
    sameDevice: false,
    activeConflict: true,
    sameActivity: true,
    activityType: "exam",
    distanceKm: 600,
    regionChanged: true,
    repeated7d: true,
    repeated24h: true,
    trustedByAdmin: false,
    previousInactive: false,
  });
  assert.equal(score, 250);
  assert.equal(riskScore({
    verifiedDevice: true,
    sameDevice: true,
    activeConflict: false,
    sameActivity: false,
    activityType: "idle",
    distanceKm: null,
    regionChanged: false,
    repeated7d: false,
    repeated24h: false,
    trustedByAdmin: true,
    previousInactive: true,
  }), 0);
});

test("hashedRequestIp is deterministic per secret and does not expose the source IP", async t => {
  const previousSecret = process.env.SECURITY_IP_HASH_SECRET;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.SECURITY_IP_HASH_SECRET;
    else process.env.SECURITY_IP_HASH_SECRET = previousSecret;
  });
  process.env.SECURITY_IP_HASH_SECRET = "synthetic-hmac-secret";
  const first = await hashedRequestIp(new Request("https://synthetic.test", { headers: { "cf-connecting-ip": "203.0.113.10" } }));
  const same = await hashedRequestIp(new Request("https://synthetic.test", { headers: { "cf-connecting-ip": "203.0.113.10" } }));
  const other = await hashedRequestIp(new Request("https://synthetic.test", { headers: { "cf-connecting-ip": "203.0.113.11" } }));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, same);
  assert.notEqual(first, other);
  assert.equal(first.includes("203.0.113.10"), false);
});

test("authenticatedSecurityUser validates the bearer token, profile, and JWT session id", async () => {
  const payload = Buffer.from(JSON.stringify({ session_id: "session-123" })).toString("base64url");
  const token = `header.${payload}.signature`;
  const admin = fakeAdmin();
  const result = await authenticatedSecurityUser(requestWithToken(token), admin);
  assert.equal(result?.user.id, "student-1");
  assert.equal(result?.profile.id, "student-1");
  assert.equal(result?.accessToken, token);
  assert.equal(result?.authSessionId, "session-123");
  assert.deepEqual(admin.calls[0], ["getUser", token]);
});

test("missing bearer token is anonymous without querying Auth or profiles", async () => {
  const admin = fakeAdmin();
  assert.equal(await authenticatedSecurityUser(new Request("https://synthetic.test"), admin), null);
  assert.deepEqual(admin.calls, []);
});

test("resolveAuthUser falls back to the direct Auth endpoint after an SDK rejection", async t => {
  t.mock.method(console, "warn", () => {});
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.supabase.test/";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "synthetic-publishable-key";
  const calls = [];
  t.mock.method(globalThis, "fetch", async (...args) => {
    calls.push(args);
    return Response.json({ id: "student-1" });
  });
  const admin = fakeAdmin({ authUser: null, authError: { status: 401, code: "invalid_token", message: "synthetic invalid token" } });
  const resolved = await resolveAuthUser("synthetic-token", admin);
  assert.equal(resolved?.id, "student-1");
  assert.equal(calls[0][0], "https://synthetic.supabase.test/auth/v1/user");
  assert.equal(calls[0][1].headers.apikey, "synthetic-publishable-key");
  assert.equal(calls[0][1].headers.authorization, "Bearer synthetic-token");
});

test("ensureActiveAccount returns explicit auth/configuration/service responses and clears expired temporary bans", async t => {
  t.mock.method(console, "warn", () => {});
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const previousRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  t.after(() => {
    for (const [key, value] of [["NEXT_PUBLIC_SUPABASE_URL", previousUrl], ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", previousKey], ["SUPABASE_SERVICE_ROLE_KEY", previousRole]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  assert.equal((await ensureActiveAccount(new Request("https://synthetic.test"))).response.status, 503);

  const admin = fakeAdmin();
  const missing = await ensureActiveAccount(new Request("https://synthetic.test"), admin);
  assert.equal(missing.response.status, 401);
  assert.equal((await missing.response.json()).code, "AUTH_REQUIRED");
  assert.equal(admin.calls.length, 0);

  const serviceFailure = await ensureActiveAccount(requestWithToken(), fakeAdmin({ throwAuth: true }));
  assert.equal(serviceFailure.response.status, 503);
  assert.equal((await serviceFailure.response.json()).code, "AUTH_SERVICE_UNAVAILABLE");

  const expired = fakeAdmin({ profile: { ...baseProfile, account_status: "temporarily_banned", banned_until: "2020-01-01T00:00:00.000Z" } });
  const recovered = await ensureActiveAccount(requestWithToken(), expired);
  assert.equal(recovered.ok, true);
  assert.ok(expired.calls.some(call => call[0] === "update"));
});

test("ensureActiveAccount returns a private 423 payload for locked accounts", async () => {
  const locked = fakeAdmin({ profile: { ...baseProfile, status: "locked", ban_reason: "Synthetic lock", banned_at: "2026-09-11T00:00:00.000Z", ban_event_id: 9 } });
  const result = await ensureActiveAccount(requestWithToken(), locked);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 423);
  assert.equal(result.response.headers.get("cache-control"), "private, no-store");
  const body = await result.response.json();
  assert.deepEqual({ ...body, serverTime: undefined }, {
    allowed: false,
    code: "ACCOUNT_PERMANENTLY_BANNED",
    reason: "Synthetic lock",
    bannedAt: "2026-09-11T00:00:00.000Z",
    bannedUntil: null,
    serverTime: undefined,
    violationNumber: 0,
    eventCode: "SEC-20260911-000009",
  });
  assert.match(body.serverTime, /^\d{4}-\d{2}-\d{2}T/);
});

test("profile lookup failure becomes a retryable auth-service response", async t => {
  t.mock.method(console, "warn", () => {});
  const admin = fakeAdmin({ profile: null, profileError: { code: "PGRST000", message: "synthetic database unavailable" } });
  const result = await ensureActiveAccount(requestWithToken(), admin);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 503);
  assert.equal((await result.response.json()).code, "AUTH_SERVICE_UNAVAILABLE");
});

test("profile lookup transport failures become an auth-service error", async () => {
  const admin = {
    auth: { async getUser() { return { data: { user }, error: null }; } },
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        async single() { throw new Error("synthetic profile transport failure"); },
      };
      return chain;
    },
  };
  await assert.rejects(authenticatedSecurityUser(requestWithToken(), admin), /temporarily unavailable/i);
});

test("direct Auth fallback classifies invalid, unavailable, malformed, and thrown responses", async t => {
  t.mock.method(console, "warn", () => {});
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "synthetic-publishable-key";

  const outcomes = [
    Response.json({ error: "invalid" }, { status: 401 }),
    Response.json({ error: "busy" }, { status: 503 }),
    Response.json({ detail: "missing id" }, { status: 200 }),
    new Error("synthetic direct-auth transport failure"),
  ];
  const calls = [];
  t.mock.method(globalThis, "fetch", async (...args) => {
    calls.push(args);
    const outcome = outcomes.shift();
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  const invalidAdmin = fakeAdmin({ authUser: null, authError: { status: 401, code: "invalid_token", message: "synthetic invalid token" } });
  assert.equal(await resolveAuthUser("synthetic-invalid", invalidAdmin), null);
  assert.equal(await resolveAuthUser("synthetic-unavailable", invalidAdmin), null);
  assert.equal(await resolveAuthUser("synthetic-malformed", invalidAdmin), null);
  assert.equal(await resolveAuthUser("synthetic-thrown", invalidAdmin), null);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map(call => call[1].headers.apikey), Array(4).fill("synthetic-publishable-key"));
});

test("ensureActiveAccount returns a private 401 when direct Auth rejects the token", async t => {
  t.mock.method(console, "warn", () => {});
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "synthetic-publishable-key";
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "invalid" }, { status: 401 }));
  const result = await ensureActiveAccount(requestWithToken(), fakeAdmin({ authUser: null, authError: { status: 401, code: "invalid_token", message: "synthetic invalid token" } }));
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
  assert.equal((await result.response.json()).code, "AUTH_SESSION_INVALID");
});

test("hashedRequestIp fails closed when production has no configured hash secret", async t => {
  const previousSecret = process.env.SECURITY_IP_HASH_SECRET;
  const previousMode = process.env.NODE_ENV;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.SECURITY_IP_HASH_SECRET;
    else process.env.SECURITY_IP_HASH_SECRET = previousSecret;
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
  });
  delete process.env.SECURITY_IP_HASH_SECRET;
  process.env.NODE_ENV = "production";
  await assert.rejects(hashedRequestIp(new Request("https://synthetic.test", { headers: { "cf-connecting-ip": "203.0.113.10" } })), /SECURITY_IP_HASH_SECRET is required/);
});
