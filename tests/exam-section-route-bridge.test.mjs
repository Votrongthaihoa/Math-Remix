import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { registerTestLoader } from "./support/test-loader.mjs";

const SECTION_ID = "11111111-1111-4111-8111-111111111111";
const EXAM_ID = "22222222-2222-4222-8222-222222222222";
const ROOM_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const ATTEMPT_ID = "55555555-5555-4555-8555-555555555555";

const state = {};
globalThis.__syntheticExamSectionRoute = state;
await registerTestLoader([{
  specifier: "../../../../lib/security-server",
  url: `data:text/javascript,${encodeURIComponent(`
    export const securityAdminClient = () => globalThis.__syntheticExamSectionRoute.admin;
    export const ensureActiveAccount = (...args) => globalThis.__syntheticExamSectionRoute.ensure(...args);
  `)}`,
}]);
const routeUrl = new URL("../app/api/exams/section-route/route.ts", import.meta.url).href;
const { GET } = await import(routeUrl);

test.after(() => { delete globalThis.__syntheticExamSectionRoute; });

function fakeAdmin(options = {}) {
  const calls = [];
  const rows = {
    exam_sections: options.section === false ? null : { id: SECTION_ID, exam_id: EXAM_ID },
    exams: { id: EXAM_ID, room_id: ROOM_ID, published: options.examPublished ?? true },
    exam_rooms: { id: ROOM_ID, published: options.roomPublished ?? true, access_mode: options.accessMode ?? "open" },
    exam_room_enrollments: options.enrolled === false ? null : { room_id: ROOM_ID },
    exam_attempts: options.attempt === false ? null : { id: ATTEMPT_ID },
  };
  return {
    calls,
    from(table) {
      calls.push(["from", table]);
      const query = {
        select(value) { calls.push([table, "select", value]); return query; },
        eq(...args) { calls.push([table, "eq", ...args]); return query; },
        neq(...args) { calls.push([table, "neq", ...args]); return query; },
        order(...args) { calls.push([table, "order", ...args]); return query; },
        limit(value) { calls.push([table, "limit", value]); return query; },
        async maybeSingle() {
          calls.push([table, "maybeSingle"]);
          if (options.errorTable === table) return { data: null, error: { message: "synthetic private database error" } };
          return { data: rows[table] ?? null, error: null };
        },
      };
      return query;
    },
  };
}

function harness(options = {}) {
  const admin = fakeAdmin(options);
  Object.assign(state, {
    admin,
    ensure: async () => options.authResponse
      ? { ok: false, response: options.authResponse }
      : {
          ok: true,
          admin,
          user: { id: USER_ID },
          profile: { role: options.role ?? "student" },
        },
  });
  const request = (target, sectionId = SECTION_ID) => new Request(
    `https://synthetic.test/api/exams/section-route?sectionId=${encodeURIComponent(sectionId)}&target=${encodeURIComponent(target)}`,
  );
  return { admin, request };
}

async function expectPrivateError(response, status, code) {
  assert.equal(response.status, status);
  const payload = await response.json();
  assert.equal(payload.code, code);
  assert.equal(typeof payload.error, "string");
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal("path" in payload, false);
  return payload;
}

test("legacy test and confirm URLs resolve only after the current room access check", async () => {
  for (const [target, path] of [
    ["test", `/exam/${EXAM_ID}/section/${SECTION_ID}`],
    ["confirm", `/exam/${EXAM_ID}/section/${SECTION_ID}/confirm`],
  ]) {
    const h = harness({ accessMode: "assigned", enrolled: true });
    const response = await GET(h.request(target));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { path });
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.ok(h.admin.calls.some(call => call[0] === "exam_room_enrollments" && call[1] === "eq" && call[2] === "student_id" && call[3] === USER_ID));
  }
});

test("legacy result URL resolves the signed-in user's latest completed section attempt", async () => {
  const h = harness();
  const response = await GET(h.request("result"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { path: `/exam/result/${ATTEMPT_ID}` });
  assert.ok(h.admin.calls.some(call => call[0] === "exam_attempts" && call[1] === "eq" && call[2] === "student_id" && call[3] === USER_ID));
  assert.ok(h.admin.calls.some(call => call[0] === "exam_attempts" && call[1] === "eq" && call[2] === "section_id" && call[3] === SECTION_ID));
  assert.ok(h.admin.calls.some(call => call[0] === "exam_attempts" && call[1] === "neq" && call[2] === "status" && call[3] === "in_progress"));
  assert.deepEqual(h.admin.calls.filter(call => call[0] === "exam_attempts" && call[1] === "order").map(call => call[2]), ["submitted_at", "started_at"]);
});

test("missing access and missing result use the same private not-found contract", async () => {
  const denied = harness({ accessMode: "assigned", enrolled: false });
  const deniedPayload = await expectPrivateError(await GET(denied.request("result")), 404, "EXAM_ROUTE_NOT_FOUND");
  assert.ok(!denied.admin.calls.some(call => call[0] === "exam_attempts"));

  const missing = harness({ attempt: false });
  const missingPayload = await expectPrivateError(await GET(missing.request("result")), 404, "EXAM_ROUTE_NOT_FOUND");
  assert.deepEqual(missingPayload, deniedPayload);
});

test("invalid identifiers, auth failures, and database failures do not leak a canonical path", async () => {
  const invalid = harness();
  await expectPrivateError(await GET(invalid.request("test", "not-a-section")), 400, "INVALID_EXAM_ROUTE");
  await expectPrivateError(await GET(invalid.request("unexpected")), 400, "INVALID_EXAM_ROUTE");
  assert.deepEqual(invalid.admin.calls, []);

  const authResponse = Response.json(
    { error: "Phiên đăng nhập không hợp lệ.", code: "AUTH_SESSION_INVALID" },
    { status: 401, headers: { "cache-control": "private, no-store" } },
  );
  const unauthorized = harness({ authResponse });
  const response = await GET(unauthorized.request("test"));
  assert.equal(response, authResponse);
  assert.deepEqual(unauthorized.admin.calls, []);

  const unavailable = harness({ errorTable: "exam_sections" });
  const unavailablePayload = await expectPrivateError(await GET(unavailable.request("confirm")), 503, "EXAM_ROUTE_UNAVAILABLE");
  assert.doesNotMatch(unavailablePayload.error, /database|synthetic|exam_sections/i);
});

test("physical compatibility pages use the authenticated accessible bridge instead of PlatformApp", async () => {
  const [bridge, testPage, confirmPage, resultPage] = await Promise.all([
    readFile(new URL("../app/exam/section-route-bridge.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/exam/[sectionId]/test/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/exam/[sectionId]/confirm/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/exam/[sectionId]/result/page.tsx", import.meta.url), "utf8"),
  ]);
  for (const page of [testPage, confirmPage, resultPage]) {
    assert.doesNotMatch(page, /PlatformApp/);
    assert.match(page, /SectionExamRouteBridge/);
  }
  assert.match(testPage, /target="test"/);
  assert.match(confirmPage, /target="confirm"/);
  assert.match(resultPage, /target="result"/);
  assert.match(bridge, /authenticatedFetch/);
  assert.match(bridge, /router\.replace/);
  assert.match(bridge, /aria-busy="true"/);
  assert.match(bridge, /role="alert"/);
});
