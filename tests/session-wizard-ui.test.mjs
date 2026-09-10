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
  assert.match(wizard, /error && !Object\.values\(fieldErrors\)\.some\(Boolean\)/);
});

test("wizard stepper exposes its ordered progress as a list", async () => {
  const [wizard, styles] = await Promise.all([
    readFile(new URL("../app/admin-session-wizard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-session-wizard.css", import.meta.url), "utf8"),
  ]);

  assert.match(wizard, /<nav className="admin-session-stepper" aria-label="Các bước tạo kíp thi"><ol>/);
  assert.match(wizard, /<li className=\{step === item\.id \? "active" : step > item\.id \? "completed" : ""\}/);
  assert.match(wizard, /aria-current=\{step === item\.id \? "step" : undefined\}/);
  assert.match(styles, /\.admin-session-stepper\s*> ol > li\s*\{/);
  assert.doesNotMatch(styles, /\.admin-session-stepper\s*> div\s*\{/);
});

test("session wizard uses native radio controls for exclusive choices", async () => {
  const wizard = await readFile(new URL("../app/admin-session-wizard.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(wizard, /role="listbox"|role="option"/);
  assert.match(wizard, /type="radio" name="roomId"/);
  assert.match(wizard, /type="radio" name="examId"/);
  assert.match(wizard, /type="radio" name="sessionMode"/);
});

test("session wizard announces steps and moves focus to each step heading", async () => {
  const wizard = await readFile(new URL("../app/admin-session-wizard.tsx", import.meta.url), "utf8");

  assert.match(wizard, /const stepHeadingRef = useRef<HTMLHeadingElement \| null>\(null\)/);
  assert.match(wizard, /stepHeadingRef\.current\?\.focus\(\)/);
  assert.match(wizard, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(wizard, /setAttribute\("tabindex", "-1"\)/);
});

test("session wizard exposes inline errors and focuses the first invalid field", async () => {
  const wizard = await readFile(new URL("../app/admin-session-wizard.tsx", import.meta.url), "utf8");

  assert.match(wizard, /type WizardField =/);
  assert.match(wizard, /pendingFocusField\.current = field/);
  assert.match(wizard, /setAttribute\("aria-invalid", "true"\)/);
  assert.match(wizard, /setAttribute\("aria-describedby", `wizard-\$\{field\}-error`\)/);
  assert.match(wizard, /className="admin-session-inline-errors"/);
  assert.match(wizard, /<p id=\{`wizard-\$\{field\}-error`\}/);
});

test("session wizard warns before unloading dirty work and clears the guard after save", async () => {
  const wizard = await readFile(new URL("../app/admin-session-wizard.tsx", import.meta.url), "utf8");

  assert.match(wizard, /const \[dirty, setDirty\] = useState\(false\)/);
  assert.match(wizard, /window\.addEventListener\("beforeunload", handleBeforeUnload\)/);
  assert.match(wizard, /event\.preventDefault\(\)/);
  assert.match(wizard, /setDirty\(false\);[\s\S]*?setCreated/);
  assert.match(wizard, /const \[pendingNavigation, setPendingNavigation\] = useState\(""\)/);
  assert.match(wizard, /pendingNavigation \? <AeckConfirmDialog/);
  assert.match(wizard, /requestNavigation\("\/admin\/sessions"\)/);
  assert.match(wizard, /listenForProductNavigation\(event =>/);
  assert.match(wizard, /event\.preventDefault\(\)/);
  assert.match(wizard, /setPendingNavigation\(event\.detail\.path\)/);
});

test("product shell exposes one cancelable navigation boundary for admin flows", async () => {
  const [platform, guard] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-navigation-guard.ts", import.meta.url), "utf8"),
  ]);

  assert.match(guard, /cancelable: true/);
  assert.match(guard, /PRODUCT_NAVIGATION_EVENT/);
  assert.match(platform, /requestProductNavigation\(target\)/);
  assert.match(platform, /requestProductNavigation\(nextLocation, "popstate"\)/);
  assert.match(platform, /if \(!requestProductNavigation\(path\)\) return/);
  assert.doesNotMatch(platform, /new PopStateEvent/);
});
