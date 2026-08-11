import assert from "node:assert/strict";
import test from "node:test";

import { isRetryableRequestError, retryAfterMilliseconds, retryWithBackoff } from "../lib/request-retry.ts";

test("retry policy covers transient server responses but not conflicts or aborts", () => {
  assert.equal(isRetryableRequestError(Object.assign(new Error("busy"), { status: 503 })), true);
  assert.equal(isRetryableRequestError(Object.assign(new Error("rate limited"), { status: 429 })), true);
  assert.equal(isRetryableRequestError(Object.assign(new Error("conflict"), { status: 409 })), false);
  assert.equal(isRetryableRequestError(Object.assign(new Error("cancelled"), { name: "AbortError" })), false);
});

test("retry-after accepts seconds and HTTP dates", () => {
  assert.equal(retryAfterMilliseconds("2"), 2000);
  assert.equal(retryAfterMilliseconds(""), 0);
  assert.ok(retryAfterMilliseconds(new Date(Date.now() + 1000).toUTCString()) >= 0);
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
