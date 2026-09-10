import assert from "node:assert/strict";
import test from "node:test";
import { consumeRequestBudget } from "../lib/rate-limit-server.ts";

const subjectHash = "a".repeat(64);
const options = { capacity: 6, refillSeconds: 10 };
const closed = { allowed: false, retryAfterSeconds: 60, ready: false, denialsLastMinute: 0 };
const degraded = { allowed: true, retryAfterSeconds: 0, ready: false, denialsLastMinute: 0 };
const missing = { data: null, error: { code: "PGRST202", message: "function consume_request_budget does not exist" } };
// Restore environment/console even after assertion failures. The production
// module is imported once so Node coverage reports one source file instead of a
// cache-busted copy for every case.
function budgetTest(name, callback, testOptions = {}) {
  test(name, { ...testOptions, concurrency: false }, async t => {
    const previous = process.env.RATE_LIMIT_REQUIRE_DB;
    t.after(() => {
      if (previous === undefined) delete process.env.RATE_LIMIT_REQUIRE_DB;
      else process.env.RATE_LIMIT_REQUIRE_DB = previous;
    });
    delete process.env.RATE_LIMIT_REQUIRE_DB;
    const warnings = t.mock.method(console, "warn", () => {});
    await callback({ consumeRequestBudget, warnings });
  });
}

function fakeRpc(response) {
  const calls = [];
  return {
    calls,
    async rpc(...args) {
      calls.push(args);
      if (response instanceof Error) throw response;
      return response;
    },
  };
}
const successful = data => ({ data, error: null });

budgetTest("RPC receives exact scope, subject, capacity, refill, and default/custom cost", async ({ consumeRequestBudget }) => {
  for (const cost of [undefined, 3, 0]) {
    const client = fakeRpc(successful({ allowed: true, retry_after_seconds: 0, denials_last_minute: 0 }));
    await consumeRequestBudget(client, "guest_start", subjectHash, { ...options, cost });
    assert.deepEqual(client.calls, [["consume_request_budget", {
      target_scope: "guest_start", target_subject_hash: subjectHash, target_capacity: 6,
      target_refill_seconds: 10, target_cost: cost ?? 1,
    }]]);
  }
});

budgetTest("object and one-row array decisions are mapped consistently", async ({ consumeRequestBudget }) => {
  for (const allowed of [false, true]) {
    const row = { allowed, retry_after_seconds: 7, denials_last_minute: 3 };
    for (const data of [row, [row]]) {
      assert.deepEqual(await consumeRequestBudget(fakeRpc(successful(data)), "guest_submit", subjectHash, options), {
        allowed, retryAfterSeconds: 7, ready: true, denialsLastMinute: 3,
      });
    }
  }
});

budgetTest("empty and malformed results never authorize requests", async ({ consumeRequestBudget }) => {
  for (const data of [null, undefined, [], [null], {}, "bad", 4, true, { allowed: "true" }, { allowed: 1 }, [false]]) {
    assert.deepEqual(await consumeRequestBudget(fakeRpc(successful(data)), "guest_progress", subjectHash, options), {
      allowed: false, retryAfterSeconds: 1, ready: true, denialsLastMinute: 0,
    });
  }
});

budgetTest("array response uses its first row and never searches for an allowed row", async ({ consumeRequestBudget }) => {
  const client = fakeRpc(successful([{ allowed: false, retry_after_seconds: 2 }, { allowed: true }]));
  assert.deepEqual(await consumeRequestBudget(client, "guest_meta", subjectHash, options), {
    allowed: false, retryAfterSeconds: 2, ready: true, denialsLastMinute: 0,
  });
});

budgetTest("retry delays normalize invalid numeric input and clamp to 1–3600 seconds", async ({ consumeRequestBudget }) => {
  for (const [value, expected] of [
    [undefined, 1], [null, 1], [NaN, 1], ["nonsense", 1], ["", 1], [0, 1], [-10, 1],
    ["7", 7], [7, 7], [3600, 3600], [3601, 3600], [Infinity, 3600], [-Infinity, 1],
  ]) {
    const client = fakeRpc(successful({ allowed: false, retry_after_seconds: value }));
    const decision = await consumeRequestBudget(client, "guest_submit", subjectHash, options);
    assert.equal(decision.allowed, false);
    assert.equal(decision.retryAfterSeconds, expected, `retry input ${String(value)}`);
  }
});

budgetTest("denial counts normalize invalid/negative input and numeric strings", async ({ consumeRequestBudget }) => {
  for (const [value, expected] of [[undefined, 0], [null, 0], [NaN, 0], ["bad", 0], [-2, 0], ["-2", 0], ["3", 3], [3, 3], [-Infinity, 0]]) {
    const client = fakeRpc(successful({ allowed: false, denials_last_minute: value }));
    assert.equal((await consumeRequestBudget(client, "guest_submit", subjectHash, options)).denialsLastMinute, expected);
  }
});

budgetTest("missing migration warns once across concurrent calls", async ({ consumeRequestBudget, warnings }) => {
  const client = fakeRpc(missing);
  const decisions = await Promise.all(Array.from({ length: 6 }, () => consumeRequestBudget(client, "guest_start", subjectHash, options)));
  assert.deepEqual(decisions, Array.from({ length: 6 }, () => degraded));
  assert.equal(client.calls.length, 6);
  assert.equal(warnings.mock.callCount(), 1);
  assert.deepEqual(warnings.mock.calls[0].arguments, ["[rate-limit] migration 021 is not available; continuing in degraded mode"]);
  await consumeRequestBudget(client, "guest_submit", subjectHash, options);
  assert.equal(warnings.mock.callCount(), 1);
});

budgetTest("missing migration degrades only when strict DB enforcement is disabled", async ({ consumeRequestBudget }) => {
  for (const setting of [undefined, "0", "1"]) {
    if (setting === undefined) delete process.env.RATE_LIMIT_REQUIRE_DB;
    else process.env.RATE_LIMIT_REQUIRE_DB = setting;
    assert.deepEqual(await consumeRequestBudget(fakeRpc(missing), "guest_start", subjectHash, options), setting === "1" ? closed : degraded);
  }
});

budgetTest("strict mode denies missing-function errors even with an allowed data row", async ({ consumeRequestBudget, warnings }) => {
  process.env.RATE_LIMIT_REQUIRE_DB = "1";
  assert.deepEqual(await consumeRequestBudget(fakeRpc({ ...missing, data: [{ allowed: true }] }), "guest_start", subjectHash, options), closed);
  assert.equal(warnings.mock.callCount(), 0);
});

budgetTest("unrelated database errors fail closed in strict and non-strict modes", async ({ consumeRequestBudget, warnings }) => {
  for (const setting of ["0", "1"]) {
    process.env.RATE_LIMIT_REQUIRE_DB = setting;
    for (const data of [null, [{ allowed: true }]]) {
      assert.deepEqual(await consumeRequestBudget(fakeRpc({ data, error: { code: "XX000", message: "database unavailable" } }), "guest_meta", subjectHash, options), closed);
    }
  }
  assert.equal(warnings.mock.callCount(), 0);
});

budgetTest("thrown RPC failures reject without synthesizing an allowed decision", async ({ consumeRequestBudget }) => {
  const failure = new Error("synthetic transport failure");
  await assert.rejects(consumeRequestBudget(fakeRpc(failure), "guest_meta", subjectHash, options), error => error === failure);
});

budgetTest("concurrent requests for the same scope each consume an RPC decision", async ({ consumeRequestBudget }) => {
  // Adapter forwarding only: this is not a live DB transaction-atomicity test.
  const calls = [];
  const client = {
    async rpc(...args) {
      const index = calls.push(args) - 1;
      await Promise.resolve();
      return successful({ allowed: index < 2, retry_after_seconds: index < 2 ? 0 : 10, denials_last_minute: Math.max(0, index - 1) });
    },
  };
  const decisions = await Promise.all(Array.from({ length: 5 }, () => consumeRequestBudget(client, "same_scope", subjectHash, options)));
  assert.equal(calls.length, 5);
  assert.ok(calls.every(args => args[0] === "consume_request_budget" && args[1].target_scope === "same_scope" && args[1].target_subject_hash === subjectHash));
  assert.deepEqual(decisions.map(decision => decision.allowed), [true, true, false, false, false]);
  assert.deepEqual(decisions.map(decision => decision.denialsLastMinute), [0, 0, 1, 2, 3]);
  assert.deepEqual(decisions.map(decision => decision.retryAfterSeconds), [1, 1, 10, 10, 10]);
});

// Executed TODOs document defects without modifying production in this task.
budgetTest("permission error mentioning the RPC is not a missing migration", async ({ consumeRequestBudget }) => {
  const client = fakeRpc({ data: null, error: { code: "42501", message: "permission denied for function consume_request_budget" } });
  assert.deepEqual(await consumeRequestBudget(client, "guest_start", subjectHash, options), closed);
}, { todo: "Broad missing-function regex currently degrades on permission errors." });

budgetTest("unrelated schema-cache error must not allow requests", async ({ consumeRequestBudget }) => {
  const client = fakeRpc({ data: null, error: { code: "XX000", message: "schema cache unavailable due to database failure" } });
  assert.deepEqual(await consumeRequestBudget(client, "guest_start", subjectHash, options), closed);
}, { todo: "Broad schema-cache regex currently treats an outage as a missing migration." });

budgetTest("non-finite denial count must produce a finite safe value", async ({ consumeRequestBudget }) => {
  const client = fakeRpc(successful({ allowed: false, denials_last_minute: Infinity }));
  assert.equal(Number.isFinite((await consumeRequestBudget(client, "guest_submit", subjectHash, options)).denialsLastMinute), true);
}, { todo: "Positive Infinity currently escapes numeric normalization." });
