import assert from "node:assert/strict";
import test from "node:test";

import { CryptoSessionMissingError } from "./crypto-envelope.ts";
import { decryptV2Envelope } from "./crypto-v2.ts";

test("crypto v2 requests a fresh login when the legacy private key is unavailable", async () => {
  await assert.rejects(
    () =>
      decryptV2Envelope({
        encrypted: true,
        version: "2.0",
        encryptedKey: "missing-key",
        encryptedData: "missing-data",
      }),
    (error) => error instanceof CryptoSessionMissingError,
  );
});
