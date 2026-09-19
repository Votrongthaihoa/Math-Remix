import assert from "node:assert/strict";
import test from "node:test";
import { registerTestLoader } from "./support/test-loader.mjs";

const state = {};
globalThis.__dashboardUserInfoTest = state;
const routeUrl = new URL("../app/api/dashboard/user-info/route.ts", import.meta.url).href;
await registerTestLoader([{
  parentURL: routeUrl,
  specifier: "../../../../lib/security-server",
  url: `data:text/javascript,${encodeURIComponent(`
    export const ensureActiveAccount = (...args) => globalThis.__dashboardUserInfoTest.ensure(...args);
  `)}`,
}]);
const { GET } = await import(routeUrl);

test.after(() => { delete globalThis.__dashboardUserInfoTest; });

function adminWithProfile(profile, error = null) {
  const calls = [];
  const chain = {
    select(value) { calls.push(["select", value]); return chain; },
    eq(...args) { calls.push(["eq", ...args]); return chain; },
    async maybeSingle() { calls.push(["maybeSingle"]); return { data: profile, error }; },
  };
  return { calls, from(table) { calls.push(["from", table]); return chain; } };
}

test("user-info projects only the authenticated account profile", async () => {
  const admin = adminWithProfile({ full_name: "Nguyễn Văn A", student_code: "HS001" });
  state.ensure = async () => ({
    ok: true,
    admin,
    user: { id: "user-1", email: "a@example.test" },
    profile: { role: "student" },
  });
  const response = await GET(new Request("https://example.test/api/dashboard/user-info"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    profile: {
      full_name: "Nguyễn Văn A",
      student_code: "HS001",
      role: "student",
      email: "a@example.test",
    },
  });
  assert.ok(admin.calls.some(call => call[0] === "eq" && call[1] === "id" && call[2] === "user-1"));
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
});

test("user-info forwards auth failures and hides database errors", async () => {
  const authFailure = Response.json({ error: "unauthorized" }, { status: 401 });
  state.ensure = async () => ({ ok: false, response: authFailure });
  assert.equal(await GET(new Request("https://example.test/api/dashboard/user-info")), authFailure);

  const admin = adminWithProfile(null, { message: "private database detail" });
  state.ensure = async () => ({
    ok: true,
    admin,
    user: { id: "user-1", email: "a@example.test" },
    profile: { role: "student" },
  });
  const unavailable = await GET(new Request("https://example.test/api/dashboard/user-info"));
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(JSON.stringify(await unavailable.json()), /database|detail/i);
});
