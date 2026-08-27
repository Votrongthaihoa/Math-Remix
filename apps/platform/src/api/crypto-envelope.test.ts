import assert from "node:assert/strict";
import test from "node:test";

import { decryptV3Envelope } from "./crypto-envelope.ts";

function toBase64(value: ArrayBuffer | Uint8Array) {
  return Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value)).toString("base64");
}

test("crypto v3 decrypts an RSA-OAEP wrapped AES-GCM JSON response", async () => {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    false,
    ["encrypt", "decrypt"],
  );
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clear = new TextEncoder().encode(JSON.stringify({ ok: true, data: { title: "Luyện thi TSA" } }));
  const encryptedData = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, clear);
  const encryptedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, keyPair.publicKey, rawAesKey);

  const result = await decryptV3Envelope(
    {
      encrypted: true,
      version: "3.0",
      encryptedKey: toBase64(encryptedKey),
      iv: toBase64(iv),
      encryptedData: toBase64(encryptedData),
    },
    keyPair.privateKey,
  );

  assert.deepEqual(result, { ok: true, data: { title: "Luyện thi TSA" } });
});
