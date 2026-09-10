import assert from "node:assert/strict";
import test from "node:test";

import { runExamPreflight } from "../lib/exam-preflight-server.ts";

const EXAM_ID = "synthetic-exam";
const TABLES = ["exam_sections", "exam_questions", "exam_question_keys"];

function validMetadata() {
  return {
    exam_sections: [{ id: "section-a", title: "Synthetic section", duration_minutes: 30, sort_order: 0 }],
    exam_questions: [{ id: "question-a", section_id: "section-a", points: 1, media_url: "https://example.invalid/image.png" }],
    exam_question_keys: [{ question_id: "question-a" }],
  };
}

// No credentials, SDK construction, network, or live schema assumptions. The
// thenable records every read so missing filters and unexpected calls fail tests.
function fakeAdmin(metadata = validMetadata(), responses = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.ok(TABLES.includes(table), `Unexpected table: ${table}`);
      const call = { table, operations: [] };
      calls.push(call);
      const query = {
        select(...args) { call.operations.push(["select", ...args]); return query; },
        eq(...args) { call.operations.push(["eq", ...args]); return query; },
        in(...args) { call.operations.push(["in", ...args]); return query; },
        order(...args) { call.operations.push(["order", ...args]); return query; },
        then(resolve, reject) {
          const response = Object.hasOwn(responses, table)
            ? responses[table]
            : { data: metadata[table], error: null };
          return (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function expectedCalls(sectionIds = ["section-a"], questionIds = ["question-a"]) {
  return [
    { table: "exam_sections", operations: [["select", "id,title,duration_minutes,sort_order"], ["eq", "exam_id", EXAM_ID], ["order", "sort_order"]] },
    ...(sectionIds.length ? [{ table: "exam_questions", operations: [["select", "id,section_id,points,media_url"], ["in", "section_id", sectionIds]] }] : []),
    ...(questionIds.length ? [{ table: "exam_question_keys", operations: [["select", "question_id"], ["in", "question_id", questionIds]] }] : []),
  ];
}

function assertChecks(result, levels, status, canPublish) {
  assert.equal(result.status, status);
  assert.equal(result.canPublish, canPublish);
  assert.deepEqual(result.checks.map(({ code, level }) => [code, level]), Object.entries(levels));
  for (const check of result.checks) assert.ok(typeof check.message === "string" && check.message.length > 0);
}

const PASS = { questions: "pass", answer_keys: "pass", points: "pass", media: "pass", sections: "pass" };

// Either an explicit refusal or a rejection is fail-closed. Keep assertions out
// of the rejection branch so an assertion failure cannot masquerade as refusal.
async function assertCannotPublish(admin) {
  const outcome = await runExamPreflight(admin, EXAM_ID).then(
    result => ({ result }),
    error => ({ error }),
  );
  if (Object.hasOwn(outcome, "error")) return;
  assert.equal(outcome.result.canPublish, false, "Uncertain/malformed metadata must never permit publication");
  assert.equal(outcome.result.status, "error");
}

test("valid metadata passes and reads only the scoped authoring projections", async () => {
  const metadata = validMetadata();
  metadata.exam_sections.push({ id: "section-b", title: "Second", duration_minutes: 20, sort_order: 1 });
  metadata.exam_questions.push({ id: "question-b", section_id: "section-b", points: 0, media_url: null });
  metadata.exam_question_keys.push({ question_id: "question-b" });
  const before = structuredClone(metadata);
  const admin = fakeAdmin(metadata);
  const result = await runExamPreflight(admin, EXAM_ID);
  assertChecks(result, PASS, "pass", true);
  assert.deepEqual(admin.calls, expectedCalls(["section-a", "section-b"], ["question-a", "question-b"]));
  assert.deepEqual(metadata, before, "Preflight must not mutate returned metadata");
  assert.equal(result.checks[0].message, "2 câu hỏi đã sẵn sàng.");
  assert.equal(result.checks[4].message, "2 phần thi.");
  assert.deepEqual(Object.keys(result).sort(), ["canPublish", "checks", "status"]);
  assert.ok(!JSON.stringify(result).includes("question-a"), "Returned checks must not expose question/key rows");
});

for (const [stage, table] of TABLES.entries()) {
  test(`${table} database error is rethrown unchanged and stops subsequent reads`, async () => {
    const metadata = validMetadata();
    const error = { code: "SYNTHETIC_DB_FAILURE", message: `${table} unavailable` };
    // Nonempty data must not override an accompanying database error.
    const admin = fakeAdmin(metadata, { [table]: { data: metadata[table], error } });
    await assert.rejects(runExamPreflight(admin, EXAM_ID), thrown => thrown === error);
    assert.deepEqual(admin.calls, expectedCalls().slice(0, stage + 1));
  });

  test(`${table} rejected transport fails closed and stops subsequent reads`, async () => {
    const error = new Error(`Synthetic ${table} transport rejection`);
    const admin = fakeAdmin(validMetadata(), { [table]: error });
    await assert.rejects(runExamPreflight(admin, EXAM_ID), thrown => thrown === error);
    assert.deepEqual(admin.calls, expectedCalls().slice(0, stage + 1));
  });

  test(`${table} null data cannot grant publication`, async () => {
    await assertCannotPublish(fakeAdmin(validMetadata(), { [table]: { data: null, error: null } }));
  });

  for (const [label, data] of [["non-array object", {}], ["null row", [null]]]) {
    test(`${table} ${label} fails closed`, async () => {
      await assertCannotPublish(fakeAdmin(validMetadata(), { [table]: { data, error: null } }));
    });
  }
}

test("no sections reports both structural errors and skips question/key queries", async () => {
  const admin = fakeAdmin({ ...validMetadata(), exam_sections: [] });
  const result = await runExamPreflight(admin, EXAM_ID);
  assertChecks(result, { ...PASS, questions: "error", sections: "error" }, "error", false);
  assert.deepEqual(admin.calls, expectedCalls([], []));
});

test("sections without questions report an error and skip key queries", async () => {
  const admin = fakeAdmin({ ...validMetadata(), exam_questions: [] });
  assertChecks(await runExamPreflight(admin, EXAM_ID), { ...PASS, questions: "error" }, "error", false);
  assert.deepEqual(admin.calls, expectedCalls(["section-a"], []));
});

test("missing answer keys are an error even when unrelated/duplicate keys exist", async () => {
  const metadata = validMetadata();
  metadata.exam_questions.push({ id: "question-b", section_id: "section-a", points: 2, media_url: null });
  metadata.exam_question_keys.push({ question_id: "question-a" }, { question_id: "unrelated" });
  const result = await runExamPreflight(fakeAdmin(metadata), EXAM_ID);
  assertChecks(result, { ...PASS, answer_keys: "error" }, "error", false);
  assert.equal(result.checks[1].message, "1 câu chưa có đáp án.");
});

test("negative points produce an error-only result despite complete keys and media", async () => {
  const metadata = validMetadata();
  metadata.exam_questions[0].points = -0.01;
  assertChecks(await runExamPreflight(fakeAdmin(metadata), EXAM_ID), { ...PASS, points: "error" }, "error", false);
});

test("no media is warning-only and does not block publication", async () => {
  const metadata = validMetadata();
  metadata.exam_questions[0].media_url = null;
  assertChecks(await runExamPreflight(fakeAdmin(metadata), EXAM_ID), { ...PASS, media: "warning" }, "warning", true);
});

test("multiple errors dominate a media warning and missing keys are counted per question", async () => {
  const metadata = validMetadata();
  metadata.exam_questions = [
    { id: "question-a", section_id: "section-a", points: -1, media_url: null },
    { id: "question-b", section_id: "section-a", points: 1, media_url: "" },
  ];
  metadata.exam_question_keys = [];
  const result = await runExamPreflight(fakeAdmin(metadata), EXAM_ID);
  assertChecks(result, { ...PASS, answer_keys: "error", points: "error", media: "warning" }, "error", false);
  assert.equal(result.checks[1].message, "2 câu chưa có đáp án.");
});

for (const [label, points, knownGap = false] of [["nonnumeric text", "invalid"], ["missing", undefined], ["NaN", NaN], ["null", null, true], ["empty text", "", true], ["whitespace", " ", true], ["boolean", true, true], ["infinity", Infinity, true], ["array", [], true]]) {
  test(`malformed ${label} points must fail closed`, {
    todo: knownGap && "Production coerces malformed points with Number(points) and permits publication; requires separately authorized validation fix.",
  }, async () => {
    const metadata = validMetadata();
    metadata.exam_questions[0].points = points;
    await assertCannotPublish(fakeAdmin(metadata));
  });
}

// These are intended safety contracts, not endorsements of permissive behavior.
// Executable TODO failures identify production validation gaps without treating
// unsafe publication as the expected outcome or patching production code.
for (const [label, corrupt] of [
  ["missing section id", metadata => { delete metadata.exam_sections[0].id; }],
  ["question linked to a different section", metadata => { metadata.exam_questions[0].section_id = "unrelated-section"; }],
  ["question with missing section relation", metadata => { delete metadata.exam_questions[0].section_id; }],
  ["question and key with missing ids", metadata => { delete metadata.exam_questions[0].id; metadata.exam_question_keys = [{}]; }],
  ["question and key with null ids", metadata => { metadata.exam_questions[0].id = null; metadata.exam_question_keys = [{ question_id: null }]; }],
]) {
  test(`malformed relation: ${label} must fail closed`, {
    todo: "Production trusts malformed identifiers/section relations; requires separately authorized validation fix.",
  }, async () => {
    const metadata = validMetadata();
    corrupt(metadata);
    await assertCannotPublish(fakeAdmin(metadata));
  });
}
