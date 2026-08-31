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
  assert.match(catchAll, /slug\[0\] === "portal"\) redirect\("\/courses"\)/);
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
