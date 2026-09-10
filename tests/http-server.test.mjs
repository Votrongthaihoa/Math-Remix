import assert from "node:assert/strict";
import test from "node:test";

import { jsonBodyError, readJsonBody } from "../lib/http-server.ts";

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

const bodyRequest = (body, headers) => new Request("http://localhost/api", { method: "POST", body, headers });

for (const value of ["ASCII", "Tiếng Việt: học sinh Đặng", "emoji: 🎓🚀", "học sinh 🎓"]) {
  test(`readJsonBody enforces exact UTF-8 byte boundaries for ${value}`, async () => {
    const raw = JSON.stringify({ value });
    const bytes = Buffer.byteLength(raw, "utf8");
    assert.deepEqual(await readJsonBody(bodyRequest(raw), bytes), { ok: true, body: { value } });
    assert.deepEqual(await readJsonBody(bodyRequest(raw), bytes - 1), { ok: false, error: "payload_too_large" });
  });
}

test("readJsonBody accepts nested/empty objects and JSON whitespace", async () => {
  for (const body of [{}, { empty: null, list: [1, true, { nested: "đúng" }] }]) {
    const raw = ` \r\n\t${JSON.stringify(body)} \n`;
    assert.deepEqual(await readJsonBody(bodyRequest(raw)), { ok: true, body });
  }
});

test("readJsonBody rejects absent, empty, whitespace, primitive, array, and malformed bodies", async () => {
  for (const raw of [undefined, "", " \r\n\t ", "null", "false", "true", "0", "42", '"hello"', "[]", '[{"a":1}]', "{", '{"a":}', '{}{}', '{"a":1,}']) {
    assert.deepEqual(await readJsonBody(bodyRequest(raw)), { ok: false, error: "invalid_json" }, String(raw));
  }
});

test("readJsonBody includes surrounding whitespace in the byte limit", async () => {
  assert.deepEqual(await readJsonBody(bodyRequest(" {} "), 4), { ok: true, body: {} });
  assert.deepEqual(await readJsonBody(bodyRequest(" {} "), 3), { ok: false, error: "payload_too_large" });
});

test("readJsonBody uses the declared length boundary and rejects oversized declarations before reading", async () => {
  const raw = '{"ok":true}';
  const limit = Buffer.byteLength(raw);
  assert.deepEqual(await readJsonBody(bodyRequest(raw, { "content-length": String(limit) }), limit), { ok: true, body: { ok: true } });
  let reads = 0;
  const request = {
    headers: new Headers({ "content-length": String(limit + 1) }),
    async text() { reads += 1; throw new Error("body must not be read"); },
  };
  assert.deepEqual(await readJsonBody(request, limit), { ok: false, error: "payload_too_large" });
  assert.equal(reads, 0);
});

test("readJsonBody measures actual bytes when content-length is absent, malformed, negative, or understated", async () => {
  const raw = '{"value":"học sinh 🎓"}';
  const bytes = Buffer.byteLength(raw);
  for (const declared of [undefined, "garbage", "NaN", "Infinity", "-10", "0", "1"]) {
    const headers = declared === undefined ? undefined : { "content-length": declared };
    assert.deepEqual(await readJsonBody(bodyRequest(raw, headers), bytes), { ok: true, body: { value: "học sinh 🎓" } }, String(declared));
    assert.deepEqual(await readJsonBody(bodyRequest(raw, headers), bytes - 1), { ok: false, error: "payload_too_large" }, String(declared));
  }
});

test("readJsonBody limits actual bytes even when declared content-length fits", async () => {
  const raw = '{"value":"too long"}';
  assert.deepEqual(await readJsonBody(bodyRequest(raw, { "content-length": "2" }), 2), { ok: false, error: "payload_too_large" });
});

test("readJsonBody maps rejected body reads including aborts to invalid_json", async () => {
  for (const error of [new Error("stream failure"), new DOMException("aborted", "AbortError"), "non-Error read failure"]) {
    const request = { headers: new Headers(), async text() { throw error; } };
    assert.deepEqual(await readJsonBody(request), { ok: false, error: "invalid_json" });
  }
});

test("readJsonBody handles an actual errored body stream", async () => {
  const stream = new ReadableStream({ start(controller) { controller.error(new Error("synthetic stream failure")); } });
  const request = new Request("http://localhost/api", { method: "POST", body: stream, duplex: "half" });
  assert.deepEqual(await readJsonBody(request), { ok: false, error: "invalid_json" });
});

test("readJsonBody handles a body that has already been consumed", async () => {
  const request = bodyRequest("{}");
  await request.text();
  assert.deepEqual(await readJsonBody(request), { ok: false, error: "invalid_json" });
});

test("readJsonBody currently parses JSON regardless of content-type", async () => {
  // Media-type enforcement belongs to the caller; this helper's current
  // contract only validates body bytes and an object-shaped JSON value.
  for (const contentType of ["application/json", "text/plain", "application/x-www-form-urlencoded"]) {
    assert.deepEqual(await readJsonBody(bodyRequest("{}", { "content-type": contentType })), { ok: true, body: {} });
  }
});

test("jsonBodyError maps parser failures to the intended localized messages", () => {
  assert.deepEqual(jsonBodyError("invalid_json"), { error: "Nội dung JSON không hợp lệ." });
  assert.deepEqual(jsonBodyError("payload_too_large"), { error: "Dữ liệu gửi lên quá lớn." });
});
