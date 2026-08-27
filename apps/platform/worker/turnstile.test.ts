import assert from "node:assert/strict";
import test from "node:test";

import { verifyTurnstile } from "./turnstile.ts";

test("Turnstile validation requires success, signup action and an approved hostname", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ success: true, action: "login", hostname: "mathremix.pro.vn" }));
  const result = await verifyTurnstile({ token: "token", remoteIp: "127.0.0.1", secret: "secret", expectedAction: "signup", allowedHostnames: new Set(["mathremix.pro.vn"]), fetcher });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "action_mismatch");
});
