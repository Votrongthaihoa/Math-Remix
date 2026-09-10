import assert from "node:assert/strict";
import test from "node:test";

import { isRetryableRequestError, retryAfterMilliseconds, retryWithBackoff } from "../lib/request-retry.ts";

test("retry policy covers transient server responses but not conflicts or aborts", () => {
  assert.equal(isRetryableRequestError(Object.assign(new Error("busy"), { status: 503 })), true);
  assert.equal(isRetryableRequestError(Object.assign(new Error("rate limited"), { status: 429 })), true);
  assert.equal(isRetryableRequestError(Object.assign(new Error("conflict"), { status: 409 })), false);
  assert.equal(isRetryableRequestError(Object.assign(new Error("cancelled"), { name: "AbortError" })), false);
});

test("retry-after accepts seconds and HTTP dates", t => {
  t.mock.method(Date, "now", () => Date.UTC(2026, 0, 1));
  assert.equal(retryAfterMilliseconds("2"), 2000);
  assert.equal(retryAfterMilliseconds(""), 0);
  assert.equal(retryAfterMilliseconds(new Date(Date.now() + 1000).toUTCString()), 1000);
});

test("retryWithBackoff retries a transient failure and returns the next result", async () => {
  let calls = 0;
  const result = await retryWithBackoff(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("temporary"), { status: 503, retryAfterMs: 1 });
    return "saved";
  }, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 });
  assert.equal(result, "saved");
  assert.equal(calls, 3);
});

function captureDelays(t, random = 0.5) {
  const delays = [];
  t.mock.method(Math, "random", () => random);
  // Exercise the production delay calculation while avoiding real backoff.
  // Only this file's test process is affected; node:test restores both mocks.
  t.mock.method(globalThis, "setTimeout", (callback, delay, ...args) => {
    delays.push(delay);
    queueMicrotask(() => callback(...args));
    return 0;
  });
  return delays;
}

test("retry policy classifies HTTP status boundaries", () => {
  for (const status of [408, 425, 429, 500, 501, 502, 503, 504, 599]) {
    assert.equal(isRetryableRequestError(Object.assign(new Error("synthetic"), { status })), true, String(status));
  }
  for (const status of [200, 400, 401, 403, 404, 409, 422, 499]) {
    assert.equal(isRetryableRequestError(Object.assign(new Error("synthetic"), { status })), false, String(status));
  }
});

test("retry policy accepts unknown/non-Error failures but never aborts even with a transient status", () => {
  for (const error of [undefined, null, "network lost", 42, new Error("network lost"), {}, { status: "503" }, { status: NaN }, { status: Infinity }]) {
    assert.equal(isRetryableRequestError(error), true);
  }
  assert.equal(isRetryableRequestError({ name: "AbortError", status: 503 }), false);
  assert.equal(isRetryableRequestError(new DOMException("cancelled", "AbortError")), false);
});

test("retry-after handles missing, malformed, fractional, negative, capped seconds, and whitespace", () => {
  for (const [value, expected] of [[undefined, 0], [null, 0], ["", 0], ["  ", 0], ["invalid-date", 0], ["NaN", 0], ["Infinity", 0], ["-2", 0], ["0", 0], ["0.0006", 1], ["1.25", 1250], [" 2 ", 2000], ["30", 30_000], ["9999", 30_000]]) {
    assert.equal(retryAfterMilliseconds(value), expected, String(value));
  }
});

test("retry-after HTTP dates are exact, nonnegative, and capped", t => {
  const now = Date.UTC(2026, 0, 1, 12);
  t.mock.method(Date, "now", () => now);
  for (const [offset, expected] of [[-60_000, 0], [0, 0], [5_000, 5_000], [30_000, 30_000], [600_000, 30_000]]) {
    assert.equal(retryAfterMilliseconds(new Date(now + offset).toUTCString()), expected);
  }
});

test("retryWithBackoff returns first-attempt values without scheduling delays", async t => {
  const delays = captureDelays(t);
  for (const expected of [undefined, null, false, 0, "saved", { id: "synthetic" }]) {
    let calls = 0;
    const actual = await retryWithBackoff(async () => { calls += 1; return expected; });
    assert.equal(actual, expected);
    assert.equal(calls, 1);
  }
  assert.deepEqual(delays, []);
});

test("retryWithBackoff returns eventual success with exact exponential delays", async t => {
  const delays = captureDelays(t);
  let calls = 0;
  const result = await retryWithBackoff(async () => {
    calls += 1;
    if (calls < 4) throw { status: 503 };
    return "done";
  }, { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1_000 });
  assert.equal(result, "done");
  assert.equal(calls, 4);
  assert.deepEqual(delays, [100, 200, 400]);
});

test("retryWithBackoff exhausts default retries and rethrows the exact last error", async t => {
  const delays = captureDelays(t);
  const errors = [new Error("first"), new Error("second"), new Error("last")];
  let calls = 0;
  await assert.rejects(retryWithBackoff(async () => { throw errors[calls++]; }), error => error === errors[2]);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [250, 500]);
});

test("retryWithBackoff never retries permanent HTTP failures or aborts", async t => {
  const delays = captureDelays(t);
  for (const error of [{ status: 409 }, { status: 422 }, Object.assign(new Error("cancelled"), { name: "AbortError", status: 503 })]) {
    let calls = 0;
    await assert.rejects(retryWithBackoff(async () => { calls += 1; throw error; }), actual => actual === error);
    assert.equal(calls, 1);
  }
  assert.deepEqual(delays, []);
});

test("retryWithBackoff honors zero/negative retry budgets and does not invoke the policy", async t => {
  const delays = captureDelays(t);
  for (const maxRetries of [0, -1]) {
    let calls = 0;
    let policyCalls = 0;
    const error = new Error("synthetic transient");
    await assert.rejects(retryWithBackoff(async () => { calls += 1; throw error; }, {
      maxRetries, shouldRetry() { policyCalls += 1; return true; },
    }), actual => actual === error);
    assert.equal(calls, 1);
    assert.equal(policyCalls, 0);
  }
  assert.deepEqual(delays, []);
});

test("retryWithBackoff retries and preserves non-Error thrown values", async t => {
  const delays = captureDelays(t);
  for (const error of ["offline", null, undefined, 42]) {
    let calls = 0;
    // A rejection handler distinguishes a rejected undefined from resolution.
    const outcome = await retryWithBackoff(async () => { calls += 1; throw error; }, { maxRetries: 1 })
      .then(() => ({ resolved: true }), reason => ({ resolved: false, reason }));
    assert.deepEqual(outcome, { resolved: false, reason: error });
    assert.equal(calls, 2);
  }
  assert.deepEqual(delays, [250, 250, 250, 250]);
});

test("retryWithBackoff obeys a custom policy and passes the original error", async t => {
  const delays = captureDelays(t);
  const error = { status: 409 };
  const seen = [];
  let calls = 0;
  const result = await retryWithBackoff(async () => {
    calls += 1;
    if (calls === 1) throw error;
    return "allowed";
  }, { shouldRetry(actual) { seen.push(actual); return actual === error; } });
  assert.equal(result, "allowed");
  assert.deepEqual(seen, [error]);
  await assert.rejects(retryWithBackoff(async () => { throw error; }, { shouldRetry: () => false }), actual => actual === error);
  assert.deepEqual(delays, [250]);
});

test("retryWithBackoff uses server delay only when finite and positive, and caps it", async t => {
  const delays = captureDelays(t);
  for (const retryAfterMs of [75, 30_000, 0, -1, NaN, Infinity, "500", undefined]) {
    let calls = 0;
    await retryWithBackoff(async () => {
      if (calls++ === 0) throw { status: 429, retryAfterMs };
    }, { baseDelayMs: 100, maxDelayMs: 300 });
  }
  assert.deepEqual(delays, [75, 300, 100, 100, 100, 100, 100, 100]);
});

test("retryWithBackoff caps exponential jitter at maxDelayMs", async t => {
  const delays = captureDelays(t, 1);
  let calls = 0;
  await retryWithBackoff(async () => {
    if (calls++ < 4) throw { status: 503 };
  }, { maxRetries: 4, baseDelayMs: 100, maxDelayMs: 300 });
  assert.deepEqual(delays, [115, 230, 300, 300]);
  assert.equal(calls, 5);
});

test("retryWithBackoff applies the lower jitter bound", async t => {
  const delays = captureDelays(t, 0);
  let calls = 0;
  await retryWithBackoff(async () => { if (calls++ === 0) throw new Error("offline"); }, { baseDelayMs: 100 });
  assert.deepEqual(delays, [85]);
});

test("retryWithBackoff clamps retry counts and delay options without real waits", async t => {
  const delays = captureDelays(t);
  const error = new Error("offline");
  let calls = 0;
  await assert.rejects(retryWithBackoff(async () => { calls += 1; throw error; }, { maxRetries: 99, baseDelayMs: 99_999, maxDelayMs: 99_999 }), actual => actual === error);
  assert.equal(calls, 6);
  assert.deepEqual(delays, [5_000, 10_000, 20_000, 30_000, 30_000]);
  delays.length = 0;
  calls = 0;
  await assert.rejects(retryWithBackoff(async () => { calls += 1; throw error; }, { maxRetries: 1.9, baseDelayMs: -1, maxDelayMs: -1 }), actual => actual === error);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [50]);
});
