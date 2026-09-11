import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin product shell reuses the supplied HTML shell contract outside protected UI", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-source-reference.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /import "\.\/admin-source-reference\.css";/);
  assert.match(platform, /adminRouteRequested && !protectedProductSurface \? "source-admin-shell" : ""/);
  assert.match(platform, /className="source-sidebar-header-divider"/);
  assert.match(platform, /sourceIcon: "appstore"/);
  assert.match(platform, /sourceIcon: "read"/);
  assert.match(platform, /sourceIcon: "calendar"/);

  assert.match(css, /Source: D:\\fbbbbbbbbbbbbb\\exam-rooms\\286a3b26-5e40-4e92-b9cd-f03acbba4da0\.htm/);
  assert.match(css, /\.source-admin-shell:not\(\.protected-exam-surface\)/);
  assert.match(css, /--source-sidebar-expanded:\s*288px/);
  assert.match(css, /--source-sidebar-collapsed:\s*80px/);
  assert.match(css, /--source-header-expanded:\s*81px/);
  assert.match(css, /--source-accent:\s*#cd1627/i);
  assert.match(css, /> \.sidebar\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*40;[^}]*transition:\s*width \.5s cubic-bezier\(\.22,\s*1,\s*\.36,\s*1\);/s);
  assert.match(css, /> \.topbar\s*\{[^}]*position:\s*sticky;[^}]*z-index:\s*50;/s);
  assert.match(css, /\.source-sidebar-header-divider\s*\{[^}]*inset-inline-start:\s*287px;[^}]*border-inline-end:\s*2px solid rgba\(229,\s*231,\s*235,\s*\.5\);/s);
  assert.match(css, /\.admin-sidebar-nav-item\.active\s*\{[^}]*border-inline-end-color:\s*var\(--source-accent\);[^}]*background:\s*#fef2f2;/s);
  assert.doesNotMatch(css, /\.exam-shell|\.question-bank|\.answer-|\.result-|\.review-|\.solution-/i);
});

test("admin content primitives use the supplied card, control, field, table and modal values", async () => {
  const css = await readFile(new URL("../app/admin-source-reference.css", import.meta.url), "utf8");

  assert.match(css, /--source-shadow-card:\s*0 4px 6px -1px rgba\(0, 0, 0, \.1\), 0 2px 4px -2px rgba\(0, 0, 0, \.1\)/);
  assert.match(css, /:where\(\.section-card,[^}]*\)\s*\{[^}]*border:\s*1px solid #e5e7eb;[^}]*border-radius:\s*12px;[^}]*box-shadow:\s*var\(--source-shadow-card\);/s);
  assert.match(css, /:where\(\.primary-btn,[^}]*\)\s*\{[^}]*min-height:\s*36px;[^}]*padding:\s*8px 20px;[^}]*border-radius:\s*8px;[^}]*background:\s*var\(--source-accent\);[^}]*font-size:\s*14px;[^}]*font-weight:\s*600;/s);
  assert.match(css, /:where\(input:not[^}]*select, textarea\)\s*\{[^}]*min-height:\s*40px;[^}]*padding:\s*7px 11px;[^}]*border:\s*1px solid #d9d9d9;[^}]*border-radius:\s*8px;/s);
  assert.match(css, /:where\(table\)\s*\{[^}]*width:\s*100%;[^}]*border-collapse:\s*collapse;/s);
  assert.match(css, /:where\(\.modal\)\s*\{[^}]*padding:\s*20px 24px;[^}]*border-radius:\s*8px;[^}]*box-shadow:\s*0 6px 16px rgba\(0, 0, 0, \.08\), 0 3px 6px -4px rgba\(0, 0, 0, \.12\), 0 9px 28px 8px rgba\(0, 0, 0, \.05\);/s);
  assert.match(css, /:where\(\.admin-tabs,[^}]*\)\s*\{[^}]*border-bottom:\s*1px solid #e5e7eb;/s);
  assert.match(css, /:where\(\.account-dropdown\)\s*\{[^}]*min-width:\s*200px;[^}]*padding:\s*4px;[^}]*border-radius:\s*8px;/s);
});
