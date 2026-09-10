import assert from "node:assert/strict";
import test from "node:test";

import { parseContinueLearningFallback, serializeContinueLearningFallback, readContinueLearningFallback, continueLearningStorageKey } from "../lib/continue-learning.ts";

test("continue-learning recovery tolerates blocked storage and malformed data", () => {
  assert.equal(readContinueLearningFallback(() => { throw new DOMException("Blocked", "SecurityError"); }), null);
  for (const value of [null, "", "null", "[]", "broken", '{"version":1}']) {
    assert.equal(readContinueLearningFallback(() => value), null);
  }
  const item = { lessonId: "lesson-1", updatedAt: "2026-09-10T08:00:00.000Z" };
  assert.deepEqual(readContinueLearningFallback(() => serializeContinueLearningFallback(item)), item);
  assert.notEqual(continueLearningStorageKey("student-a"), continueLearningStorageKey("student-b"));
});

test("continue-learning fallback is versioned, minimal, and rejects invalid values", () => {
  const stored = serializeContinueLearningFallback({
    lessonId: "lesson-1",
    resourceId: "resource-1",
    updatedAt: "2026-09-10T08:00:00.000Z",
  });

  assert.deepEqual(JSON.parse(stored), {
    version: 1,
    lessonId: "lesson-1",
    resourceId: "resource-1",
    updatedAt: "2026-09-10T08:00:00.000Z",
  });
  assert.deepEqual(parseContinueLearningFallback(stored), {
    lessonId: "lesson-1",
    resourceId: "resource-1",
    updatedAt: "2026-09-10T08:00:00.000Z",
  });
  assert.equal(parseContinueLearningFallback('{"version":1,"lessonId":"lesson-1","email":"student@example.com"}'), null);
  assert.equal(parseContinueLearningFallback('{"version":2,"lessonId":"lesson-1"}'), null);
});

const valid = { lessonId: "lesson-1", resourceId: "resource-1", updatedAt: "2026-09-10T08:00:00.000Z" };

test("fallback validates required ids and timestamps and optional resource ids", () => {
  const stored = { version: 1, ...valid };
  for (const [field, values] of [
    ["lessonId", [undefined, null, "", " \t ", 1, false, {}, [], "x".repeat(181)]],
    ["resourceId", [null, "", " \t ", 1, false, {}, [], "x".repeat(181)]],
    ["updatedAt", [undefined, null, "", "not-a-date", "2026-99-99T00:00:00Z", 0, false, {}, []]],
    ["version", [undefined, null, 0, 2, "1"]],
  ]) {
    for (const value of values) {
      assert.equal(parseContinueLearningFallback(JSON.stringify({ ...stored, [field]: value })), null, `${field}: ${JSON.stringify(value)}`);
    }
  }
  assert.deepEqual(parseContinueLearningFallback(JSON.stringify({ ...stored, resourceId: undefined })), { lessonId: valid.lessonId, updatedAt: valid.updatedAt });
  assert.equal(parseContinueLearningFallback(JSON.stringify({ ...stored, lessonId: "x".repeat(180) })).lessonId.length, 180);
});

test("serialized fallback whitelists ids/timestamp and never stores content or identity", () => {
  const privateData = {
    ...valid, email: "synthetic@example.invalid", userId: "student-a", lessonTitle: "Private lesson",
    courseTitle: "Private course", resourceTitle: "Private handout", resource_url: "https://private.invalid/file",
    accessToken: "synthetic-token", answer_key: { 1: "A" }, solutions: ["Private solution"],
  };
  assert.deepEqual(JSON.parse(serializeContinueLearningFallback(privateData)), { version: 1, ...valid });
  for (const key of Object.keys(privateData).filter(key => !Object.hasOwn(valid, key))) {
    assert.equal(parseContinueLearningFallback(JSON.stringify({ version: 1, ...valid, [key]: privateData[key] })), null, key);
  }
});

test("per-user storage keys isolate synthetic users and browser storage is read once", () => {
  const other = { lessonId: "other-lesson", updatedAt: valid.updatedAt };
  const storage = new Map([
    [continueLearningStorageKey("student-a"), serializeContinueLearningFallback(valid)],
    [continueLearningStorageKey("student-b"), serializeContinueLearningFallback(other)],
  ]);
  assert.equal(continueLearningStorageKey("student-a"), "aeck.continue-learning.v1:student-a");
  for (const [userId, expected] of [["student-a", valid], ["student-b", other], ["student-c", null]]) {
    let reads = 0;
    assert.deepEqual(readContinueLearningFallback(() => { reads++; return storage.get(continueLearningStorageKey(userId)) ?? null; }), expected);
    assert.equal(reads, 1);
  }
});

test("stale storage schema is rejected; timestamp age alone has no TTL contract", () => {
  assert.equal(parseContinueLearningFallback(JSON.stringify({ ...valid, version: 0 })), null);
  const old = { ...valid, updatedAt: "2000-01-01T00:00:00.000Z" };
  assert.deepEqual(parseContinueLearningFallback(serializeContinueLearningFallback(old)), old);
});
