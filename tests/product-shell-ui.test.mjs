import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("product-shell UX layer stays outside protected exam UI", async () => {
  const css = await readFile(new URL("../app/product-shell-ux.css", import.meta.url), "utf8");

  assert.match(css, /\.ui-shell\.student-app\.product-shell/);
  assert.match(css, /\.ui-shell\.admin-app\.product-shell/);
  assert.doesNotMatch(css, /\.exam-shell|\.exam-room|\.guest-exam|\.question-bank/);
});

test("AECK tokens and primitives are isolated from protected exam surfaces", async () => {
  const [css, components] = await Promise.all([
    readFile(new URL("../app/aeck-ui.css", import.meta.url), "utf8"),
    readFile(new URL("../app/aeck-ui.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(css, /\.product-shell:not\(\.protected-exam-surface\)/);
  assert.match(css, /--aeck-primary: #1d4ed8/);
  assert.match(css, /--aeck-focus: #2563eb/);
  assert.doesNotMatch(css, /(^|\n)\s*(button|input|textarea|select|body|h1)\s*[{,]/m);
  assert.match(components, /AeckPageHeader/);
  assert.match(components, /AeckDialog/);
  assert.match(components, /AeckPagination/);
});

test("student activity month labels have a narrow-screen fallback", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /heatmap-month-short/);
  assert.match(platform, /aria-label=\{`Tháng \$\{index \+ 1\}`\}/);
});

test("dashboard list dots align with the center of their linked labels", async () => {
  const css = await readFile(new URL("../app/text-overflow-polish.css", import.meta.url), "utf8");

  assert.match(css, /\.overview-list-card li,[\s\S]*?align-items: center;/);
  assert.match(css, /\.overview-list-card li > \.dot[\s\S]*?margin-top: 0;/);
});

test("collapsed admin logo is centered on the vertical sidebar", async () => {
  const css = await readFile(new URL("../app/admin-macos.css", import.meta.url), "utf8");

  assert.match(css, /\.ui-shell\.admin-app\.product-shell:not\(\.sidebar-expanded\) \.header-brand\s*\{[\s\S]*?width:\s*84px;[\s\S]*?margin-inline-start:\s*-34px;[\s\S]*?justify-content:\s*center;/);
});

test("mobile admin drawer centers its logo without covering the close button", async () => {
  const css = await readFile(new URL("../app/admin-macos.css", import.meta.url), "utf8");

  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?\.ui-shell\.admin-app\.product-shell \.mobile-sidebar-head\s*\{[\s\S]*?position:\s*relative;[\s\S]*?justify-content:\s*flex-end;[\s\S]*?\.ui-shell\.admin-app\.product-shell \.mobile-sidebar-brand\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset-inline-start:\s*50%;[\s\S]*?width:\s*min\(200px,\s*calc\(100%\s*-\s*120px\)\);[\s\S]*?transform:\s*translateX\(-50%\);[\s\S]*?\.ui-shell\.admin-app\.product-shell \.mobile-sidebar-brand img\s*\{[\s\S]*?width:\s*100%;[\s\S]*?\.ui-shell\.admin-app\.product-shell \.mobile-sidebar-close\s*\{[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*1;/);
});
