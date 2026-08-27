import assert from "node:assert/strict";
import test from "node:test";

import { AuthUserSchema } from "./auth.ts";

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
