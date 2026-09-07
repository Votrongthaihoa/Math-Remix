import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the final red-white theme is last, scoped, and excludes protected exam surfaces", async () => {
  const [platform, theme] = await Promise.all([
    source("app/platform.tsx"),
    source("app/red-white-theme.css"),
  ]);
  assert.match(platform, /import "\.\/red-white-theme\.css";\s*import AdminSessionList/);
  assert.match(theme, /\.ui-shell\.student-app\.product-shell:not\(\.protected-exam-surface\)/);
  assert.match(theme, /\.ui-shell\.admin-app\.product-shell:not\(\.protected-exam-surface\)/);
  assert.match(theme, /--brand-red:\s*#cd1627/);
  assert.doesNotMatch(theme, /\.exam-shell|\.question-|\.answer-|\.exam-result|\.solution-/);
  assert.doesNotMatch(theme, /(^|\n)\s*(button|input|textarea|select|svg|body|h1)\s*[{,]/m);
});
