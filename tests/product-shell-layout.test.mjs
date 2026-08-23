import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("optimized lesson viewer gives the video a wider desktop column", async () => {
  const css = await readFile(new URL("../app/aeck-reference-ui.css", import.meta.url), "utf8");

  assert.match(css, /\.real-lesson-page \.lesson-layout\s*\{\s*gap:\s*24px;/);
  assert.match(css, /\.real-lesson-page \.curriculum-panel\s*\{\s*width:\s*320px;\s*flex-basis:\s*320px;/);
  assert.match(css, /@media\s*\(max-width:\s*1100px\)[\s\S]*?\.real-lesson-page \.lesson-layout\s*\{\s*flex-direction:\s*column;/);
});

test("collapsed student rail locks the compact logo to the 80px center", async () => {
  const css = await readFile(new URL("../app/aeck-reference-ui.css", import.meta.url), "utf8");

  assert.match(css, /:not\(\.sidebar-expanded\) \.student-sidebar-brand\s*\{[\s\S]*?width:\s*80px;[\s\S]*?padding-inline:\s*0;[\s\S]*?justify-content:\s*center;/);
  assert.match(css, /:not\(\.sidebar-expanded\) \.student-sidebar-brand \.student-sidebar-logo-compact\s*\{[\s\S]*?margin-inline:\s*auto;[\s\S]*?transform:\s*translateX\(-1px\);/);
});

test("collapsed admin rail moves the compact topbar logo back over the rail", async () => {
  const css = await readFile(new URL("../app/admin-macos.css", import.meta.url), "utf8");

  assert.match(css, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.ui-shell\.admin-app\.product-shell:not\(\.sidebar-expanded\) \.header-brand\s*\{[\s\S]*?width:\s*84px;[\s\S]*?transform:\s*translateX\(-28px\);/);
});

test("admin product surfaces use the light-red brand palette", async () => {
  const [adminCss, questionBankCss] = await Promise.all([
    readFile(new URL("../app/admin-macos.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-question-bank.css", import.meta.url), "utf8"),
  ]);

  assert.match(adminCss, /\.ui-shell\.admin-app\.product-shell:not\(\.protected-exam-surface\)[\s\S]*?--admin-primary:\s*#d25362;/);
  assert.match(adminCss, /\.ui-shell\.admin-app\.product-shell:has\(\.question-bank-page\)/);
  assert.match(questionBankCss, /--admin-primary:\s*#d25362;/);
  assert.doesNotMatch(questionBankCss, /rgba\(0,\s*122,\s*255/);
});
