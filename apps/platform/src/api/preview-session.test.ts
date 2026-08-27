import assert from "node:assert/strict";
import test from "node:test";

import {
  isCompiledPreviewSessionEnabled,
  resolvePreviewRole,
  shouldAutoStartPreviewSession,
} from "./preview-session.ts";

test("preview sessions work in deployed preview builds but stay disabled in production", () => {
  assert.deepEqual(
    [
      isCompiledPreviewSessionEnabled(true, "true"),
      isCompiledPreviewSessionEnabled(false, "true"),
      isCompiledPreviewSessionEnabled(true, undefined),
    ],
    [true, false, false],
  );
});

test("one preview build supports both login areas without forcing an automatic role", () => {
  assert.equal(resolvePreviewRole("student", "admin"), "admin");
  assert.equal(resolvePreviewRole("ctv", undefined), "ctv");
  assert.equal(shouldAutoStartPreviewSession("true"), true);
  assert.equal(shouldAutoStartPreviewSession(undefined), false);
});
