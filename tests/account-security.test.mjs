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
