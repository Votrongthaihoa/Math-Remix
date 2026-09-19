import assert from "node:assert/strict";
import test from "node:test";
import { registerTestLoader } from "./support/test-loader.mjs";

const clientModule = new URL("../lib/apiClient.ts", import.meta.url);
await registerTestLoader([
  { parentURL: clientModule.href, specifier: "./api-url", appendExtension: ".ts" },
  { parentURL: clientModule.href, specifier: "./auth-client", appendExtension: ".ts" },
  { parentURL: new URL("../lib/auth-client.ts", import.meta.url).href, specifier: "./api-url", appendExtension: ".ts" },
  { parentURL: new URL("../lib/auth-client.ts", import.meta.url).href, specifier: "./supabase", url: new URL("./support/supabase-auth-stub.mjs", import.meta.url).href },
]);

test("api client exports the canonical HTTP methods", async () => {
  const api = await import(clientModule);
  for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH", "POSTMultipart"]) {
    assert.equal(typeof api[method], "function", `${method} should be exported`);
  }
});

test("api client retries an auth failure with the same request body", async () => {
  const api = await import(clientModule);
  const calls = [];
  const transport = async (input, init) => {
    calls.push({ input, init });
    return calls.length === 1
      ? new Response(JSON.stringify({ error: "expired" }), { status: 401 })
      : new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  let token = "expired-token";
  const client = api.createApiClient({
    fetch: transport,
    retryOnAuthFailure: true,
    getAccessToken: () => token,
    refreshAccessToken: () => { token = "fresh-token"; },
  });
  const response = await client.POST("/api/example", { answer: "A" });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.body, calls[1].init.body);
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), "Bearer expired-token");
  assert.equal(new Headers(calls[1].init.headers).get("authorization"), "Bearer fresh-token");
  assert.equal(new Headers(calls[1].init.headers).get("x-supabase-access-token"), "fresh-token");
});

test("permission failures do not duplicate a mutating request without a new token", async () => {
  const api = await import(clientModule);
  let calls = 0;
  let token = "same-token";
  const client = api.createApiClient({
    fetch: async () => { calls += 1; return Response.json({ error: "forbidden" }, { status: 403 }); },
    getAccessToken: () => token,
    refreshAccessToken: () => { token = "new-but-still-forbidden-token"; },
  });
  const response = await client.POST("/api/example", { action: "charge-once" });
  assert.equal(response.status, 403);
  assert.equal(calls, 1);
});

test("api client exposes response decryptors for both envelope versions", async () => {
  const api = await import(clientModule);
  assert.equal(typeof api.decryptV3Payload, "function");
  assert.equal(typeof api.decryptV2Payload, "function");
});

test("v3 encrypted payloads round-trip through RSA-OAEP and AES-GCM", async () => {
  const api = await import(clientModule);
  const keyPair = await crypto.subtle.generateKey({
    name: "RSA-OAEP",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  }, false, ["encrypt", "decrypt"]);
  const payload = { sectionId: "section-1", answers: { q1: "A" }, attempt: 2 };
  const envelope = await api.encryptV3Payload(payload, keyPair.publicKey);
  assert.equal(envelope.encrypted, true);
  assert.equal(envelope.version, "3.0");
  assert.equal("sectionId" in envelope, false);
  assert.equal("answers" in envelope, false);
  assert.equal(Object.values(envelope).includes(payload.sectionId), false);
  assert.deepEqual(await api.decryptV3Payload(envelope, { privateKey: keyPair.privateKey }), payload);
});

test("multipart requests leave the browser-generated boundary intact", async () => {
  const api = await import(clientModule);
  let sent;
  const client = api.createApiClient({
    retryOnAuthFailure: false,
    fetch: async (_input, init) => {
      sent = init;
      return Response.json({ ok: true });
    },
  });
  const form = new FormData();
  form.set("file", new Blob(["payload"], { type: "text/plain" }), "sample.txt");
  await client.POSTMultipart("/api/upload", form, { headers: { "content-type": "multipart/form-data; boundary=wrong" } });
  assert.equal(sent.body, form);
  assert.equal(new Headers(sent.headers).has("content-type"), false);
});

test("an explicit encryption request never falls back to plaintext", async () => {
  const api = await import(clientModule);
  let calls = 0;
  const client = api.createApiClient({
    retryOnAuthFailure: false,
    fetch: async () => { calls += 1; return Response.json({ ok: true }); },
  });
  await assert.rejects(
    client.POST("/api/protected", { secret: "answer" }, { encrypt: true }),
    /chưa được cấu hình bộ mã hóa/i,
  );
  assert.equal(calls, 0);
});
