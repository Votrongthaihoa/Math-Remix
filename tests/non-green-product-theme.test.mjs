import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("non-protected product status surfaces use the red source palette instead of legacy green", async () => {
  const [adminTheme, productTheme] = await Promise.all([
    readFile(new URL("../app/admin-source-reference.css", import.meta.url), "utf8"),
    readFile(new URL("../app/red-white-theme.css", import.meta.url), "utf8"),
  ]);

  assert.match(adminTheme, /\.source-admin-shell:not\(\.protected-exam-surface\)[\s\S]*?\.admin-hls-vault-agent-pill\.agent-ready/);
  assert.match(adminTheme, /\.admin-upload-stat-icon\.green/);
  assert.match(adminTheme, /\.admin-session-stepper \.completed/);
  assert.match(adminTheme, /\.security-account-status/);
  assert.match(adminTheme, /:where\(\.active-dot, \.status i\)[^}]*background:\s*var\(--source-accent\)/s);

  assert.match(productTheme, /\.learner-red-theme:not\(\.protected-exam-surface\) \.courses-page \.course-exam-tabs/);
  assert.match(productTheme, /--study-accent:\s*var\(--brand-red\)/);
  assert.match(productTheme, /:where\(\.status i, \.active-dot\)[^}]*background:\s*var\(--brand-red\)/s);
});
