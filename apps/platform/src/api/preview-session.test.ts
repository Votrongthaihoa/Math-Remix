import assert from "node:assert/strict";
import test from "node:test";

import { isCompiledPreviewSessionEnabled } from "./preview-session.ts";

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
