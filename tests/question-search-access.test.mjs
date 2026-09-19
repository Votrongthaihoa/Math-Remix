import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { releasedQuestionSearchScope } from "../lib/question-search-access.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const EXAM_ID = "33333333-3333-4333-8333-333333333333";
const ROOM_ID = "44444444-4444-4444-8444-444444444444";

function releasedPolicy(overrides = {}) {
  return {
    version: 1,
    mode: "practice",
    release: { score: "after_submit", answers: "after_submit", solutions: "never", ...overrides },
  };
}

function scope(overrides = {}) {
  return releasedQuestionSearchScope({
    userId: USER_ID,
    attempts: [{
      student_id: USER_ID,
      exam_id: EXAM_ID,
      status: "submitted",
      score: 80,
      question_order: ["question-one", "question-two", "question-one"],
      policy_snapshot: releasedPolicy(),
      mode: "practice",
    }],
    exams: [{
      id: EXAM_ID,
      room_id: ROOM_ID,
      published: true,
      settings: {},
      results_released_at: null,
    }],
    rooms: [{ id: ROOM_ID, published: true, access_mode: "open" }],
    enrolledRoomIds: new Set(),
    now: Date.parse("2026-09-15T00:00:00.000Z"),
    ...overrides,
  });
}

test("learner search includes only immutable question IDs from an owned completed released attempt", () => {
  assert.deepEqual([...scope().questionIds], ["question-one", "question-two"]);
});

test("learner search fails closed for unauthorized, unreleased, unpublished, or legacy attempts", () => {
  assert.equal(scope({ attempts: [{ student_id: OTHER_USER_ID, exam_id: EXAM_ID, status: "submitted", question_order: ["secret"], policy_snapshot: releasedPolicy() }] }).questionIds.size, 0);
  assert.equal(scope({ attempts: [{ student_id: USER_ID, exam_id: EXAM_ID, status: "in_progress", question_order: ["secret"], policy_snapshot: releasedPolicy() }] }).questionIds.size, 0);
  assert.equal(scope({ attempts: [{ student_id: USER_ID, exam_id: EXAM_ID, status: "submitted", question_order: ["secret"], policy_snapshot: releasedPolicy({ answers: "never" }) }] }).questionIds.size, 0);
  assert.equal(scope({ exams: [{ id: EXAM_ID, room_id: ROOM_ID, published: false, settings: {} }] }).questionIds.size, 0);
  assert.equal(scope({ rooms: [{ id: ROOM_ID, published: false, access_mode: "open" }] }).questionIds.size, 0);
  assert.equal(scope({ rooms: [{ id: ROOM_ID, published: true, access_mode: "assigned" }] }).questionIds.size, 0);
  assert.equal(scope({ attempts: [{ student_id: USER_ID, exam_id: EXAM_ID, status: "submitted", question_order: null, policy_snapshot: releasedPolicy() }] }).questionIds.size, 0);
});

test("assigned rooms require the current learner enrollment", () => {
  const rooms = [{ id: ROOM_ID, published: true, access_mode: "assigned" }];
  assert.equal(scope({ rooms, enrolledRoomIds: new Set() }).questionIds.size, 0);
  assert.deepEqual([...scope({ rooms, enrolledRoomIds: new Set([ROOM_ID]) }).questionIds], ["question-one", "question-two"]);
});

test("question-search response projection cannot leak source, keys, or solutions", async () => {
  const source = await readFile(new URL("../app/api/question-search/route.ts", import.meta.url), "utf8");
  const select = source.match(/\.from\("exam_questions"\)[\s\S]*?\.select\("([^"]+)"\)/)?.[1] ?? "";
  assert.match(select, /\bid\b/);
  assert.match(select, /\bprompt\b/);
  assert.doesNotMatch(select, /solution_source|latex_source|correct_answer|answer_key/i);
  assert.match(source, /explanation:\s*null/);
  assert.match(source, /allowedQuestionIds\.has\(id\)/);
  assert.match(source, /builder = builder\.in\("id", \[\.\.\.allowedQuestionIds\]\)/);
  assert.match(source, /allowedSectionIds\.has/);
});
