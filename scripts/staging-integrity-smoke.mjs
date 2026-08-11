import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("Supabase URL and service role key are required");

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const email = `integrity-${suffix}@staging.invalid`;
const password = `Integrity-${suffix}-Aa1!`;
let userId = null;
let attemptId = null;
let adjustmentId = null;
let grantId = null;
let scoringVersionId = null;
let regradeRunId = null;

async function requireNoError(result, message) {
  assert.equal(result.error, null, result.error?.message ?? message);
  return result.data;
}

const exam = await requireNoError(
  await admin.from("exams").select("id").limit(1).maybeSingle(),
  "could not find staging exam",
);
const section = await requireNoError(
  await admin.from("exam_sections").select("id").eq("exam_id", exam.id).order("sort_order").limit(1).maybeSingle(),
  "could not find staging section",
);
const questions = await requireNoError(
  await admin.from("exam_questions").select("id").eq("section_id", section.id).order("sort_order").limit(3),
  "could not find staging questions",
);
const question = questions?.[0];
assert.ok(exam?.id && section?.id && questions?.length >= 3 && question?.id);

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null, created.error?.message ?? "could not create integrity identity");
  userId = created.data.user?.id ?? null;
  assert.ok(userId);

  await requireNoError(await admin.from("profiles").upsert({
    id: userId,
    full_name: "Integrity staging identity",
    role: "student",
    status: "active",
    account_status: "active",
  }, { onConflict: "id" }), "could not create integrity profile");

  const inserted = await admin.from("exam_attempts").insert({
    student_id: userId,
    exam_id: exam.id,
    section_id: section.id,
    title: "Integrity staging attempt",
    mode: "exam",
    status: "in_progress",
    answers: {},
    question_order: [question.id],
    option_order: { [question.id]: [] },
    flagged_questions: [question.id],
    exam_code: "901",
    policy_snapshot: { timing: { durationMinutes: 60 }, navigation: { allowBacktrack: false } },
    policy_version: 7,
    progress_version: 0,
    duration_seconds: 3600,
    network_state: "online",
    scoring_version: 1,
    answer_key_snapshot: { [question.id]: { correct_answer: "A", points: 1 } },
  }).select("id").single();
  await requireNoError(inserted, "could not create integrity attempt");
  attemptId = inserted.data.id;

  const [firstSave, staleSave] = await Promise.all([
    admin.from("exam_attempts")
      .update({ answers: { [question.id]: "A" }, progress_version: 1, network_state: "saved" })
      .eq("id", attemptId).eq("progress_version", 0)
      .select("id,progress_version,answers").maybeSingle(),
    admin.from("exam_attempts")
      .update({ answers: { [question.id]: "B" }, progress_version: 1, network_state: "saved" })
      .eq("id", attemptId).eq("progress_version", 0)
      .select("id,progress_version,answers").maybeSingle(),
  ]);
  assert.equal(firstSave.error, null, firstSave.error?.message ?? "first autosave failed");
  assert.equal(staleSave.error, null, staleSave.error?.message ?? "stale autosave failed");
  const effectiveSaves = [firstSave.data, staleSave.data].filter(Boolean);
  assert.equal(effectiveSaves.length, 1, "both concurrent autosaves committed");
  assert.equal(effectiveSaves[0].progress_version, 1);

  const staleAfterCommit = await admin.from("exam_attempts")
    .update({ answers: { [question.id]: "STALE" }, progress_version: 2 })
    .eq("id", attemptId).eq("progress_version", 0)
    .select("id").maybeSingle();
  assert.equal(staleAfterCommit.error, null);
  assert.equal(staleAfterCommit.data, null, "stale autosave overwrote a newer version");

  const [submitA, submitB] = await Promise.all([
    admin.from("exam_attempts")
      .update({ status: "submitted", submitted_at: new Date().toISOString(), score: 1 })
      .eq("id", attemptId).eq("status", "in_progress")
      .select("id,status").maybeSingle(),
    admin.from("exam_attempts")
      .update({ status: "submitted", submitted_at: new Date().toISOString(), score: 0 })
      .eq("id", attemptId).eq("status", "in_progress")
      .select("id,status").maybeSingle(),
  ]);
  assert.equal(submitA.error, null, submitA.error?.message ?? "submit A failed");
  assert.equal(submitB.error, null, submitB.error?.message ?? "submit B failed");
  assert.equal([submitA.data, submitB.data].filter(Boolean).length, 1, "both concurrent submits committed");

  const snapshot = await admin.from("exam_attempts")
    .select("question_order,option_order,flagged_questions,exam_code,policy_snapshot,policy_version,progress_version,answer_key_snapshot,status")
    .eq("id", attemptId).single();
  assert.equal(snapshot.error, null, snapshot.error?.message ?? "could not reload attempt snapshot");
  assert.deepEqual(snapshot.data.question_order, [question.id]);
  assert.deepEqual(snapshot.data.flagged_questions, [question.id]);
  assert.equal(snapshot.data.exam_code, "901");
  assert.equal(snapshot.data.policy_version, 7);
  assert.equal(snapshot.data.progress_version, 1);
  assert.equal(snapshot.data.status, "submitted");

  const adjustment = await admin.from("exam_attempt_adjustments").insert({
    attempt_kind: "account",
    attempt_id: attemptId,
    exam_id: exam.id,
    student_id: userId,
    extension_seconds: 600,
    reason: "Integrity staging extension",
    created_by: userId,
  }).select("id,extension_seconds").single();
  await requireNoError(adjustment, "could not persist time extension");
  adjustmentId = adjustment.data.id;
  assert.equal(adjustment.data.extension_seconds, 600);

  const grant = await admin.from("exam_attempt_grants").insert({
    exam_id: exam.id,
    student_id: userId,
    additional_attempts: 1,
    reason: "Integrity staging retry",
    created_by: userId,
  }).select("id").single();
  await requireNoError(grant, "could not persist retry grant");
  grantId = grant.data.id;

  const consumed = await admin.rpc("consume_exam_attempt_grant", {
    target_exam_id: exam.id,
    target_slot_id: null,
    target_student_id: userId,
    target_client_hash: null,
  });
  assert.equal(consumed.error, null, consumed.error?.message ?? "grant RPC failed");
  assert.equal(consumed.data?.[0]?.allowed, true);
  assert.equal(consumed.data?.[0]?.remaining, 0);

  const exhausted = await admin.rpc("consume_exam_attempt_grant", {
    target_exam_id: exam.id,
    target_slot_id: null,
    target_student_id: userId,
    target_client_hash: null,
  });
  assert.equal(exhausted.error, null, exhausted.error?.message ?? "second grant RPC failed");
  assert.equal(exhausted.data?.[0]?.allowed, false);

  const latestVersion = await admin.from("exam_scoring_versions")
    .select("version").eq("exam_id", exam.id).order("version", { ascending: false }).limit(1).maybeSingle();
  await requireNoError(latestVersion, "could not read scoring version");
  const version = Number(latestVersion.data?.version ?? 0) + 1;
  const scoring = await admin.from("exam_scoring_versions").insert({
    exam_id: exam.id,
    version,
    status: "draft",
    reason: "Integrity staging regrade",
    created_by: userId,
  }).select("id,status,version").single();
  await requireNoError(scoring, "could not create scoring version");
  scoringVersionId = scoring.data.id;

  const overrides = await admin.from("exam_question_overrides").insert([
    {
      scoring_version_id: scoringVersionId,
      question_id: questions[0].id,
      override_mode: "accept_multiple",
      accepted_answers: ["A", "B"],
      reason: "Integrity staging accept-multiple override",
    },
    {
      scoring_version_id: scoringVersionId,
      question_id: questions[1].id,
      override_mode: "void_question",
      accepted_answers: [],
      reason: "Integrity staging void override",
    },
    {
      scoring_version_id: scoringVersionId,
      question_id: questions[2].id,
      override_mode: "award_all",
      accepted_answers: [],
      reason: "Integrity staging award-all override",
    },
  ]).select("id,question_id,override_mode");
  await requireNoError(overrides, "could not create question overrides");
  assert.deepEqual(
    (overrides.data ?? []).map((row) => row.override_mode).sort(),
    ["accept_multiple", "award_all", "void_question"],
  );

  const run = await admin.from("exam_regrade_runs").insert({
    exam_id: exam.id,
    scoring_version_id: scoringVersionId,
    status: "preview",
    attempt_count: 1,
    affected_count: 3,
    summary: { staging: true },
    reason: "Integrity staging preview",
    created_by: userId,
  }).select("id,status,attempt_count,affected_count").single();
  await requireNoError(run, "could not create regrade preview");
  regradeRunId = run.data.id;
  assert.equal(run.data.status, "preview");
  assert.equal(run.data.affected_count, 3);

  console.log(JSON.stringify({
    snapshotStable: true,
    staleAutosaveRejected: true,
    effectiveAutosaves: effectiveSaves.length,
    effectiveSubmits: [submitA.data, submitB.data].filter(Boolean).length,
    extensionSeconds: adjustment.data.extension_seconds,
    retryConsumed: consumed.data?.[0]?.remaining === 0,
    retrySecondUseDenied: exhausted.data?.[0]?.allowed === false,
    overrideModes: (overrides.data ?? []).map((row) => row.override_mode).sort(),
    regradePreview: run.data.status,
  }));
} finally {
  if (regradeRunId) await admin.from("exam_regrade_runs").delete().eq("id", regradeRunId);
  if (scoringVersionId) await admin.from("exam_scoring_versions").delete().eq("id", scoringVersionId);
  if (adjustmentId) await admin.from("exam_attempt_adjustments").delete().eq("id", adjustmentId);
  if (grantId) await admin.from("exam_attempt_grants").delete().eq("id", grantId);
  if (attemptId) await admin.from("exam_attempts").delete().eq("id", attemptId);
  if (userId) await admin.from("profiles").delete().eq("id", userId);
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) {
      console.error(`auth cleanup failed: ${deleted.error.message}`);
      process.exitCode = 1;
    }
  }
}
