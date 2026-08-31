import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public auth and product chrome use the canonical AECK identity", async () => {
  const [platform, layout, logo, capabilityCenter, videoPlayer, pdfRoute, pdfViewer, embeddedPlayer] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/logo_aeck_full.svg", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-capability-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/video-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/lesson-pdf-download/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/pdf-viewer.html", import.meta.url), "utf8"),
    readFile(new URL("../public/yt-embed-player.html", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /src="\/logo_aeck_full\.svg"/);
  assert.match(platform, /src="\/logo_aeck\.svg"/);
  assert.doesNotMatch(platform, /src="\/logo_tsa\.svg"/);
  assert.match(layout, /title:\s*"AECK"/);
  assert.match(layout, /icon:\s*"\/logo_aeck\.svg"/);
  assert.match(logo, /ANH EM CÂY KHẾ|Anh Em Cây Khế/i);
  assert.doesNotMatch(platform, /Remix Education/);
  assert.doesNotMatch(`${platform}\n${capabilityCenter}\n${videoPlayer}\n${pdfRoute}\n${pdfViewer}\n${embeddedPlayer}`, /Math Remix|Học viên REMIX|REMIX (?:PDF|Video) Viewer|REMIX Education/);
  assert.match(pdfViewer, /<title>AECK PDF Viewer<\/title>/);
  assert.match(embeddedPlayer, /<title>AECK Video Player<\/title>/);
  assert.match(pdfRoute, /setProducer\("AECK"\)/);
  assert.match(platform, /Tổng quan \| AECK/);
});

test("course cards remain content surfaces instead of inheriting primary-button chrome", async () => {
  const css = await readFile(new URL("../app/product-design-system.css", import.meta.url), "utf8");
  const controls = css.slice(
    css.indexOf("/* Buttons and links that behave as controls */"),
    css.indexOf("/* Fields and search controls */"),
  );

  assert.doesNotMatch(controls, /\.course-card-action/);
  assert.match(css, /\.reference-course-card \.course-card-action\s*\{[\s\S]*?background:\s*transparent/);
});

test("exam catalog chrome keeps the full AECK wordmark on narrow screens", async () => {
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");

  assert.match(css, /ui-optimized-chrome > \.topbar \.header-brand/);
  assert.match(css, /ui-optimized-chrome > \.topbar \.header-brand-logo-full/);
});

test("visual smoke measures the rendered rail logo and native Alpha dashboard", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /visibleSidebarLogo/);
  assert.match(smoke, /sidebarLogoCenterOffset/);
  assert.match(smoke, /\[data-testid="student-dashboard"\]/);
  assert.match(smoke, /\.alpha-dashboard-resource-grid/);
  assert.doesNotMatch(smoke, /document\.querySelectorAll\("\.dashboard-shortcuts-grid > a"\)/);
});

test("student visual smoke stays on student and shared chrome routes", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /const roleAuditRoutes = mockRole === "student"/);
  assert.match(smoke, /name\.startsWith\("student-"\)/);
  assert.match(smoke, /const allAuditRoutes = roleAuditRoutes/);
  assert.match(smoke, /mockRole === "student" \? "\/dashboard" : "\/admin"/);
});

test("visual smoke waits for a real route surface before measuring", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /async function waitForRouteSurface/);
  assert.match(smoke, /\.ui-shell, main\.login-page, \.exam-shell/);
  assert.match(smoke, /await waitForRouteSurface\(\);[\s\S]*?const state = await page\.evaluate/);
});

test("student navigation uses Alpha semantic states without touching protected exam content", async () => {
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");

  assert.match(css, /\.student-sidebar-nav :where\(\.student-nav-primary\.active, \.student-nav-disclosure\.active-parent > summary\)/);
  assert.match(css, /background:\s*var\(--alpha-accent-selected\)/);
  assert.match(css, /\.student-nav-children :where\(a:hover, a\.active\)/);
  assert.doesNotMatch(css, /\.exam-shell|\.question|\.answer|\.result|\.review|\.solution/);
});

test("visual smoke only measures dashboard dot alignment for a student session", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /mockRole === "student"[\s\S]*?await inspectDashboardDotAlignment\(\)/);
  assert.match(smoke, /\.alpha-dashboard-list-card li/);
  assert.match(smoke, /\.alpha-list-dot/);
  assert.match(smoke, /hiddenFileInput/);
  assert.match(smoke, /inlineTextLink/);
});

test("Alpha dashboard has an intentional tablet composition at the desktop-mobile boundary", async () => {
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");
  const compactCss = css.replace(/\s+/g, " ");

  assert.match(compactCss, /@media \(max-width: 900px\) and \(min-width: 768px\) \{[\s\S]*?\.alpha-dashboard-summary \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(compactCss, /\.alpha-summary-profile, \.ui-shell\.student-app\.product-shell\.alpha-reference-surface \.alpha-summary-role \{[^}]*grid-column: 1 \/ -1/);
  assert.match(compactCss, /\.ui-shell\.admin-app\.product-shell\.alpha-reference-surface \.admin-reference-finder \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(compactCss, /\.ui-shell\.admin-app\.product-shell\.alpha-reference-surface \.admin-reference-results, \.ui-shell\.admin-app\.product-shell\.alpha-reference-surface \.admin-two-col \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(compactCss, /\.ui-shell\.admin-app\.product-shell\.alpha-reference-surface \.admin-dash-status-rail \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("full visual smoke includes every non-protected admin shell route", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  for (const path of ["/admin/hls-vault", "/admin/capabilities", "/admin/server-health", "/admin/sessions/new", "/admin/content/courses/mock-course"]) {
    assert.ok(smoke.includes(`"${path}"`), `missing ${path}`);
  }
});

test("visual smoke persists machine-readable evidence and fails recorded layout regressions", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /SMOKE_REPORT_FILE/);
  assert.match(smoke, /await writeFile\(reportFile/);
  assert.match(smoke, /const layoutIssues = report\.filter/);
  assert.match(smoke, /item\.horizontalOverflow \|\| item\.controlsOutsideViewport \|\| item\.unnamedControls/);
  assert.match(smoke, /page\.locator\("\.admin-quick-actions-grid"\)\.waitFor/);
});

test("resource source switching remounts file and controlled URL inputs independently", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /<label key="resource-file" htmlFor="new-resource-file">/);
  assert.match(platform, /<label key="resource-url" htmlFor="new-resource-url">/);
});
