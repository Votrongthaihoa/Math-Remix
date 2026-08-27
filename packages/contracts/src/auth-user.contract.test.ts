import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthUserSchema,
  SignupRequestSchema,
  SignupResultSchema,
} from "./auth.ts";

test("authenticated users carry a role and explicit module/action grants", () => {
  const user = AuthUserSchema.parse({
    id: "a413713e-a94e-41fc-a03d-96e26bd1e93c",
    username: "Nguyễn Minh Anh",
    email: "minhanh@example.vn",
    role: "ctv",
    permissions: [{ module: "question-bank", actions: ["read", "review"] }],
  });

  assert.equal(user.role, "ctv");
  assert.equal(user.permissions[0]?.actions.includes("review"), true);
  assert.equal(
    AuthUserSchema.safeParse({ ...user, email: "not-an-email" }).success,
    false,
  );
});

test("public signup contract validates the user fields and verification result", () => {
  const request = SignupRequestSchema.parse({
    email: "  STUDENT@example.vn ",
    password: "Password123!",
    fullName: "  Nguyễn Minh Anh  ",
    turnstileToken: "preview-turnstile-token",
  });
  const result = SignupResultSchema.parse({
    email: "student@example.vn",
    verificationRequired: true,
  });

  assert.deepEqual(request, {
    email: "student@example.vn",
    password: "Password123!",
    fullName: "Nguyễn Minh Anh",
    turnstileToken: "preview-turnstile-token",
  });
  assert.equal(result.verificationRequired, true);
  assert.throws(() => SignupRequestSchema.parse({ ...request, password: "short" }));
});
