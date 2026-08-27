import assert from "node:assert/strict";
import test from "node:test";

import { canAccessArea, canAccessModule, homePathForRole } from "./access-policy.ts";

test("route access sends each role to its permitted product area", () => {
  assert.equal(homePathForRole("student"), "/dashboard");
  assert.equal(homePathForRole("admin"), "/admin");
  assert.equal(homePathForRole("ctv"), "/admin/question-bank");

  assert.equal(canAccessArea("student", "student"), true);
  assert.equal(canAccessArea("student", "admin"), false);
  assert.equal(canAccessArea("admin", "admin"), true);
  assert.equal(canAccessArea("ctv", "admin"), true);

  assert.equal(canAccessModule({ role: "admin", permissions: [] }, "users", "read"), true);
  assert.equal(
    canAccessModule(
      {
        role: "ctv",
        permissions: [{ module: "question-bank", actions: ["read", "review"] }],
      },
      "question-bank",
      "review",
    ),
    true,
  );
  assert.equal(canAccessModule({ role: "ctv", permissions: [] }, "users", "read"), false);
});
