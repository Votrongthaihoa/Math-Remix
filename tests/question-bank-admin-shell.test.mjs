import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("question bank uses the source admin presentation without the macOS workspace label", async () => {
  const [component, sourceTheme] = await Promise.all([
    readFile(new URL("../app/admin-question-bank.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-source-reference.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(component, /macOS WORKSPACE/i);
  assert.match(sourceTheme, /\.source-admin-shell:not\(\.protected-exam-surface\) \.question-bank-page/);
  assert.match(sourceTheme, /\.question-bank-status\.active[\s\S]*?background:\s*var\(--source-accent-soft\);[\s\S]*?color:\s*var\(--source-accent-hover\);/);
});
