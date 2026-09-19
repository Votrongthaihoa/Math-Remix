import assert from "node:assert/strict";
import test from "node:test";
import { registerTestLoader } from "./support/test-loader.mjs";

// Resolve only this module's extensionless TS imports; execute the real guard,
// policy, and account check without changing production or transforming source.
const guardUrl = new URL("../lib/resource-access-server.ts", import.meta.url).href;
await registerTestLoader([
  { parentURL: guardUrl, specifier: "./resource-access", appendExtension: ".ts" },
  { parentURL: guardUrl, specifier: "./security-server", appendExtension: ".ts" },
]);
const { guardResourceAccess } = await import(guardUrl);

const projection = "id,title,resource_type,resource_url,allow_download,provider,provider_drive_id,provider_item_id,provider_metadata,lesson_id,lessons(published,chapters(course_id))";
const resource = {
  id: "resource-1",
  title: "Synthetic lesson PDF",
  resource_type: "storage_pdf",
  resource_url: "private/course-1/lesson.pdf",
  allow_download: true,
  provider: null,
  provider_drive_id: null,
  provider_item_id: null,
  provider_metadata: {},
};
const profile = {
  id: "student-1", role: "student", status: "active", account_status: "active",
  violation_count: 0, banned_at: null, banned_until: null, ban_reason: null, ban_event_id: null,
};
const lesson = () => ({ published: true, chapters: { course_id: "course-1" } });
const row = (overrides = {}) => ({ ...resource, lesson_id: "lesson-1", lessons: lesson(), ...overrides });
const result = data => ({ data, error: null });

// Each terminal consumes exactly one scripted response. Unexpected queries or
// terminals fail immediately, making admin/no-enrollment checks meaningful.
function fakeClient(resourceResult = result(row()), enrollmentResult = result({ course_id: "course-1" })) {
  const calls = [];
  const pending = new Map([["lesson_resources", resourceResult], ["course_enrollments", enrollmentResult]]);
  return {
    calls,
    from(table) {
      assert.ok(pending.has(table), `unexpected query: ${table}`);
      calls.push(["from", table]);
      const chain = {
        select(value) { calls.push(["select", value]); return chain; },
        eq(key, value) { calls.push(["eq", key, value]); return chain; },
        async single() { return finish("single"); },
        async maybeSingle() { return finish("maybeSingle"); },
      };
      function finish(method) {
        assert.equal(method, table === "lesson_resources" ? "single" : "maybeSingle");
        assert.ok(pending.has(table), `duplicate terminal: ${table}`);
        calls.push([method]);
        const scripted = pending.get(table);
        pending.delete(table);
        if (scripted instanceof Error) throw scripted;
        return scripted;
      }
      return chain;
    },
  };
}

const run = (client, overrides = {}, mode = "view") => guardResourceAccess(client, profile.id, { ...profile, ...overrides }, resource.id, mode);
const queriedTables = client => client.calls.filter(([method]) => method === "from").map(([, table]) => table);

async function denial(value, status, code) {
  assert.equal(value.ok, false);
  assert.equal("resource" in value, false);
  assert.ok(value.response instanceof Response);
  assert.equal(value.response.status, status);
  assert.equal(value.response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(value.response.headers.get("x-content-type-options"), "nosniff");
  assert.match(value.response.headers.get("content-type"), /^application\/json/);
  const body = await value.response.json();
  assert.deepEqual(Object.keys(body).sort(), code ? ["code", "error"] : ["error"]);
  assert.equal(body.code, code);
  assert.equal(typeof body.error, "string");
  assert.ok(body.error.length > 0);
  assert.equal(JSON.stringify(body).includes(resource.resource_url), false);
  assert.equal(JSON.stringify(body).includes("private database details"), false);
}

test("missing resource returns a private 404 without querying enrollment", async () => {
  const client = fakeClient(result(null));
  await denial(await run(client), 404);
  assert.deepEqual(queriedTables(client), ["lesson_resources"]);
});

for (const [name, lessons] of [
  ["missing lesson", null], ["empty lesson relation", []], ["missing chapter", { published: true, chapters: null }],
  ["empty chapter relation", { published: true, chapters: [] }],
  ["missing course id", { published: true, chapters: {} }],
  ["empty course id", { published: true, chapters: { course_id: "" } }],
  ["malformed lesson scalar", "not-a-relation"],
  ["malformed chapter scalar", { published: true, chapters: "not-a-relation" }],
]) {
  test(`${name} fails closed before enrollment, including admins`, async () => {
    for (const role of ["student", "admin"]) {
      const client = fakeClient(result(row({ lessons })));
      await denial(await run(client, { role }), 404);
      assert.deepEqual(queriedTables(client), ["lesson_resources"]);
    }
  });
}

for (const arrayLesson of [false, true]) {
  for (const arrayChapter of [false, true]) {
    test(`enrolled student accepts lesson ${arrayLesson ? "array" : "object"}, chapter ${arrayChapter ? "array" : "object"}`, async () => {
      const chapters = { course_id: "course-1" };
      const lessons = { published: true, chapters: arrayChapter ? [chapters] : chapters };
      const client = fakeClient(result(row({ lessons: arrayLesson ? [lessons] : lessons })));
      assert.deepEqual(await run(client), { ok: true, resource });
    });
  }
}

test("exact least-data query projection, scoped enrollment filters, and output whitelist", async () => {
  const client = fakeClient(result(row({ answer_key: "secret", correct_answer: "secret", explanation: "secret", private_notes: "secret" })));
  assert.deepEqual(await run(client), { ok: true, resource });
  assert.deepEqual(client.calls, [
    ["from", "lesson_resources"], ["select", projection], ["eq", "id", "resource-1"], ["single"],
    ["from", "course_enrollments"], ["select", "course_id"], ["eq", "student_id", "student-1"],
    ["eq", "course_id", "course-1"], ["maybeSingle"],
  ]);
  assert.doesNotMatch(projection, /\*|answer|solution|explanation|private_notes/);
});

test("unenrolled student is denied", async () => {
  await denial(await run(fakeClient(result(row()), result(null))), 403, "NOT_ENROLLED");
});

for (const [name, overrides] of [
  ["locked", { status: "locked" }],
  ["permanently banned", { account_status: "permanently_banned" }],
  ["temporarily banned without expiry", { account_status: "temporarily_banned", banned_until: null }],
]) {
  test(`${name} account is denied even as admin`, async () => {
    for (const role of ["student", "admin"]) {
      const client = fakeClient();
      await denial(await run(client, { role, ...overrides }), 423, "ACCOUNT_INACTIVE");
      if (role === "admin") assert.deepEqual(queriedTables(client), ["lesson_resources"]);
    }
  });
}

test("draft lesson denies students even when enrolled", async () => {
  await denial(await run(fakeClient(result(row({ lessons: { ...lesson(), published: false } })))), 403, "LESSON_UNPUBLISHED");
});

test("absent published flag fails closed", async () => {
  await denial(await run(fakeClient(result(row({ lessons: { chapters: { course_id: "course-1" } } })))), 403, "LESSON_UNPUBLISHED");
});

test("view remains allowed with downloads disabled; download requires permission", async () => {
  for (const allow_download of [false, true]) {
    const data = row({ allow_download });
    assert.deepEqual(await run(fakeClient(result(data))), { ok: true, resource: { ...resource, allow_download } });
    const download = await run(fakeClient(result(data)), {}, "download");
    if (allow_download) assert.deepEqual(download, { ok: true, resource });
    else await denial(download, 403, "DOWNLOAD_NOT_ALLOWED");
  }
});

test("active admin bypasses enrollment, publication and download restrictions", async () => {
  for (const mode of ["view", "download"]) {
    const client = fakeClient(result(row({ allow_download: false, lessons: { ...lesson(), published: false } })), new Error("enrollment must not be queried"));
    assert.deepEqual(await run(client, { role: "admin" }, mode), { ok: true, resource: { ...resource, allow_download: false } });
    assert.deepEqual(queriedTables(client), ["lesson_resources"]);
  }
});

test("resource query error without data denies and does not leak DB diagnostics", async () => {
  const client = fakeClient({ data: null, error: { code: "DB_ERROR", message: "private database details" } });
  await denial(await run(client), 404);
  assert.deepEqual(queriedTables(client), ["lesson_resources"]);
});

test("enrollment query error without data denies access", async () => {
  await denial(await run(fakeClient(result(row()), { data: null, error: { message: "private database details" } })), 403, "NOT_ENROLLED");
});

test("thrown query errors reject without returning a resource", async () => {
  const resourceError = new Error("synthetic resource failure");
  const resourceClient = fakeClient(resourceError);
  await assert.rejects(run(resourceClient), error => error === resourceError);
  assert.deepEqual(queriedTables(resourceClient), ["lesson_resources"]);
  const enrollmentError = new Error("synthetic enrollment failure");
  await assert.rejects(run(fakeClient(result(row()), enrollmentError)), error => error === enrollmentError);
});

// Unknown or malformed authorization facts must never grant access.
// Synthetic malformed result envelopes do not claim that live Supabase emits them.
test("fail closed when a resource query contains both data and an error", async () => {
  const client = fakeClient({ data: row(), error: { message: "synthetic DB failure" } });
  assert.equal((await run(client)).ok, false);
});

test("fail closed when an enrollment query contains both data and an error", async () => {
  const client = fakeClient(result(row()), { data: { course_id: "course-1" }, error: { message: "synthetic DB failure" } });
  assert.equal((await run(client)).ok, false);
});

test("malformed truthy course id must not establish a valid course relation", async () => {
  const client = fakeClient(result(row({ lessons: { published: true, chapters: { course_id: {} } } })));
  assert.equal((await run(client, { role: "admin" })).ok, false);
});

test("malformed published string must not authorize a student", async () => {
  const client = fakeClient(result(row({ lessons: { ...lesson(), published: "false" } })));
  assert.equal((await run(client)).ok, false);
});

test("malformed download-permission string must not authorize a download", async () => {
  const client = fakeClient(result(row({ allow_download: "false" })));
  assert.equal((await run(client, {}, "download")).ok, false);
});
