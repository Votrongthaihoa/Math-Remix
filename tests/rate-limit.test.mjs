import assert from "node:assert/strict";
import test from "node:test";

import { consumeRequestBudget } from "../lib/rate-limit-server.ts";

test("rate limit helper degrades only for a missing rollout migration", async () => {
  const previous = process.env.RATE_LIMIT_REQUIRE_DB;
  delete process.env.RATE_LIMIT_REQUIRE_DB;
  const result = await consumeRequestBudget({ rpc: async () => ({ data: null, error: { code: "PGRST202", message: "function consume_request_budget does not exist" } }) }, "guest_start", "a".repeat(64), { capacity: 6, refillSeconds: 10 });
  assert.deepEqual(result, { allowed: true, retryAfterSeconds: 0, ready: false, denialsLastMinute: 0 });
  if (previous === undefined) delete process.env.RATE_LIMIT_REQUIRE_DB;
  else process.env.RATE_LIMIT_REQUIRE_DB = previous;
});

test("rate limit helper maps database decisions and fails closed for unexpected errors", async () => {
  const allowed = await consumeRequestBudget({ rpc: async () => ({ data: [{ allowed: true, retry_after_seconds: 0, denials_last_minute: 0 }], error: null }) }, "guest_progress", "b".repeat(64), { capacity: 90, refillSeconds: 1 });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.ready, true);

  const denied = await consumeRequestBudget({ rpc: async () => ({ data: [{ allowed: false, retry_after_seconds: 7, denials_last_minute: 3 }], error: null }) }, "guest_submit", "c".repeat(64), { capacity: 12, refillSeconds: 5 });
  assert.deepEqual(denied, { allowed: false, retryAfterSeconds: 7, ready: true, denialsLastMinute: 3 });

  const failed = await consumeRequestBudget({ rpc: async () => ({ data: null, error: { code: "XX000", message: "database unavailable" } }) }, "guest_meta", "d".repeat(64), { capacity: 30, refillSeconds: 2 });
  assert.deepEqual(failed, { allowed: false, retryAfterSeconds: 60, ready: false, denialsLastMinute: 0 });
});
