import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let keyClaims = null;
if (serviceRoleKey.split(".").length === 3) {
  try {
    keyClaims = JSON.parse(Buffer.from(serviceRoleKey.split(".")[1], "base64url").toString("utf8"));
  } catch {
    keyClaims = null;
  }
}

const suffix = Date.now().toString(36).padStart(32, "x");
const subject = `staging-rate-${suffix}`.slice(0, 64);
const otherSubject = `staging-other-${suffix}`.slice(0, 64);
const subjects = [subject, otherSubject];

async function consume(scope, subjectHash, capacity, refillSeconds) {
  const result = await supabase.rpc("consume_request_budget", {
    target_scope: scope,
    target_subject_hash: subjectHash,
    target_capacity: capacity,
    target_refill_seconds: refillSeconds,
    target_cost: 1,
  });

  return {
    data: Array.isArray(result.data) ? result.data[0] : result.data,
    error: result.error,
  };
}

let cleanupError = null;
try {
  const first = await consume("staging_smoke", subject, 2, 1);
  const second = await consume("staging_smoke", subject, 2, 1);
  const denied = await consume("staging_smoke", subject, 2, 1);
  const isolatedScope = await consume("staging_smoke_other", subject, 2, 1);
  const isolatedSubject = await consume("staging_smoke", otherSubject, 1, 60);

  await new Promise((resolve) => setTimeout(resolve, 1200));
  const refilled = await consume("staging_smoke", subject, 2, 1);

  for (const result of [first, second, denied, isolatedScope, isolatedSubject, refilled]) {
    assert.equal(result.error, null, result.error?.message ?? "rate-limit RPC failed");
  }

  console.log(JSON.stringify({
    keyFormat: serviceRoleKey.startsWith("sb_") ? serviceRoleKey.split("_").slice(0, 2).join("_") : "jwt",
    jwtRole: keyClaims?.role ?? null,
    first: first.data,
    second: second.data,
    denied: denied.data,
    isolatedScope: isolatedScope.data,
    isolatedSubject: isolatedSubject.data,
    refilled: refilled.data,
  }));

  assert.equal(first.data?.allowed, true);
  assert.equal(second.data?.allowed, true);
  assert.equal(denied.data?.allowed, false);
  assert.equal(isolatedScope.data?.allowed, true);
  assert.equal(isolatedSubject.data?.allowed, true);
  assert.equal(refilled.data?.allowed, true);

  console.log(JSON.stringify({
    allowedSequence: [first.data?.allowed, second.data?.allowed, denied.data?.allowed],
    denialCount: denied.data?.denials_last_minute ?? null,
    scopeIsolation: isolatedScope.data?.allowed,
    subjectIsolation: isolatedSubject.data?.allowed,
    refill: refilled.data?.allowed,
  }));
} finally {
  const cleanup = await supabase
    .from("request_rate_limits")
    .delete()
    .in("subject_hash", subjects);
  cleanupError = cleanup.error;
  if (cleanupError) {
    console.error(`cleanup failed: ${cleanupError.message}`);
    process.exitCode = 1;
  }
}
