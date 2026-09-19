import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import test from "node:test";

import { signContentToken, verifyContentToken } from "../lib/content-token.ts";

const SECRET = "synthetic-content-token-test-secret";
const RESOURCE_ID = "synthetic-resource-ngu-phap-123";
const USER_ID = "synthetic-student-456";
const NOW = 1_800_000_000;
const validPayload = () => ({ rid: RESOURCE_ID, sub: USER_ID, iat: NOW, exp: NOW + 300 });

// Independently construct authenticated ciphertext to exercise the parser, not
// merely the signer. These synthetic claims never contact an external service.
function encryptPlaintext(plaintext) {
  const iv = randomBytes(12);
  const key = createHash("sha256").update(SECRET).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `v1.${iv.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function encryptPayload(payload) {
  return encryptPlaintext(JSON.stringify(payload));
}

function freezeTime(t) {
  t.mock.method(Date, "now", () => NOW * 1000);
}

test("content token round-trips exact resource/user claims with a 300-second default lifetime", async t => {
  freezeTime(t);
  const token = await signContentToken(RESOURCE_ID, USER_ID, SECRET);
  assert.match(token, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await verifyContentToken(token, SECRET), validPayload());
});

test("content token preserves Unicode identifiers and explicit lifetime", async t => {
  freezeTime(t);
  const token = await signContentToken("bài-giảng/đại-số", "học-sinh-Đặng", SECRET, 45);
  assert.deepEqual(await verifyContentToken(token, SECRET), {
    rid: "bài-giảng/đại-số", sub: "học-sinh-Đặng", iat: NOW, exp: NOW + 45,
  });
});

test("content token rejects the wrong secret", async t => {
  freezeTime(t);
  const token = await signContentToken(RESOURCE_ID, USER_ID, SECRET);
  assert.equal(await verifyContentToken(token, "another-synthetic-secret"), null);
});

test("content token is valid before expiration and rejected at and after expiration", async t => {
  let clock = NOW * 1000;
  t.mock.method(Date, "now", () => clock);
  const token = await signContentToken(RESOURCE_ID, USER_ID, SECRET, 10);
  clock += 9_999;
  assert.notEqual(await verifyContentToken(token, SECRET), null);
  clock += 1;
  assert.equal(await verifyContentToken(token, SECRET), null);
  clock += 1_000;
  assert.equal(await verifyContentToken(token, SECRET), null);
});

for (const lifetime of [0, -1, -300]) {
  test(`content token rejects lifetime ${lifetime} immediately`, async t => {
    freezeTime(t);
    const token = await signContentToken(RESOURCE_ID, USER_ID, SECRET, lifetime);
    assert.equal(await verifyContentToken(token, SECRET), null);
  });
}

test("content token rejects malformed versions, segment counts, base64, and truncated ciphertext", async t => {
  freezeTime(t);
  const token = await signContentToken(RESOURCE_ID, USER_ID, SECRET);
  const [version, iv, ciphertext] = token.split(".");
  const cases = {
    empty: "",
    "missing segments": version,
    "two segments": `${version}.${iv}`,
    "extra segment": `${token}.extra`,
    "unknown version": `v2.${iv}.${ciphertext}`,
    "case-mismatched version": `V1.${iv}.${ciphertext}`,
    "missing IV": `${version}..${ciphertext}`,
    "missing ciphertext": `${version}.${iv}.`,
    "invalid IV base64": `${version}.!not-base64!.${ciphertext}`,
    "invalid ciphertext base64": `${version}.${iv}.!not-base64!`,
    "one-character base64": `${version}.${iv}.a`,
    "truncated IV": `${version}.AA.${ciphertext}`,
    "truncated authentication tag": `${version}.${iv}.${Buffer.from(ciphertext, "base64url").subarray(0, 8).toString("base64url")}`,
  };
  for (const [name, malformed] of Object.entries(cases)) {
    assert.equal(await verifyContentToken(malformed, SECRET), null, name);
  }
});

for (const [name, segment, byteIndex] of [["IV", 1, 0], ["ciphertext", 2, 0], ["authentication tag", 2, -1]]) {
  test(`content token rejects a modified ${name}`, async t => {
    freezeTime(t);
    const parts = (await signContentToken(RESOURCE_ID, USER_ID, SECRET)).split(".");
    const bytes = Buffer.from(parts[segment], "base64url");
    bytes[byteIndex < 0 ? bytes.length + byteIndex : byteIndex] ^= 1;
    parts[segment] = bytes.toString("base64url");
    assert.equal(await verifyContentToken(parts.join("."), SECRET), null);
  });
}

test("content token rejects authenticated malformed JSON and non-object payloads", async t => {
  freezeTime(t);
  for (const plaintext of ["{", "not-json", "", "null", "[]", "42", '"string"']) {
    assert.equal(await verifyContentToken(encryptPlaintext(plaintext), SECRET), null, plaintext);
  }
});

for (const field of ["rid", "sub", "exp"]) {
  test(`content token rejects missing and falsy ${field}`, async t => {
    freezeTime(t);
    const missing = validPayload();
    delete missing[field];
    assert.equal(await verifyContentToken(encryptPayload(missing), SECRET), null, "missing");
    for (const value of [null, "", false, 0]) {
      assert.equal(await verifyContentToken(encryptPayload({ ...validPayload(), [field]: value }), SECRET), null, String(value));
    }
  });
}

test("content token rejects expired and JSON-null non-finite numeric expiration", async t => {
  freezeTime(t);
  for (const exp of [NOW, NOW - 1, -1, NaN, Infinity, -Infinity]) {
    // JSON.stringify encodes non-finite JS numbers as null.
    assert.equal(await verifyContentToken(encryptPayload({ ...validPayload(), exp }), SECRET), null, String(exp));
  }
});

test("content tokens use independent 12-byte IVs and do not expose plaintext identifiers", async t => {
  freezeTime(t);
  const tokens = await Promise.all(Array.from({ length: 16 }, () => signContentToken(RESOURCE_ID, USER_ID, SECRET)));
  assert.equal(new Set(tokens).size, tokens.length);
  const ivs = tokens.map(token => token.split(".")[1]);
  assert.equal(new Set(ivs).size, tokens.length);
  for (const token of tokens) {
    const [, iv, ciphertext] = token.split(".");
    assert.equal(Buffer.from(iv, "base64url").length, 12);
    const rawCiphertext = Buffer.from(ciphertext, "base64url");
    for (const value of [RESOURCE_ID, USER_ID, SECRET, '"rid"', '"sub"']) {
      assert.equal(token.includes(value), false, "encoded token must not contain plaintext");
      assert.equal(rawCiphertext.includes(Buffer.from(value)), false, "decoding base64 must not disclose plaintext");
    }
    assert.deepEqual(await verifyContentToken(token, SECRET), validPayload());
  }
});

// Authenticated claims still require strict runtime validation. These tests do
// not imply an attacker without SECRET can forge a token.
for (const [name, changes] of [
  ["non-string resource identifier", { rid: 123 }],
  ["non-string user identifier", { sub: { id: USER_ID } }],
  ["nonnumeric expiration string", { exp: "not-a-number" }],
  ["numeric expiration string", { exp: String(NOW + 300) }],
  ["object expiration", { exp: {} }],
]) {
  test(`content token rejects ${name}`, async t => {
    freezeTime(t);
    assert.equal(await verifyContentToken(encryptPayload({ ...validPayload(), ...changes }), SECRET), null);
  });
}

for (const [name, iat] of [["missing", undefined], ["null", null], ["nonnumeric", "yesterday"], ["object", {}]]) {
  test(`content token rejects ${name} issued-at claim`, async t => {
    freezeTime(t);
    assert.equal(await verifyContentToken(encryptPayload({ ...validPayload(), iat }), SECRET), null);
  });
}

// verifyContentToken(token, secret) authenticates/decrypts claims only. It has no
// expected user/resource parameters; caller-level binding must be tested where
// the returned rid/sub are compared with the request's authorized identity.
