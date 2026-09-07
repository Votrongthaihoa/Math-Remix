import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { createClient } from "@supabase/supabase-js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedProjectRef = "glxlzzxpfmtulppojwis";
const args = process.argv.slice(2);
const allowRemoteWrites = args.includes("--allow-remote-writes");
const envFileArg = args.find(argument => argument.startsWith("--env-file="));
const envFile = envFileArg?.slice("--env-file=".length) || ".env.production.smoke";
const remoteRequestTimeoutMs = 15_000;
let finalMarkerWritten = false;

console.log(`DEPLOY_CHECK_STARTED project=${expectedProjectRef} remoteWrites=${allowRemoteWrites}`);

process.on("beforeExit", () => {
  if (finalMarkerWritten) return;
  finalMarkerWritten = true;
  console.error("DEPLOY_NOT_READY: FINAL_MARKER_MISSING");
  process.exitCode = 1;
});

const requiredTables = [
  "account_violations",
  "admin_actions",
  "chapters",
  "course_enrollments",
  "courses",
  "course_schedule_rules",
  "course_schedule_events",
  "device_verification_challenges",
  "exam_access_slots",
  "exam_admin_audit_logs",
  "exam_attempt_adjustments",
  "exam_attempt_grants",
  "exam_attempts",
  "exam_policy_presets",
  "exam_question_keys",
  "exam_question_overrides",
  "exam_questions",
  "exam_regrade_runs",
  "exam_room_enrollments",
  "exam_rooms",
  "exam_scoring_versions",
  "exam_sections",
  "exam_slot_candidates",
  "exam_templates",
  "exams",
  "guest_exam_attempts",
  "lesson_resources",
  "lessons",
  "microsoft_graph_connections",
  "profiles",
  "question_bank_item_versions",
  "question_bank_items",
  "question_bank_nodes",
  "question_banks",
  "request_rate_limits",
  "security_events",
  "student_sequences",
  "trusted_devices",
  "user_sessions",
];

async function run(command, commandArgs, env) {
  const child = spawn(command, commandArgs, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    shell: false,
  });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 15 * 60_000);
  const [code, signal] = await once(child, "exit");
  clearTimeout(timeout);
  if (code !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed with ${signal ?? `exit ${code}`}`);
  }
}

async function assertHeadSchema(admin) {
  const failures = [];
  for (const table of requiredTables) {
    const result = await admin.from(table).select("*").limit(0);
    if (!result.error) continue;
    if (!result.error.code || /abort|fetch|network|timeout/i.test(result.error.message ?? "")) {
      throw new Error(`REMOTE_REQUEST_FAILED ${table}: ${result.error.message ?? "network error"}`);
    }
    failures.push(`${table}: ${result.error.code}`);
  }
  assert.deepEqual(failures, [], `REMOTE_SCHEMA_NOT_HEAD: ${failures.join(", ")}`);

  const graphResourceColumns = await admin
    .from("lesson_resources")
    .select("provider,provider_drive_id,provider_item_id,provider_metadata")
    .limit(0);
  if (graphResourceColumns.error) {
    const status = graphResourceColumns.status ?? 0;
    if (status === 0 || status >= 500 || /abort|fetch|network|timeout/i.test(graphResourceColumns.error.message ?? "")) {
      throw new Error(`REMOTE_REQUEST_FAILED lesson_resources Graph columns: ${graphResourceColumns.error.message ?? "network error"}`);
    }
    throw new Error(`REMOTE_SCHEMA_NOT_HEAD: lesson_resources Graph columns (HTTP ${status})`);
  }

  const courseScheduleColumns = await admin
    .from("course_schedule_events")
    .select("id,course_id,lesson_id,title,description,start_at,end_at,instructor,delivery_mode,event_kind,source,status,published,created_by")
    .limit(0);
  if (courseScheduleColumns.error) {
    const status = courseScheduleColumns.status ?? 0;
    if (status === 0 || status >= 500 || /abort|fetch|network|timeout/i.test(courseScheduleColumns.error.message ?? "")) {
      throw new Error(`REMOTE_REQUEST_FAILED course_schedule_events: ${courseScheduleColumns.error.message ?? "network error"}`);
    }
    throw new Error(`REMOTE_SCHEMA_NOT_HEAD: course_schedule_events (HTTP ${status})`);
  }
}

async function assertSmokeFixture(admin) {
  const exams = await admin.from("exams").select("id").limit(100);
  assert.equal(exams.error, null, exams.error?.message ?? "cannot read exams");
  for (const exam of exams.data ?? []) {
    const sections = await admin.from("exam_sections")
      .select("id")
      .eq("exam_id", exam.id)
      .order("sort_order")
      .limit(100);
    assert.equal(sections.error, null, sections.error?.message ?? "cannot read exam sections");
    for (const section of sections.data ?? []) {
      const questions = await admin.from("exam_questions")
        .select("id", { count: "exact", head: true })
        .eq("section_id", section.id);
      assert.equal(questions.error, null, questions.error?.message ?? "cannot read exam questions");
      if ((questions.count ?? 0) >= 3) return;
    }
  }
  throw new Error("REMOTE_FIXTURE_MISSING: no exam section has at least 3 questions");
}

async function assertCleanup(admin) {
  const [profiles, attempts, rateRows, authUsers] = await Promise.all([
    admin.from("profiles").select("id,full_name").limit(5000),
    admin.from("exam_attempts").select("id,title").limit(5000),
    admin.from("request_rate_limits").select("subject_hash").like("subject_hash", "staging-%").limit(5000),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  for (const result of [profiles, attempts, rateRows, authUsers]) {
    assert.equal(result.error, null, result.error?.message ?? "cleanup probe failed");
  }

  const smokeNames = new Set([
    "Integrity staging identity",
    "Auth route staging identity",
  ]);
  const profileLeftovers = (profiles.data ?? []).filter(row =>
    row.full_name?.startsWith("RLS staging ") || smokeNames.has(row.full_name),
  );
  const attemptLeftovers = (attempts.data ?? []).filter(row =>
    row.title?.startsWith("RLS staging attempt") || row.title === "Integrity staging attempt",
  );
  const authLeftovers = (authUsers.data?.users ?? []).filter(user =>
    /^(?:rls-|integrity-|auth-route-).*@staging\.invalid$/i.test(user.email ?? ""),
  );

  assert.equal(profileLeftovers.length, 0, "REMOTE_CLEANUP_FAILED: smoke profiles remain");
  assert.equal(attemptLeftovers.length, 0, "REMOTE_CLEANUP_FAILED: smoke attempts remain");
  assert.equal((rateRows.data ?? []).length, 0, "REMOTE_CLEANUP_FAILED: rate-limit rows remain");
  assert.equal(authLeftovers.length, 0, "REMOTE_CLEANUP_FAILED: smoke auth users remain");
}

async function main() {
  const fileEnvironment = parseEnv(await readFile(resolve(repoRoot, envFile), "utf8"));
  const env = { ...process.env, ...fileEnvironment };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && publishableKey && serviceRoleKey, `Missing Supabase credentials in ${envFile}`);

  const hostname = new URL(url).hostname;
  assert.equal(hostname, `${expectedProjectRef}.supabase.co`, `WRONG_REMOTE_PROJECT: ${hostname}`);
  console.log(`REMOTE_PROJECT_OK ${expectedProjectRef}`);

  const timedFetch = (input, init = {}) => {
    const timeoutSignal = AbortSignal.timeout(remoteRequestTimeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
    return fetch(input, { ...init, signal });
  };
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timedFetch },
  });
  await assertHeadSchema(admin);
  await assertSmokeFixture(admin);
  console.log("REMOTE_READ_ONLY_PREFLIGHT_OK");

  assert.ok(process.env.npm_execpath, "LOCAL_NPM_EXEC_PATH_MISSING: run this gate through npm");
  await run(process.execPath, [process.env.npm_execpath, "run", "release:check"], {
    ...env,
    WRANGLER_ENV_FILE: resolve(repoRoot, envFile),
  });
  console.log("LOCAL_RELEASE_GATES_OK");

  assert.equal(
    allowRemoteWrites,
    true,
    "REMOTE_WRITE_SMOKE_NOT_AUTHORIZED: rerun with --allow-remote-writes",
  );

  for (const script of [
    "scripts/staging-rate-limit-smoke.mjs",
    "scripts/staging-rls-matrix.mjs",
    "scripts/staging-integrity-smoke.mjs",
    "scripts/staging-auth-route-smoke.mjs",
  ]) {
    await run(process.execPath, [script], env);
  }
  await assertCleanup(admin);

  finalMarkerWritten = true;
  console.log(`DEPLOY_READY project=${expectedProjectRef} local=PASS remote=PASS cleanup=PASS`);
}

await main().catch(error => {
  finalMarkerWritten = true;
  console.error(`DEPLOY_NOT_READY: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
