import assert from "node:assert/strict";
import test from "node:test";

import { createAuthStore } from "./auth-store.ts";

test("auth store logs in with a validated user and clears the whole snapshot", () => {
  const store = createAuthStore();
  const user = {
    id: "student-001",
    username: "Nguyễn Minh Anh",
    email: "minhanh@example.vn",
    role: "student" as const,
    studentCode: "HS-2026-001",
    permissions: [],
  };

  store.getState().login("access-token", user);
  assert.equal(store.getState().isAuthenticated, true);
  assert.equal(store.getState().accessToken, "access-token");
  assert.deepEqual(store.getState().user, user);

  store.getState().logout();
  assert.deepEqual(
    {
      user: store.getState().user,
      accessToken: store.getState().accessToken,
      isAuthenticated: store.getState().isAuthenticated,
    },
    { user: null, accessToken: null, isAuthenticated: false },
  );
});
