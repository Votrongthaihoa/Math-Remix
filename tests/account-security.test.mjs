import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("account-sharing migration contains escalating bans and server-side RLS checks", async () => {
  const sql = await source("supabase/migrations/007_account_sharing_security.sql");
  for (const table of ["trusted_devices", "user_sessions", "security_events", "account_violations", "admin_actions"]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(sql, /when 1 then interval '24 hours'/);
  assert.match(sql, /when 2 then interval '48 hours'/);
  assert.match(sql, /when 3 then interval '72 hours'/);
  assert.match(sql, /when 4 then interval '7 days'/);
  assert.match(sql, /next_count >= 5/);
  assert.match(sql, /as restrictive for select to authenticated/);
  assert.match(sql, /revoke update on table public\.profiles from authenticated/);
  assert.match(sql, /set search_path = ''/);
});

test("fresh-project bootstrap includes the final account-security state", async () => {
  const sql = await source("supabase/schema.sql");
  assert.match(sql, /^begin;/i);
  assert.match(sql, /commit;\s*$/i);
  for (const table of ["trusted_devices", "user_sessions", "device_verification_challenges", "security_events", "account_violations", "admin_actions"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
  }
  assert.match(sql, /account_status text not null default 'active'/i);
  assert.match(sql, /create or replace function private\.is_account_active\(\)/i);
  assert.match(sql, /create or replace function public\.apply_account_violation/i);
  assert.match(sql, /revoke all on function public\.handle_new_user\(\)[\s\S]*?to service_role/i);
  assert.doesNotMatch(sql, /select public\.is_account_active/i);
  assert.match(sql, /BOOTSTRAP_STAGE_EXAM_ROOMS_CREATE/i);
  for (const policy of ["chapters", "course enrollments", "courses", "exam attempts", "exam enrollments", "exam rooms", "exams", "resources", "lessons"]) {
    assert.match(sql, new RegExp(`create policy "active account ${policy}"`, "i"));
  }
});

test("fresh-project bootstrap revokes table privileges that bypass RLS", async () => {
  const sql = await source("supabase/schema.sql");
  assert.match(sql, /revoke truncate, references, trigger on table %I\.%I from anon, authenticated/i);
  assert.match(sql, /from pg_catalog\.pg_class relation/i);
  assert.match(sql, /namespace\.nspname = 'public'/i);
});

test("admin RLS helper moves to an unexposed private schema without changing policies", async () => {
  const sql = await source("supabase/migrations/041_private_admin_helper.sql");
  assert.match(sql, /begin;/i);
  assert.match(sql, /create or replace function private\.is_admin\(\)/i);
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(sql, /grant usage on schema private to anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function private\.is_admin\(\) to anon, authenticated, service_role/i);
  assert.match(sql, /pg_get_expr\(policy_record\.polqual/i);
  assert.match(sql, /pg_get_expr\(policy_record\.polwithcheck/i);
  assert.match(sql, /alter policy/i);
  assert.match(sql, /unexpected non-policy dependency/i);
  assert.match(sql, /dependency remains on public\.is_admin/i);
  assert.match(sql, /drop function if exists public\.is_admin\(\)/i);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
  assert.match(sql, /commit;/i);
});

test("admin helper migration converges when the public helper is already absent", async () => {
  const sql = await source("supabase/migrations/041_private_admin_helper.sql");
  assert.match(sql, /private_policy_count/i);
  assert.match(sql, /if admin_function is not null then/i);
  assert.match(sql, /no policies depend on private\.is_admin\(\)/i);
  assert.doesNotMatch(sql, /raise exception 'public\.is_admin\(\) does not exist'/i);
  assert.match(sql, /drop function if exists public\.is_admin\(\)/i);
});

test("deployment verifier reports missing helpers and tables without aborting", async () => {
  const sql = await source("docs/exam-engine-staging-verification.sql");
  assert.match(sql, /to_regprocedure\('private\.is_account_active\(\)'\)/i);
  assert.match(sql, /has_function_privilege\('anon', private_helper, 'execute'\)/i);
  assert.match(sql, /to_regnamespace\('private'\)/i);
  assert.match(sql, /to_regclass\('public\.exam_attempts'\)/i);
  assert.match(sql, /if to_regclass\('public\.exam_access_slots'\) is null/i);
  assert.doesNotMatch(sql, /has_function_privilege\('anon', 'private\.is_account_active\(\)'/i);
});

test("deployment verifier uses a PostgreSQL-safe admin-helper regex", async () => {
  const sql = await source("docs/exam-engine-staging-verification.sql");
  assert.match(sql, /verification for Remix Study Edu migrations 017-042/i);
  assert.ok(sql.includes("'public[.]is_admin|(^|[^[:alnum:]_.])is_admin[[:space:]]*[(]'"));
});

test("legacy production inventory is read-only and captures migration inputs", async () => {
  const sql = await source("docs/production-legacy-baseline-inventory.sql");
  assert.doesNotMatch(sql, /^\s*(?:insert|update|delete|alter|drop|create|grant|revoke|truncate|do|call|copy)\b/im);
  for (const catalog of [
    "pg_catalog.pg_class",
    "pg_catalog.pg_attribute",
    "pg_catalog.pg_constraint",
    "pg_catalog.pg_indexes",
    "pg_catalog.pg_policies",
    "information_schema.role_table_grants",
    "pg_catalog.pg_proc",
    "pg_catalog.pg_trigger",
  ]) {
    assert.match(sql, new RegExp(catalog.replaceAll(".", "\\."), "i"));
  }
  for (const table of ["attempts", "attempt_details", "questions", "documents", "profiles", "courses", "lessons", "exams", "exam_sections"]) {
    assert.match(sql, new RegExp(`'${table}'`, "i"));
  }
});

test("legacy data-shape inventory is read-only and validates conversion branches", async () => {
  const sql = await source("docs/production-legacy-data-shape-inventory.sql");
  assert.doesNotMatch(sql, /^\s*(?:insert|update|delete|alter|drop|create|grant|revoke|truncate|do|call|copy)\b/im);
  for (const relation of ["auth.users", "attempt_details", "attempts", "courses", "documents", "exam_sections", "exams", "lesson_progress", "lessons", "profiles", "questions"]) {
    assert.match(sql, new RegExp(`from\\s+(?:public\\.)?${relation.replaceAll(".", "\\.")}`, "i"));
  }
  assert.match(sql, /group by profiles\.role/i);
  assert.match(sql, /group by questions\.type/i);
  assert.match(sql, /jsonb_typeof\(questions\.options\)/i);
  assert.match(sql, /jsonb_typeof\(questions\.correct_answer_json\)/i);
  assert.match(sql, /orphan/i);
});

test("active-account reconciliation creates the missing private-policy baseline", async () => {
  const sql = await source("supabase/migrations/042_active_account_policy_reconciliation.sql");
  assert.match(sql, /create or replace function private\.is_admin\(\)/i);
  assert.match(sql, /create or replace function private\.is_account_active\(\)/i);
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(sql, /grant execute on function private\.is_account_active\(\) to authenticated, service_role/i);
  assert.match(sql, /requires migration 041 final state/i);
  assert.match(sql, /drop policy if exists "active account exam sections"/i);
  assert.match(sql, /drop policy if exists "active account exam questions"/i);
  for (const policy of [
    "active account chapters",
    "active account course enrollments",
    "active account courses",
    "active account exam attempts",
    "active account exam enrollments",
    "active account exam rooms",
    "active account exams",
    "active account resources",
    "active account lessons",
  ]) {
    assert.match(sql, new RegExp(`create policy "${policy}"`, "i"));
  }
  assert.match(sql, /as restrictive for all to authenticated[\s\S]*?student_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /expected 9 active-account policies/i);
  assert.doesNotMatch(sql, /\(select public\.is_admin\(\)\)/i);
  assert.doesNotMatch(sql, /using \(public\.is_admin\(\)/i);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
  assert.match(sql, /commit;/i);
});

test("active-account reconciliation requires the complete migration 041 baseline", async () => {
  const sql = await source("supabase/migrations/042_active_account_policy_reconciliation.sql");
  assert.match(sql, /private_admin_function oid := pg_catalog\.to_regprocedure\('private\.is_admin\(\)'\)/i);
  assert.match(sql, /private\.is_admin\(\) is missing/i);
  assert.match(sql, /dependency\.classid = 'pg_catalog\.pg_policy'::pg_catalog\.regclass/i);
});

test("active-account reconciliation validates helper columns before DDL", async () => {
  const sql = await source("supabase/migrations/042_active_account_policy_reconciliation.sql");
  assert.match(sql, /missing_columns text\[\]/i);
  for (const column of [
    "public.profiles.id",
    "public.profiles.role",
    "public.profiles.status",
    "public.profiles.account_status",
    "public.profiles.banned_until",
    "public.exam_attempts.student_id",
  ]) {
    assert.match(sql, new RegExp(column.replaceAll(".", "\\."), "i"));
  }
  assert.match(sql, /is missing required columns/i);
});

test("empty legacy bootstrap fails closed before replacing the schema", async () => {
  const [sql, schema] = await Promise.all([
    source("supabase/migrations/043_empty_legacy_head_bootstrap.sql"),
    source("supabase/schema.sql"),
  ]);
  assert.match(sql, /^begin;/i);
  assert.match(sql, /expected_tables text\[\]/i);
  assert.match(sql, /auth\.users is not empty/i);
  assert.match(sql, /legacy tables are not empty/i);
  assert.match(sql, /requires the verified legacy schema fingerprint/i);
  const firstDrop = sql.search(/drop table public\.attempt_details/i);
  assert.ok(firstDrop > sql.search(/legacy tables are not empty/i));
  assert.match(sql, /create table if not exists public\.exam_attempts/i);
  assert.match(sql, /create or replace function private\.is_account_active\(\)/i);
  assert.match(sql, /expected 36 HEAD relations/i);
  assert.ok(sql.includes(schema.replace(/^\uFEFF?begin;\s*/i, "").replace(/\s*commit;\s*$/i, "").trim()));
  assert.match(sql, /commit;\s*$/i);
});

test("production legacy bootstrap dry-run always rolls back", async () => {
  const [migration, dryRun] = await Promise.all([
    source("supabase/migrations/043_empty_legacy_head_bootstrap.sql"),
    source("docs/production-043-empty-legacy-bootstrap-dry-run.sql"),
  ]);
  assert.match(dryRun, /DRY RUN ONLY/i);
  assert.match(dryRun, /rollback;\s*$/i);
  assert.doesNotMatch(dryRun, /commit;\s*$/i);
  assert.ok(dryRun.includes(migration.replace(/commit;\s*$/i, "rollback;").trim()));
});

test("deploy readiness command locks production and runs every release gate", async () => {
  const [script, pkg] = await Promise.all([
    source("scripts/deploy-readiness-check.mjs"),
    source("package.json").then(JSON.parse),
  ]);
  assert.equal(pkg.scripts["deploy:check"], "node scripts/deploy-readiness-check.mjs");
  assert.match(script, /glxlzzxpfmtulppojwis/);
  assert.match(script, /\.env\.production\.smoke/);
  assert.match(script, /--allow-remote-writes/);
  for (const gate of ["release:check", "staging-rate-limit-smoke.mjs", "staging-rls-matrix.mjs", "staging-integrity-smoke.mjs", "staging-auth-route-smoke.mjs"]) {
    assert.match(script, new RegExp(gate.replaceAll(".", "\\.")));
  }
  for (const table of ["exam_attempts", "guest_exam_attempts", "request_rate_limits", "question_banks", "user_sessions"]) {
    assert.match(script, new RegExp(`"${table}"`));
  }
  assert.match(script, /DEPLOY_READY/);
  assert.match(script, /DEPLOY_CHECK_STARTED/);
  assert.match(script, /AbortSignal\.timeout/);
  assert.match(script, /beforeExit/);
  assert.match(script, /FINAL_MARKER_MISSING/);
});

test("RLS matrix exits cleanly when the target has no exam fixture", async () => {
  const script = await source("scripts/staging-rls-matrix.mjs");
  assert.match(script, /RLS_SMOKE_PRECONDITION_FAILED/);
  assert.match(script, /async function main\(\)/);
  assert.match(script, /await main\(\)\.catch/);
  assert.ok(script.lastIndexOf("await main().catch") > script.lastIndexOf("for (const userId of userIds)"));
  assert.doesNotMatch(script, /assert\.ok\(examResult\.data\?\.id, "staging has no exam fixture"\)/);
});

test("protected content APIs enforce active account status", async () => {
  const files = await Promise.all(["app/api/lesson-resources/route.ts", "app/api/video-token/route.ts", "app/api/resource-content/route.ts", "app/api/lesson-pdf-download/route.ts", "app/api/exams/route.ts"].map(source));
  for (const file of files) assert.match(file, /ensureActiveAccount\(request, admin\)/);
});

test("learning guard tracks devices and heartbeats without email verification", async () => {
  const [guard, sessionApi, platform, exam] = await Promise.all([source("app/account-security-guard.tsx"), source("app/api/security/session/route.ts"), source("app/platform.tsx"), source("app/exam-room.tsx")]);
  assert.match(guard, /crypto\.randomUUID\(\)/);
  assert.match(guard, /document\.visibilityState !== "visible"/);
  assert.match(guard, /60_000/);
  // OTP was removed until transactional email is configured. Assert it is gone
  // from both halves, so a partial restore cannot leave students facing a 428
  // challenge that the client can no longer answer.
  assert.doesNotMatch(guard, /verifyOtp|signInWithOtp/);
  assert.doesNotMatch(sessionApi, /device_verification_challenges|OTP_REQUIRED/);
  assert.match(sessionApi, /DEVICE_LIMIT_REACHED/);
  assert.match(sessionApi, /profile\.role === "admin"/);
  assert.match(sessionApi, /admin_exempt/);
  assert.match(guard, /payload\.sessionId \|\| payload\.exempt/);
  assert.match(sessionApi, /score >= 100/);
  assert.match(sessionApi, /apply_account_violation/);
  assert.match(platform, /<AccountSecurityGuard activityType=/);
  assert.match(exam, /<AccountSecurityGuard activityType=/);
});

test("admin security actions are audited", async () => {
  const [route, page] = await Promise.all([source("app/api/admin/security/route.ts"), source("app/admin-security.tsx")]);
  for (const action of ["unban", "extend_ban", "permanent_ban", "mark_false_positive", "trust_device", "revoke_device", "reset_violation_count"]) assert.match(route, new RegExp(action));
  assert.match(route, /from\("admin_actions"\)\.insert/);
  assert.match(page, /BẢO MẬT TÀI KHOẢN/);
  assert.match(page, /Đánh dấu phát hiện nhầm/);
});
