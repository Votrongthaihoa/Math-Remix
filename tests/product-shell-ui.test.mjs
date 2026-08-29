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

  const selectors = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .match(/[^{}]+(?=\{)/g)
    ?.flatMap(group => group.split(",").map(selector => selector.trim())) ?? [];
  const productShellSelectors = selectors.filter(selector => selector.includes(".product-shell"));

  assert.ok(productShellSelectors.length > 0);
  productShellSelectors.forEach(selector => {
    assert.ok(selector.includes(".ui-optimized-surface") || selector.includes(".ui-optimized-chrome"), selector);
    if (selector.includes(".ui-optimized-chrome")) {
      assert.doesNotMatch(selector, /\.main-content|\.product-content-surface/);
    }
  });
  assert.doesNotMatch(
    selectors.join("\n"),
    /\.(?:exam-|question-|answer-|exam-result|review-|solution-|admin-exam-|guest-exam)[\w-]*/i,
  );
  assert.match(css, /--aeck-primary: #b5122b/);
  assert.match(css, /--aeck-focus: #b5122b/);
  assert.match(css, /\.dashboard-next-step-action[\s\S]*?background: var\(--aeck-primary\)/);
  assert.match(css, /\.overview-list-card \.dot\.blue[\s\S]*?background: var\(--aeck-primary\)/);
  assert.doesNotMatch(css, /(^|\n)\s*(button|input|textarea|select|body|h1)\s*[{,]/m);
  assert.match(components, /AeckPageHeader/);
  assert.match(components, /AeckDialog/);
  assert.match(components, /AeckPagination/);
});

test("student activity month labels have a narrow-screen fallback", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /heatmap-month-short/);
  assert.match(platform, /aria-label=\{`Tháng \$\{index \+ 1\}`\}/);
  assert.match(platform, /role="img" aria-label=\{`Biểu đồ hoạt động năm/);
  assert.doesNotMatch(platform, /aria-label=\{inYear \? detail/);
});

test("dashboard provides one semantic next-step action without entering protected exam UI", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-shell-ux.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /const nextStep = nextRoom/);
  assert.match(platform, /<Link className="dashboard-next-step-action"/);
  assert.match(platform, /<h1>\{profile\.full_name\}<\/h1>/);
  assert.doesNotMatch(platform, /<b>Bài thi IRT<\/b>/);
  assert.match(css, /\.dashboard-next-step-action/);
  assert.match(css, /\.student-app\.product-shell:not\(\.protected-exam-surface\) \.dashboard-next-step/);
});

test("product-shell smoke can focus on requested routes without unrelated interactions", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /SMOKE_EXTENDED_INTERACTIONS/);
  assert.match(smoke, /const focusedAudit = requestedRoutes\.size > 0/);
  assert.match(smoke, /!focusedAudit \|\| requestedRoutes\.has\("student-exam-list"\)/);
  assert.match(smoke, /if \(extendedInteractions\) \{/);
  assert.match(smoke, /SMOKE_RESOURCE_MODAL/);
  assert.match(smoke, /inspectCourseResourceModal/);
});

test("courses use native links and curriculum list semantics", async () => {
  const [platform, productCss] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-ui-v2.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /<Link className="course-card-action" href=\{href\}/);
  assert.doesNotMatch(platform, /<button className="course-card-action"/);
  assert.match(platform, /<ul className="course-part-lessons">/);
  assert.match(platform, /<li key=\{lesson\.id\}><Link/);
  assert.match(productCss, /\.course-part-lessons > li > a/);
});

test("student shell exposes URL-backed shortcuts and course view modes", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-shell-ux.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /className="dashboard-shortcuts"/);
  assert.match(platform, /href="\/courses"/);
  assert.match(platform, /href="\/progress"/);
  assert.match(platform, /href="\/tkb"/);
  assert.match(platform, /const courseView = searchParams\.get\("view"\) === "list"/);
  assert.match(platform, /router\.push\(`\$\{pathname\}\$\{nextQuery/);
  assert.match(platform, /course-list-view/);
  assert.match(css, /\.dashboard-shortcuts-grid/);
  assert.match(css, /\.course-view-toggle/);
  assert.match(css, /\.course-grid\.reference-course-grid\.course-list-view/);
});

test("admin quick actions connect to real modals and routes", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-shell-ux.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /className="admin-quick-actions"/);
  assert.match(platform, /setModal\(true\)/);
  assert.match(platform, /setCourseModal\(true\)/);
  assert.match(platform, /href="\/admin\/sessions\/new"/);
  assert.match(platform, /href="\/admin\/upload"/);
  assert.match(css, /\.admin-quick-actions-grid/);
  assert.match(css, /\.admin-quick-action/);
  assert.match(css, /\.admin-workflow-strip > a/);
});

test("public auth pages expose a clear portal switch", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth-ui-v2.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /className="login-portal-switch"/);
  assert.match(platform, /href="\/admin"/);
  assert.match(platform, /href="\/"/);
  assert.match(css, /\.login-page\.auth-public-refresh\.ui-auth-surface \.login-portal-switch/);
});

test("course content loaders always settle and ignore superseded routes", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /async function loadCourseContent\(\)[\s\S]*?try \{[\s\S]*?finally \{\s*if \(!cancelled\) setLoadingContent\(false\);/);
  assert.match(platform, /async function loadLesson\(\)[\s\S]*?resourceResult\.json\(\)\.catch\(\(\) => null\)[\s\S]*?finally \{\s*if \(!cancelled\) setLessonLoading\(false\);/);
  assert.match(platform, /setLesson\(null\); setResources\(\[\]\); setCurriculum\(\[\]\); setSelectedResourceId\(""\);/);
  assert.match(platform, /const accessToken = await activeSessionToken\(\)\.catch\(\(\) => null\);\s*if \(cancelled\) return;/);
});

test("secure lesson viewer cancels stale requests and owns temporary downloads", async () => {
  const player = await readFile(new URL("../app/video-player.tsx", import.meta.url), "utf8");

  assert.match(player, /const pendingDownloadUrlsRef = useRef\(new Map<string, number>\(\)\)/);
  assert.match(player, /for \(const \[url, timer\] of pendingDownloadUrlsRef\.current\)[\s\S]*?window\.clearTimeout\(timer\);[\s\S]*?URL\.revokeObjectURL\(url\);/);
  assert.match(player, /const \{ data: userData \} = await supabase\.auth\.getUser\(accessToken\);\s*if \(cancelled\) return;\s*setWatermarkEmail/);
  assert.ok((player.match(/const controller = new AbortController\(\);/g) ?? []).length >= 3);
  assert.ok((player.match(/signal: controller\.signal/g) ?? []).length >= 3);
  assert.ok((player.match(/controller\.abort\(\)/g) ?? []).length >= 3);
});

test("history empty states announce filter results", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /<EmptyState icon=\{History\}[\s\S]*?role="status" ariaLive="polite"/);
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
