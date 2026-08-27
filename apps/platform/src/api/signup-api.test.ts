import assert from "node:assert/strict";
import test from "node:test";

import { signUp } from "./signup-api.ts";

test("signup posts a normalized contract to the protected platform endpoint", async () => {
  const result = await signUp(
    {
      email: "  STUDENT@example.vn ",
      password: "Password123!",
      fullName: "  Nguyễn Minh Anh  ",
      turnstileToken: "preview-turnstile-token",
    },
    async (input, init) => {
      assert.equal(input, "/api/platform/v1/signup");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        email: "student@example.vn",
        password: "Password123!",
        fullName: "Nguyễn Minh Anh",
        turnstileToken: "preview-turnstile-token",
      });
      return new Response(JSON.stringify({
        ok: true,
        data: { email: "student@example.vn", verificationRequired: true },
      }), { status: 201, headers: { "content-type": "application/json" } });
    },
  );

  assert.deepEqual(result, {
    email: "student@example.vn",
    verificationRequired: true,
  });
});
