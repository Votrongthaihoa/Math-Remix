import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the final theme chain ends with the scoped source admin layer and excludes protected exam surfaces", async () => {
  const [platform, theme, adminSourceTheme] = await Promise.all([
    source("app/platform.tsx"),
    source("app/red-white-theme.css"),
    source("app/admin-source-reference.css"),
  ]);
  assert.match(platform, /import "\.\/red-white-theme\.css";\s*import "\.\/admin-source-reference\.css";\s*import AdminSessionList/);
  assert.match(theme, /\.ui-shell\.student-app\.product-shell:not\(\.protected-exam-surface\)/);
  assert.match(theme, /\.ui-shell\.admin-app\.product-shell:not\(\.protected-exam-surface\)/);
  assert.match(adminSourceTheme, /\.source-admin-shell:not\(\.protected-exam-surface\)/);
  assert.doesNotMatch(adminSourceTheme, /\.exam-shell|\.question-(?!bank)|\.answer-|\.exam-result|\.solution-/);
  assert.match(theme, /--brand-red:\s*#cd1627/);
  assert.doesNotMatch(theme, /\.exam-shell|\.question-|\.answer-|\.exam-result|\.solution-/);
  assert.doesNotMatch(theme, /(^|\n)\s*(button|input|textarea|select|svg|body|h1)\s*[{,]/m);
});

test("the final product layer replaces the inherited green ambient background on learner and admin shells", async () => {
  const theme = await source("app/red-white-theme.css");

  assert.match(theme, /\.ui-shell\.student-app\.product-shell\.learner-red-theme:not\(\.protected-exam-surface\) > \.student-global-bg,[\s\S]*?\.ui-shell\.admin-app\.product-shell\.learner-red-theme:not\(\.protected-exam-surface\) > \.student-global-bg\s*\{[\s\S]*?background:\s*rgba\(205, 22, 39, \.035\);/);
});

test("the optimized admin content layer cannot restore green success notices", async () => {
  const theme = await source("app/red-white-theme.css");

  assert.match(theme, /\.ui-shell\.admin-app\.product-shell\.learner-red-theme\.alpha-reference-surface\.ui-optimized-surface:not\(\.protected-exam-surface\) > \.main-content\.product-content-surface :where\(\.form-success, \.admin-session-notice, \.admin-timetable-notice, \.admin-hls-vault-notice\)\s*\{[\s\S]*?border-color:\s*var\(--brand-red-selected\);[\s\S]*?background:\s*var\(--brand-red-soft\);[\s\S]*?color:\s*var\(--brand-red-hover\);/);
});
