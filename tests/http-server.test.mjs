import assert from "node:assert/strict";
import test from "node:test";

import { readJsonBody } from "../lib/http-server.ts";

test("readJsonBody accepts bounded JSON objects", async () => {
  const result = await readJsonBody(new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify({ action: "submit", answers: { q1: "A" } }),
    headers: { "content-type": "application/json" },
  }));
  assert.deepEqual(result, { ok: true, body: { action: "submit", answers: { q1: "A" } } });
});

test("readJsonBody rejects malformed, array, and oversized payloads", async () => {
  const malformed = await readJsonBody(new Request("http://localhost/api", { method: "POST", body: "{" }));
  assert.deepEqual(malformed, { ok: false, error: "invalid_json" });

  const arrayBody = await readJsonBody(new Request("http://localhost/api", { method: "POST", body: "[]" }));
  assert.deepEqual(arrayBody, { ok: false, error: "invalid_json" });

  const oversized = await readJsonBody(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ value: "x".repeat(20) }) }), 10);
  assert.deepEqual(oversized, { ok: false, error: "payload_too_large" });
});
