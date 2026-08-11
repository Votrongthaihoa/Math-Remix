import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("exam envelopes hide plaintext and reject tampering", async () => {
  const {
    createExamClientKeyPair,
    createExamRequestNonce,
    decryptExamPayload,
    encryptExamPayload,
    exportExamPublicKey,
  } = await import("../lib/exam-content-crypto.ts");
  const keyPair = await createExamClientKeyPair();
  const clientPublicKey = await exportExamPublicKey(keyPair);
  const nonce = createExamRequestNonce();
  const binding = {
    version: 1,
    kind: "question",
    attemptId: "11111111-1111-4111-8111-111111111111",
    sectionId: "22222222-2222-4222-8222-222222222222",
    index: 7,
    nonce,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const secret = "NOI_DUNG_DE_THI_KHONG_DUOC_XUAT_HIEN_TRONG_JSON";
  const envelope = await encryptExamPayload({ prompt: secret, options: ["A", "B"] }, clientPublicKey, binding);

  assert.equal(keyPair.privateKey.extractable, false);
  await assert.rejects(() => crypto.subtle.exportKey("jwk", keyPair.privateKey));
  assert.doesNotMatch(JSON.stringify(envelope), new RegExp(secret));
  assert.deepEqual(await decryptExamPayload(envelope, keyPair.privateKey, {
    kind: "question",
    attemptId: binding.attemptId,
    sectionId: binding.sectionId,
    index: binding.index,
    nonce,
  }), { prompt: secret, options: ["A", "B"] });

  const first = envelope.ciphertext[0];
  const tampered = { ...envelope, ciphertext: `${first === "A" ? "B" : "A"}${envelope.ciphertext.slice(1)}` };
  await assert.rejects(() => decryptExamPayload(tampered, keyPair.privateKey, {
    kind: "question",
    attemptId: binding.attemptId,
    sectionId: binding.sectionId,
    index: binding.index,
    nonce,
  }));
});

test("student exam payloads use an encrypted lazy-content boundary", async () => {
  const [examClient, examApi, contentApi, resultApi, cryptoSource] = await Promise.all([
    source("app/exam-room.tsx"),
    source("app/api/exams/route.ts"),
    source("app/api/exams/content/route.ts"),
    source("app/api/exams/result-content/route.ts"),
    source("lib/exam-content-crypto.ts"),
  ]);
  const examScope = examApi.slice(examApi.indexOf('if (scope === "exam")'), examApi.indexOf('if (scope === "result")'));
  assert.match(examScope, /includeQuestions:\s*false/);
  assert.match(examApi, /questionCounts/);
  assert.match(examClient, /\/api\/exams\/content/);
  assert.match(examClient, /\/api\/exams\/result-content/);
  assert.doesNotMatch(examClient, /scope=result&attemptId/);
  assert.match(contentApi, /requireInProgress:\s*true/);
  assert.match(contentApi, /consume_exam_content_budget/);
  assert.match(contentApi, /missingBudgetFunction/);
  assert.match(contentApi, /process\.env\.NODE_ENV !== "production"/);
  assert.match(contentApi, /delete safeQuestion\.latex_source/);
  assert.doesNotMatch(contentApi, /solution_source/);
  assert.match(resultApi, /requireInProgress:\s*false/);
  assert.match(cryptoSource, /ECDH-P256\+HKDF-SHA256\+A256GCM/);
  assert.match(cryptoSource, /AES-GCM/);
  assert.match(cryptoSource, /additionalData/);
});

test("database migration closes direct exam-content reads and adds server-only throttling", async () => {
  const migration = await source("supabase/migrations/016_exam_content_protection.sql");
  assert.match(migration, /drop policy if exists "exam sections student read"/i);
  assert.match(migration, /drop policy if exists "exam questions student read"/i);
  assert.match(migration, /create table if not exists public\.exam_content_grants/i);
  assert.match(migration, /create table if not exists public\.exam_content_rate_limits/i);
  assert.match(migration, /create or replace function public\.consume_exam_content_budget/i);
  assert.match(migration, /grant execute on function public\.consume_exam_content_budget\(uuid,uuid,uuid,text\) to service_role/i);
  assert.match(migration, /suspected_exam_scraping/i);
  assert.doesNotMatch(migration, /grant execute[^;]+to authenticated/i);
});

test("staging forward-fixes keep rate limiting and raw content server-only", async () => {
  const [rateFix, contentFix, legacyPolicyFix, functionFix] = await Promise.all([
    source("supabase/migrations/033_rate_limit_claim_fix.sql"),
    source("supabase/migrations/034_exam_content_data_api_hardening.sql"),
    source("supabase/migrations/035_exam_content_legacy_policy_cleanup.sql"),
    source("supabase/migrations/036_legacy_security_definer_acl_hardening.sql"),
  ]);
  assert.match(rateFix, /request\.jwt\.claims/i);
  assert.match(rateFix, /revoke all on function[\s\S]+from public, anon, authenticated/i);
  assert.match(rateFix, /grant execute on function[\s\S]+to service_role/i);
  assert.match(contentFix, /drop policy if exists "exam questions student read"/i);
  assert.match(contentFix, /drop policy if exists "exam sections student read"/i);
  assert.match(contentFix, /revoke all on table[\s\S]+from public, anon/i);
  assert.match(contentFix, /grant select, insert, update, delete on table[\s\S]+to authenticated/i);
  assert.match(legacyPolicyFix, /drop policy if exists "active account exam questions"/i);
  assert.match(legacyPolicyFix, /drop policy if exists "active account exam sections"/i);
  assert.match(functionFix, /revoke all on function public\.apply_account_violation[\s\S]+from public, anon, authenticated, service_role/i);
  assert.match(functionFix, /revoke all on function public\.next_student_code\(\)[\s\S]+from public, anon, authenticated, service_role/i);
  assert.match(functionFix, /set search_path = ''/i);
});
