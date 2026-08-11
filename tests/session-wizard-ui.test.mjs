import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("session wizard exposes copy feedback and the current step", async () => {
  const wizard = await readFile(new URL("../app/admin-session-wizard.tsx", import.meta.url), "utf8");

  assert.match(wizard, /setCopied/);
  assert.match(wizard, /role="status"/);
  assert.match(wizard, /admin-session-wizard-success[\s\S]*?role="alert"/);
  assert.match(wizard, /aria-current=\{step === item\.id \? "step"/);
  assert.match(wizard, /captureNumericChange/);
  assert.match(wizard, /Number\.isFinite\(value\)/);
  assert.match(wizard, /setCustomValidity\(message\)/);
  assert.match(wizard, /admin-session-field-error-summary/);
});
