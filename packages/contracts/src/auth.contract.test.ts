import assert from "node:assert/strict";
import test from "node:test";

import {
  PermissionGrantSchema,
  RoleSchema,
  createApiResultSchema,
} from "./auth.ts";

test("auth boundary parses roles, permission grants, and API results", () => {
  assert.deepEqual(
    ["student", "admin", "ctv"].map((role) => RoleSchema.parse(role)),
    ["student", "admin", "ctv"],
  );
  assert.equal(RoleSchema.safeParse("owner").success, false);

  const grant = PermissionGrantSchema.parse({
    module: "question-bank",
    actions: ["read", "review"],
  });
  assert.deepEqual(grant, {
    module: "question-bank",
    actions: ["read", "review"],
  });

  const ResultSchema = createApiResultSchema(RoleSchema);
  assert.deepEqual(ResultSchema.parse({ ok: true, data: "ctv" }), {
    ok: true,
    data: "ctv",
  });
  assert.deepEqual(
    ResultSchema.parse({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "Phiên đăng nhập đã hết hạn.",
        recoverable: true,
      },
    }),
    {
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "Phiên đăng nhập đã hết hạn.",
        recoverable: true,
      },
    },
  );
});
