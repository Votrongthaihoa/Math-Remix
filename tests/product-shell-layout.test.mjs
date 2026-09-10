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
  const css = await readFile(new URL("../app/admin-product-shell.css", import.meta.url), "utf8");

  assert.match(css, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.ui-shell\.admin-app\.product-shell:not\(\.sidebar-expanded\) \.header-brand\s*\{[\s\S]*?width:\s*84px;[\s\S]*?transform:\s*translateX\(-28px\);/);
});

test("admin sidebar anchors preserve icon and label geometry on protected routes", async () => {
  const css = await readFile(new URL("../app/admin-product-shell.css", import.meta.url), "utf8");

  assert.match(css, /\.sidebar nav a\.admin-sidebar-nav-item\s*\{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*center;[\s\S]*?gap:\s*13px;/);
  assert.match(css, /\.sidebar nav a\.admin-sidebar-nav-item\s*>\s*svg\s*\{[\s\S]*?width:\s*20px;[\s\S]*?height:\s*20px;[\s\S]*?flex:\s*0 0 20px;/);
  assert.match(css, /:not\(\.sidebar-expanded\) \.sidebar nav a\.admin-sidebar-nav-item\s*\{[\s\S]*?justify-content:\s*center;[\s\S]*?gap:\s*0;/);
});

test("admin navigation mirrors the student rail interaction on normal product surfaces", async () => {
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");

  assert.match(css, /\.app-shell\.ui-shell\.admin-app\.product-shell\.alpha-reference-surface:not\(\.protected-exam-surface\) \.sidebar nav a\.admin-sidebar-nav-item\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-height:\s*44px;[\s\S]*?padding:\s*12px 16px 12px 24px;[\s\S]*?border-inline-end:\s*3px solid transparent;[\s\S]*?border-radius:\s*0;/);
  assert.match(css, /\.admin-sidebar-nav-item\.active\s*\{[\s\S]*?border-inline-end-color:\s*var\(--alpha-green\);[\s\S]*?background:\s*var\(--alpha-accent-selected\);/);
  assert.match(css, /:not\(\.sidebar-expanded\) \.sidebar nav a\.admin-sidebar-nav-item\s*\{[\s\S]*?justify-content:\s*center;[\s\S]*?gap:\s*0;[\s\S]*?padding-inline:\s*0;/);
});

test("collapsed admin header mark stays centered in the 80px rail", async () => {
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");

  assert.match(css, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.admin-app\.product-shell\.alpha-reference-surface:not\(\.protected-exam-surface\):not\(\.sidebar-expanded\)[\s\S]*?\.header-brand\s*\{[\s\S]*?width:\s*80px;[\s\S]*?min-width:\s*80px;[\s\S]*?margin-inline-start:\s*-20px;[\s\S]*?transform:\s*none;/);
});

test("admin mobile rail mirrors the student's 80px rail and 288px drawer", async () => {
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");

  assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.admin-app\.product-shell\.alpha-reference-surface:not\(\.protected-exam-surface\) > \.sidebar\s*\{[\s\S]*?width:\s*80px\s*!important;[\s\S]*?transform:\s*none;/);
  assert.match(css, /\.admin-app\.product-shell\.alpha-reference-surface:not\(\.protected-exam-surface\) > \.sidebar\.mobile-open\s*\{[\s\S]*?width:\s*288px\s*!important;[\s\S]*?z-index:\s*90;/);
  assert.match(css, /\.admin-app\.product-shell\.alpha-reference-surface:not\(\.protected-exam-surface\) > \.topbar\s*\{[\s\S]*?width:\s*calc\(100% - 80px\) !important;[\s\S]*?margin-left:\s*80px !important;/);
  assert.match(css, /\.admin-app\.product-shell\.alpha-reference-surface:not\(\.protected-exam-surface\) > \.main-content\s*\{[\s\S]*?margin-left:\s*80px;/);
});

test("admin modal layers above the persistent mobile rail", async () => {
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");

  assert.match(css, /\.admin-app\.product-shell\.alpha-reference-surface:not\(\.protected-exam-surface\) > \.main-content:has\(\.modal-shade\)\s*\{[\s\S]*?z-index:\s*100;/);
});

test("admin product surfaces use the light-red brand palette", async () => {
  const [adminCss, questionBankCss] = await Promise.all([
    readFile(new URL("../app/admin-product-shell.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-question-bank.css", import.meta.url), "utf8"),
  ]);

  assert.match(adminCss, /\.ui-shell\.admin-app\.product-shell:not\(\.protected-exam-surface\)[\s\S]*?--admin-primary:\s*#d25362;/);
  assert.match(adminCss, /\.ui-shell\.admin-app\.product-shell:has\(\.question-bank-page\)/);
  assert.match(questionBankCss, /--admin-primary:\s*#d25362;/);
  assert.doesNotMatch(questionBankCss, /rgba\(0,\s*122,\s*255/);
});
