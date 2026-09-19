import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public AECK routes use the isolated reference implementation", async () => {
  const [home, catchAll, routes, site, css] = await Promise.all([
    source("app/page.tsx"),
    source("app/[...slug]/page.tsx"),
    source("app/aeck-public-routes.ts"),
    source("app/aeck-public-site.tsx"),
    source("app/aeck-public-site.module.css"),
  ]);

  assert.match(home, /<AeckPublicSite\s*\/>/);
  assert.match(catchAll, /<AeckPublicSite route=\{publicRoute\}\s*\/>/);
  assert.match(catchAll, /targetRouteRedirect\(slug, queryValues\)/);
  const aliases = await source("app/target-route-aliases.ts");
  assert.match(aliases, /slug\[0\] === "portal"\) return "\/profile"/);
  for (const route of [
    "giao-vien",
    "goi-hoc-tap",
    "dang-ky-minh-chung",
    "luyen-thi-tsa",
    "cau-truc-de-thi-tsa",
    "cach-tinh-diem-tsa",
    "luyen-thi-hsa",
    "cau-truc-de-thi-hsa",
    "dang-ky-thi-hsa",
    "dieu-khoan-dich-vu",
    "chinh-sach-bao-mat",
  ]) {
    assert.ok(routes.includes(`"${route}"`), `missing public route ${route}`);
  }
  assert.match(site, /className=\{styles\.site\}/);
  assert.match(site, /logo-wordmark-red\.svg/);
  assert.match(site, /href="\/courses"/);
  assert.doesNotMatch(site, /hsa\.aeck\.vn/i);
  assert.doesNotMatch(css, /\.exam-shell|\.exam-room|\.question|\.answer|\.result|\.review|\.solution/);
});

test("public wordmark is complete and keeps the official red vector identity", async () => {
  const logo = await source("public/aeck-public/logo-wordmark-red.svg");

  assert.match(logo, /viewBox='0 0 600 161\.249994'/);
  assert.match(logo, /fill:#cd1627/);
  assert.match(logo, /translate\(444\.794776, 134\.109655\)/);
  assert.match(logo, /<\/svg>\s*$/);
  assert.doesNotMatch(logo, /<text\b/i);
});

test("TSA and HSA courses remain in one Alpha catalogue with URL-backed tabs", async () => {
  const [platform, css] = await Promise.all([
    source("app/platform.tsx"),
    source("app/course-exam-tabs.css"),
  ]);

  assert.match(platform, /type CourseExamTab = "ALL" \| "TSA" \| "HSA"/);
  assert.match(platform, /searchParams\.get\("examType"\)/);
  assert.match(platform, /role="tablist" aria-label="Phân loại khóa học"/);
  assert.match(platform, /role="tabpanel"/);
  assert.match(platform, /courseExamGroup\(course\)/);
  assert.match(css, /^\/\* Course-only grouping/m);
  assert.ok((css.match(/\.ui-shell\.student-app\.product-shell \.courses-page/g) ?? []).length >= 8);
  assert.doesNotMatch(css, /\.exam-shell|\.exam-room|\.question|\.answer|\.result|\.review|\.solution/);
});

test("public mobile navigation traps focus and isolates the background", async () => {
  const site = await source("app/aeck-public-site.tsx");

  assert.match(site, /mobileMenuRef/);
  assert.match(site, /event\.key !== "Tab"/);
  assert.match(site, /querySelectorAll<HTMLElement>\(\s*"a\[href\], button:not\(\[disabled\]\)/);
  assert.match(site, /element\.inert = true/);
  assert.match(site, /element\.inert = original/);
});

test("public site exposes a keyboard-visible skip link to every primary-content landmark", async () => {
  const [site, css] = await Promise.all([
    source("app/aeck-public-site.tsx"),
    source("app/aeck-public-site.module.css"),
  ]);

  assert.match(site, /const publicMainContentId = "aeck-public-main-content";/);
  assert.match(site, /<a className=\{styles\.skipLink\} href=\{`#\$\{publicMainContentId\}`\}>[\s\S]*?Chuyển đến nội dung chính[\s\S]*?<\/a>/);
  assert.equal((site.match(/<main id=\{publicMainContentId\}/g) ?? []).length, 6);
  assert.equal((site.match(/tabIndex=\{-1\}/g) ?? []).length, 6);
  assert.match(css, /\.site \.skipLink\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?transform:\s*translate\(-50%, -180%\);/);
  assert.match(css, /\.site \.skipLink:focus-visible\s*\{[\s\S]*?transform:\s*translate\(-50%, 0\);/);
  assert.match(css, /\.primaryContent\s*\{[\s\S]*?scroll-margin-top:\s*96px;/);
});

test("public signed-out primary action keeps the supplied TSA red identity", async () => {
  const css = await source("app/aeck-public-site.module.css");

  assert.match(css, /\.loginButton\s*\{[^}]*background:\s*var\(--public-red\);[^}]*color:\s*#fff\s*!important;/s);
  assert.match(css, /\.loginButton:hover\s*\{[^}]*background:\s*var\(--public-red-dark\);/s);
  assert.doesNotMatch(css, /\.loginButton\s*\{[^}]*background:\s*#050505;/s);
});

test("a course shared by TSA and HSA is available from both tabs", async () => {
  const [site, platform] = await Promise.all([
    source("app/aeck-public-site.tsx"),
    source("app/platform.tsx"),
  ]);

  assert.match(site, /hasTsa && hasHsa \? "\/courses"/);
  assert.match(platform, /if \(hasHsa && hasTsa\) return "SHARED"/);
});

test("the teacher directory exposes one semantic page heading", async () => {
  const site = await source("app/aeck-public-site.tsx");

  assert.match(site, /function TeachersPage[\s\S]*?<h1>ĐỘI NGŨ GIÁO VIÊN<\/h1>/);
});

test("the mobile navigation overlay fills the dynamic viewport", async () => {
  const css = await source("app/aeck-public-site.module.css");

  assert.match(css, /\.mobileMenuShade\s*\{[\s\S]*?width:\s*100vw;[\s\S]*?height:\s*100dvh;/);
  assert.match(css, /\.mobileMenuPanel\s*\{[\s\S]*?height:\s*100dvh;/);
});

test("public browser smoke covers every public route, auth state, modal, menu, and standalone surface", async () => {
  const smoke = await source("scripts/public-ui-smoke.mjs");

  for (const route of ["/", "/giao-vien", "/goi-hoc-tap", "/dang-ky-minh-chung", "/luyen-thi-tsa", "/cau-truc-de-thi-tsa", "/cach-tinh-diem-tsa", "/luyen-thi-hsa", "/cau-truc-de-thi-hsa", "/dang-ky-thi-hsa", "/dieu-khoan-dich-vu", "/chinh-sach-bao-mat"]) {
    assert.ok(smoke.includes(JSON.stringify(route)), `public smoke missing ${route}`);
  }
  assert.match(smoke, /\/login\?intent=register/);
  assert.match(smoke, /inspectMobileMenu/);
  assert.match(smoke, /inspectTeacherModal/);
  assert.match(smoke, /inspectSignupValidation/);
  assert.match(smoke, /pdf-viewer\.html/);
  assert.match(smoke, /yt-embed-player\.html/);
  assert.match(smoke, /404-eyes\.html/);
  assert.match(smoke, /const redirectRoutes = \[/);
  for (const route of ["/portal", "/exam-result/mock-attempt-latest", "/question-bank/example", "/item/create/example", "/exam-management/example", "/assessment-management/example", "/exam-room-management/example", "/user-management/example", "/group-user-management/example", "/course-management", "/media-management/example", "/exam-result-management/example", "/tkb-management/example", "/admin-log/example", "/server-health/example", "/irt-exam-management/example", "/evidence-registration-management/example", "/subscription-package-management/example", "/shipment-management/example", "/ilearn-management/example", "/watermark-trace/example", "/admin/all/example"]) {
    assert.ok(smoke.includes(JSON.stringify(route)), `redirect smoke missing ${route}`);
  }
  assert.match(smoke, /inspectRedirects/);
});

test("public compatibility smoke follows the reference portal destination", async () => {
  const smoke = await source("scripts/public-ui-smoke.mjs");

  assert.match(smoke, /\["\/portal", "\/profile"\]/);
  assert.doesNotMatch(smoke, /\["\/portal", "\/courses"\]/);
});

test("public interaction smoke waits for hydration before clicking controls", async () => {
  const smoke = await source("scripts/public-ui-smoke.mjs");

  assert.match(smoke, /async function waitForPublicHydration/);
  assert.match(smoke, /await page\.waitForLoadState\("networkidle"\)/);
  assert.ok((smoke.match(/await waitForPublicHydration\(\)/g) ?? []).length >= 5);
});

test("public legal route parity covers every visible policy route", async () => {
  const [routes, catchAll, smoke] = await Promise.all([
    source("app/aeck-public-routes.ts"),
    source("app/[...slug]/page.tsx"),
    source("scripts/public-ui-smoke.mjs"),
  ]);

  for (const route of [
    "dieu-kien-han-che-cung-cap",
    "quyen-va-nghia-vu-hai-ben",
    "chinh-sach-thanh-toan",
    "chinh-sach-gia",
    "chinh-sach-van-chuyen-doi-tra",
    "chinh-sach-khieu-nai",
  ]) {
    assert.ok(routes.includes(`"${route}"`), `missing legal route ${route}`);
    assert.ok(smoke.includes(`"/${route}"`), `public smoke missing /${route}`);
  }
  assert.match(catchAll, /supplementalLegalDocuments/);
});
