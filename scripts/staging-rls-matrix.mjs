import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error("Supabase URL, publishable key, and service role key are required");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonymous = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const password = `RlsSmoke-${suffix}-Aa1!`;
const emails = [
  `rls-student-a-${suffix}@staging.invalid`,
  `rls-student-b-${suffix}@staging.invalid`,
  `rls-admin-${suffix}@staging.invalid`,
];
const userIds = [];
const attemptIds = [];

function isDenied(error) {
  return Boolean(
    error &&
      (/permission denied|not authorized|insufficient privilege|could not find the function/i.test(error.message ?? "") ||
        ["42501", "PGRST301", "PGRST202"].includes(error.code)),
  );
}

function errorCode(error) {
  return error?.code ?? null;
}

async function createIdentity(email, role) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `RLS staging ${role}` },
  });
  assert.equal(created.error, null, created.error?.message ?? "failed to create staging identity");
  const userId = created.data.user?.id;
  assert.ok(userId, "staging identity did not return an id");
  userIds.push(userId);

  const profile = await admin.from("profiles").upsert({
    id: userId,
    full_name: `RLS staging ${role}`,
    role,
    status: "active",
    account_status: "active",
  }, { onConflict: "id" });
  assert.equal(profile.error, null, profile.error?.message ?? "failed to prepare staging profile");
  return userId;
}

async function signIn(email) {
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await client.auth.signInWithPassword({ email, password });
  assert.equal(result.error, null, result.error?.message ?? "failed to sign in staging identity");
  return client;
}

async function selectDenied(client, table, columns = "*") {
  const result = await client.from(table).select(columns).limit(1);
  assert.equal(isDenied(result.error), true, `${table} unexpectedly readable: ${result.error?.message ?? "no error"}`);
  return errorCode(result.error);
}

async function main() {
  const examResult = await admin.from("exams").select("id").limit(1).maybeSingle();
  if (examResult.error) {
    throw new Error(`RLS_SMOKE_PRECONDITION_FAILED: cannot read public.exams: ${examResult.error.message}`);
  }
  if (!examResult.data?.id) {
    throw new Error("RLS_SMOKE_PRECONDITION_FAILED: target has no exam fixture; apply the approved migration baseline and create a dedicated smoke fixture before running the write matrix");
  }

  try {
  const studentAId = await createIdentity(emails[0], "student");
  const studentBId = await createIdentity(emails[1], "student");
  await createIdentity(emails[2], "admin");

  const inserted = await admin.from("exam_attempts").insert([
    {
      student_id: studentAId,
      exam_id: examResult.data.id,
      title: "RLS staging attempt A",
      score: 1,
      correct_answers: 1,
      total_questions: 1,
      status: "completed",
    },
    {
      student_id: studentBId,
      exam_id: examResult.data.id,
      title: "RLS staging attempt B",
      score: 0,
      correct_answers: 0,
      total_questions: 1,
      status: "completed",
    },
  ]).select("id,student_id");
  assert.equal(inserted.error, null, inserted.error?.message ?? "failed to prepare staging attempts");
  assert.equal(inserted.data?.length, 2);
  attemptIds.push(...inserted.data.map((row) => row.id));

  const [attemptAId, attemptBId] = attemptIds;
  const studentA = await signIn(emails[0]);
  const studentB = await signIn(emails[1]);
  const adminClient = await signIn(emails[2]);

  const ownA = await studentA.from("exam_attempts")
    .select("id,student_id,title,score,correct_answers,total_questions,submitted_at,status")
    .eq("id", attemptAId)
    .maybeSingle();
  assert.equal(ownA.error, null, ownA.error?.message ?? "student A could not read own projection");
  assert.equal(ownA.data?.id, attemptAId);

  const crossA = await studentA.from("exam_attempts").select("id").eq("id", attemptBId).maybeSingle();
  assert.equal(crossA.error, null, crossA.error?.message ?? "student A cross-read returned an error");
  assert.equal(crossA.data, null, "student A can read student B attempt");

  const ownB = await studentB.from("exam_attempts").select("id").eq("id", attemptBId).maybeSingle();
  assert.equal(ownB.error, null, ownB.error?.message ?? "student B could not read own projection");
  assert.equal(ownB.data?.id, attemptBId);

  const anonymousAttemptDenied = await selectDenied(anonymous, "exam_attempts");
  const anonymousGuestDenied = await selectDenied(anonymous, "guest_exam_attempts");

  const operationTables = [
    "exam_access_slots",
    "guest_exam_attempts",
    "request_rate_limits",
    "exam_admin_audit_logs",
    "exam_attempt_adjustments",
    "exam_attempt_grants",
    "exam_scoring_versions",
    "exam_question_overrides",
    "exam_regrade_runs",
    "exam_policy_presets",
    "exam_templates",
    "exam_slot_candidates",
  ];
  const studentOperationDenials = {};
  for (const table of operationTables) {
    studentOperationDenials[table] = await selectDenied(studentA, table);
  }

  const updateAttempt = await studentA.from("exam_attempts")
    .update({ title: "forbidden" })
    .eq("id", attemptAId)
    .select("id");
  assert.equal(isDenied(updateAttempt.error), true, "student can update an attempt");

  const grantRpc = await studentA.rpc("consume_exam_attempt_grant", {
    target_exam_id: examResult.data.id,
    target_slot_id: null,
    target_student_id: studentAId,
    target_client_hash: null,
  });
  assert.equal(isDenied(grantRpc.error), true, "student can execute grant RPC");

  const rateRpc = await studentA.rpc("consume_request_budget", {
    target_scope: "student_forbidden",
    target_subject_hash: "s".repeat(64),
    target_capacity: 1,
    target_refill_seconds: 60,
    target_cost: 1,
  });
  assert.equal(isDenied(rateRpc.error), true, "student can execute rate-limit RPC");

  const accountStatusRpc = await studentA.rpc("is_account_active", { target_user_id: studentBId });
  assert.equal(isDenied(accountStatusRpc.error), true, "student can probe another account status");

  const keyRead = await studentA.from("exam_question_keys").select("question_id,correct_answer").limit(1);
  assert.equal(keyRead.error === null && (keyRead.data?.length ?? 0) > 0, false, "answer key exposed to student");

  const rawSourceRead = await studentA.from("exam_questions").select("latex_source,solution_source").limit(1);
  assert.equal(rawSourceRead.error === null && (rawSourceRead.data?.length ?? 0) > 0, false, "raw authoring source exposed to student");

  const adminAttempts = await adminClient.from("exam_attempts").select("id").limit(100);
  assert.equal(adminAttempts.error, null, adminAttempts.error?.message ?? "admin cannot read learner projection");
  assert.ok((adminAttempts.data?.length ?? 0) >= 2);

  const adminAuditDirect = await adminClient.from("exam_admin_audit_logs").select("id").limit(1);
  assert.equal(isDenied(adminAuditDirect.error), true, "admin browser role can read server-only audit table directly");

  console.log(JSON.stringify({
    studentOwnRead: true,
    crossStudentRead: false,
    anonymousAttemptDenied,
    anonymousGuestDenied,
    studentOperationDenials,
    studentUpdateDenied: errorCode(updateAttempt.error),
    grantRpcDenied: errorCode(grantRpc.error),
    rateRpcDenied: errorCode(rateRpc.error),
    accountStatusRpcDenied: errorCode(accountStatusRpc.error),
    answerKeyDataExposed: false,
    rawAuthoringDataExposed: false,
    adminProjectionRows: adminAttempts.data?.length ?? 0,
    adminAuditDirectDenied: errorCode(adminAuditDirect.error),
  }));
  } finally {
  const attemptCleanup = attemptIds.length
    ? await admin.from("exam_attempts").delete().in("id", attemptIds)
    : { error: null };
  if (attemptCleanup.error) {
    console.error(`attempt cleanup failed: ${attemptCleanup.error.message}`);
    process.exitCode = 1;
  }

  const profileCleanup = userIds.length
    ? await admin.from("profiles").delete().in("id", userIds)
    : { error: null };
  if (profileCleanup.error) {
    console.error(`profile cleanup failed: ${profileCleanup.error.message}`);
    process.exitCode = 1;
  }

  for (const userId of userIds) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) {
      console.error(`auth cleanup failed: ${deleted.error.message}`);
      process.exitCode = 1;
    }
  }
  }
}

await main().catch(error => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
});
