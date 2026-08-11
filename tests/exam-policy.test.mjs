import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ExamPolicy normalizes legacy guest settings into one official policy", async () => {
  const { policyFromGuestSettings } = await import("../lib/exam-policy.ts");
  const policy = policyFromGuestSettings({
    maxAttempts: 2,
    shuffleQuestions: true,
    shuffleAnswers: true,
    subExamCount: 5,
    autoMonitor: "advanced",
    showScore: "after_submit",
    showAnswers: "threshold",
    answerThreshold: 80,
    hideWrongAnswers: true,
  }, {
    examType: "THPTQG",
    durationMinutes: 90,
    opensAt: "2026-08-08T09:00:00.000Z",
    closesAt: "2026-08-08T10:30:00.000Z",
    gracePeriodMinutes: 15,
    passwordRequired: true,
  });

  assert.equal(policy.version, 1);
  assert.equal(policy.mode, "official");
  assert.equal(policy.access.audience, "guest");
  assert.equal(policy.access.accountRequired, false);
  assert.equal(policy.access.maxAttempts, 2);
  assert.equal(policy.access.passwordRequired, true);
  assert.equal(policy.timing.durationMinutes, 90);
  assert.equal(policy.randomization.shuffleQuestions, true);
  assert.equal(policy.randomization.shuffleOptions, true);
  assert.equal(policy.randomization.questionPoolSize, 5);
  assert.equal(policy.randomization.seedStrategy, "attempt");
  assert.equal(policy.integrity.fullscreenRequired, true);
  assert.equal(policy.integrity.focusMonitoring, true);
  assert.equal(policy.release.score, "after_submit");
  assert.equal(policy.release.answers, "threshold");
  assert.equal(policy.release.hideWrongAnswers, true);
});

test("attempt policy gets a private seed while the public projection removes it", async () => {
  const { createAttemptPolicy, normalizeExamPolicy, publicExamPolicy, resolveAttemptPolicy } = await import("../lib/exam-policy.ts");
  const policy = normalizeExamPolicy({
    mode: "official",
    randomization: { shuffleQuestions: true, seedStrategy: "attempt" },
  }, { examType: "TSA", audience: "account" });
  const snapshot = createAttemptPolicy(policy);
  assert.match(snapshot.randomization.seed ?? "", /^[0-9a-f-]{16,128}$/i);
  assert.equal(publicExamPolicy(snapshot).randomization.seed, null);
  assert.equal(resolveAttemptPolicy(snapshot, policy).randomization.seed, snapshot.randomization.seed);
  assert.equal(resolveAttemptPolicy({}, policy).randomization.seed, null);
});

test("seeded randomization is stable per attempt and preserves the source array", async () => {
  const { shuffleWithSeed } = await import("../lib/exam-policy.ts");
  const original = ["q1", "q2", "q3", "q4", "q5"];
  const first = shuffleWithSeed(original, "attempt-seed");
  const second = shuffleWithSeed(original, "attempt-seed");
  assert.deepEqual(first, second);
  assert.deepEqual(original, ["q1", "q2", "q3", "q4", "q5"]);
  assert.notDeepEqual(shuffleWithSeed(original, "another-seed"), original);
});

test("question randomization keeps adjacent passage groups atomic", async () => {
  const { normalizeExamPolicy, createAttemptPolicy, prepareQuestionIdentityForPolicy } = await import("../lib/exam-policy.ts");
  const policy = createAttemptPolicy(normalizeExamPolicy({ randomization: { shuffleQuestions: true, shuffleOptions: true, seedStrategy: "attempt" } }, { examType: "TSA", audience: "account" }));
  const result = prepareQuestionIdentityForPolicy([
    { id: "q1", section_id: "s1", passage: "P1", optionValues: ["A", "B"] },
    { id: "q2", section_id: "s1", passage: "P1", optionValues: ["A", "B"] },
    { id: "q3", section_id: "s1", passage: "P2", optionValues: ["A", "B"] },
    { id: "q4", section_id: "s1", passage: "P1", optionValues: ["A", "B"] },
  ], policy);
  const indices = result.questionOrder.map(id => ["q1", "q2", "q3", "q4"].indexOf(id));
  assert.ok(Math.abs(indices.indexOf(0) - indices.indexOf(1)) === 1);
  assert.ok(Array.isArray(result.optionOrder.q1));
});

test("policy snapshots are added to both authenticated and guest attempts", async () => {
  const [migration, schema, examRoute, guestRoute] = await Promise.all([
    source("supabase/migrations/023_exam_policy_snapshots.sql"),
    source("supabase/schema.sql"),
    source("app/api/exams/route.ts"),
    source("app/api/guest-exams/route.ts"),
  ]);
  for (const table of ["exam_attempts", "guest_exam_attempts"]) {
    assert.match(migration, new RegExp(`alter table if exists public\\.${table}`));
    assert.match(migration, /add column if not exists policy_snapshot jsonb/i);
    assert.match(migration, /add column if not exists policy_version integer/i);
  }
  assert.match(migration, /jsonb_typeof\(policy_snapshot\) = 'object'/i);
  assert.match(schema, /policy_snapshot jsonb not null default '\{\}'::jsonb/i);
  assert.match(examRoute, /policy_snapshot: attemptPolicy/);
  assert.match(examRoute, /createAttemptPolicy/);
  assert.match(guestRoute, /policy_snapshot: attemptPolicy/);
  assert.match(guestRoute, /prepareQuestionsForPolicy/);
  assert.doesNotMatch(guestRoute, /randomization\.seed[^\n]*publicExamPolicy/);
});

test("operations migrations add concurrency, monitoring, and scoring primitives", async () => {
  const [migration, audit] = await Promise.all([
    source("supabase/migrations/025_exam_attempt_integrity.sql"),
    source("supabase/migrations/026_exam_operations_audit.sql"),
  ]);
  assert.match(migration, /monitor_events jsonb/i);
  assert.match(migration, /exam_attempts_active_scope_idx/i);
  assert.match(migration, /guest_exam_attempts_active_session_idx/i);
  assert.match(audit, /extend_exam_attempt_time/);
  assert.match(audit, /apply_exam_regrade/);
});

test("answer key snapshot migration is forward-only and server-side", async () => {
  const [migration, contentServer, resultRoute] = await Promise.all([
    source("supabase/migrations/027_attempt_answer_key_snapshots.sql"),
    source("lib/exam-content-server.ts"),
    source("app/api/exams/result-content/route.ts"),
  ]);
  assert.match(migration, /add column if not exists answer_key_snapshot jsonb/i);
  assert.match(migration, /jsonb_typeof\(answer_key_snapshot\) = 'object'/i);
  assert.match(contentServer, /answer_key_snapshot/);
  assert.match(resultRoute, /delete repairedAttempt\.answer_key_snapshot/);
});

test("attempt Data API grants do not expose protected payloads", async () => {
  const [migration, schema] = await Promise.all([
    source("supabase/migrations/028_exam_attempt_least_privilege.sql"),
    source("supabase/schema.sql"),
  ]);
  assert.match(migration, /revoke all on table public\.exam_attempts from anon, authenticated/i);
  assert.match(migration, /grant select \([\s\S]*submitted_at[\s\S]*status[\s\S]*\) on table public\.exam_attempts to authenticated/i);
  assert.match(migration, /revoke all on table public\.guest_exam_attempts from anon, authenticated/i);
  assert.match(schema, /revoke all on table public\.guest_exam_attempts from anon, authenticated/i);
});
