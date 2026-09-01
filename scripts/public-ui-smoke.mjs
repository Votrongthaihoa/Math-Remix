import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const outputDir = process.env.PUBLIC_SMOKE_OUTPUT_DIR ?? join(tmpdir(), "aeck-public-ui-audit");
const reportFile = process.env.PUBLIC_SMOKE_REPORT_FILE ?? join(outputDir, "report.json");
const widths = (process.env.PUBLIC_SMOKE_WIDTHS ?? "1440,768,390,320").split(",").map(Number).filter(Boolean);
const publicRoutes = [
  "/",
  "/giao-vien",
  "/goi-hoc-tap",
  "/dang-ky-minh-chung",
  "/luyen-thi-tsa",
  "/cau-truc-de-thi-tsa",
  "/cach-tinh-diem-tsa",
  "/luyen-thi-hsa",
  "/cau-truc-de-thi-hsa",
  "/dang-ky-thi-hsa",
  "/dieu-khoan-dich-vu",
  "/chinh-sach-bao-mat",
];
const authRoutes = [
  ["/login", "Đăng nhập"],
  ["/login?intent=register", "Tạo tài khoản AECK"],
  ["/forgot-password", "Quên mật khẩu"],
  ["/reset-password", "Đặt mật khẩu mới"],
];
const standaloneRoutes = [
  ["/pdf-viewer.html", "AECK PDF Viewer", "Không thể mở PDF"],
  ["/yt-embed-player.html", "AECK Video Player", "Không tìm thấy mã video hợp lệ"],
  ["/404-eyes.html", "404 Eyes", "canvas"],
];
const redirectRoutes = [
  ["/portal", "/courses"],
  ["/exam-result/mock-attempt-latest", "/exam/result/mock-attempt-latest"],
  ["/question-bank/example", "/admin/question-bank"],
  ["/item/create/example", "/admin/question-bank"],
  ["/exam-management/example", "/admin/exams"],
  ["/assessment-management/example", "/admin/sessions"],
  ["/exam-room-management/example", "/admin/sessions"],
  ["/user-management/example", "/admin/students"],
  ["/group-user-management/example", "/admin/enrollments"],
  ["/course-management", "/admin/content"],
  ["/course-management/mock-course", "/admin/content/courses/mock-course"],
  ["/course-management/mock-course/deep", "/admin/capabilities?module=courses"],
  ["/media-management/example", "/admin/upload"],
  ["/exam-result-management/example", "/admin/sessions"],
  ["/tkb-management/example", "/admin/timetable"],
  ["/admin-log/example", "/admin/audit"],
  ["/server-health/example", "/admin/server-health"],
  ["/irt-exam-management/example", "/admin/capabilities?module=irt"],
  ["/evidence-registration-management/example", "/admin/capabilities?module=evidence"],
  ["/subscription-package-management/example", "/admin/capabilities?module=subscriptions"],
  ["/shipment-management/example", "/admin/capabilities?module=shipments"],
  ["/ilearn-management/example", "/admin/capabilities?module=ilearn"],
  ["/watermark-trace/example", "/admin/capabilities?module=watermark"],
  ["/admin/all/example", "/admin/capabilities"],
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = [];
let activeCheck = null;
page.on("pageerror", error => activeCheck?.runtimeIssues.push({ type: "pageerror", message: error.message }));
page.on("console", message => {
  if (message.type() !== "error") return;
  if (activeCheck?.allowedStatus === 404 && message.text().includes("status of 404")) return;
  activeCheck?.runtimeIssues.push({ type: "console", message: message.text() });
});

async function waitForPublicHydration() {
  await page.waitForLoadState("networkidle");
}

async function inspect(path, width, options = {}) {
  const check = { path, width, allowedStatus: options.allowedStatus ?? null, runtimeIssues: [] };
  activeCheck = check;
  await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
  let response = options.navigate === false ? null : await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (!options.static) {
    for (let surfaceAttempt = 0; surfaceAttempt < 2; surfaceAttempt += 1) {
      try {
        await page.locator("main").first().waitFor({ state: "visible", timeout: 10_000 });
        break;
      } catch (error) {
        if (surfaceAttempt === 1) throw error;
        response = await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      }
    }
  }
  await page.waitForTimeout(options.static ? 1_000 : 450);
  const state = await page.evaluate(({ expectedHeading, expectedTitle, staticSurface }) => {
    const root = document.documentElement;
    const controls = [...document.querySelectorAll("button, a, input, select, textarea, summary")];
    const visibleControls = controls.filter(control => {
      const rect = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    const unnamedControls = visibleControls.filter(control => {
      if (control.matches("input[type='hidden']")) return false;
      const text = control.textContent?.trim();
      const labels = "labels" in control ? control.labels?.length : 0;
      return !text && !labels && !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby") && !control.getAttribute("title") && !control.getAttribute("placeholder");
    });
    const outsideControls = visibleControls.filter(control => {
      const rect = control.getBoundingClientRect();
      return rect.left < -1 || rect.right > innerWidth + 1;
    });
    const brokenImages = [...document.images].filter(image => image.complete && image.naturalWidth === 0).map(image => image.currentSrc || image.src);
    const h1 = [...document.querySelectorAll("h1")].filter(item => item.getBoundingClientRect().width > 0);
    const bodyText = document.body.textContent?.trim() ?? "";
    return {
      title: document.title,
      bodyLength: bodyText.length,
      heading: h1[0]?.textContent?.trim() ?? "",
      h1Count: h1.length,
      mainCount: document.querySelectorAll("main").length,
      headingMatched: !expectedHeading || bodyText.includes(expectedHeading),
      titleMatched: !expectedTitle || document.title === expectedTitle,
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      unnamedControls: unnamedControls.length,
      outsideControls: outsideControls.length,
      brokenImages,
      frameworkOverlay: /Application error|Unhandled Runtime Error|Internal Server Error|Next\.js.*error/i.test(bodyText),
      staticSurfaceFound: staticSurface === "canvas" ? Boolean(document.querySelector("canvas")) : true,
      externalAccountSignup: Boolean(document.querySelector('a[href*="account.aeck.vn/signup"]')),
    };
  }, { expectedHeading: options.expectedHeading ?? "", expectedTitle: options.expectedTitle ?? "", staticSurface: options.staticSurface ?? "" });
  Object.assign(check, { status: response?.status() ?? null, ...state });
  report.push(check);
  activeCheck = null;
  const isPublic = options.kind === "public";
  const unexpectedStatus = check.status >= 400 && check.status !== options.allowedStatus;
  const missingContent = !state.bodyLength && options.staticSurface !== "canvas";
  const structuralFailure = unexpectedStatus || missingContent || state.frameworkOverlay || state.horizontalOverflow || state.unnamedControls || state.outsideControls || state.brokenImages.length || !state.headingMatched || !state.titleMatched || !state.staticSurfaceFound || state.externalAccountSignup;
  const semanticFailure = isPublic && (state.h1Count !== 1 || state.mainCount !== 1);
  if (structuralFailure || semanticFailure || check.runtimeIssues.length) throw new Error(`Public UI smoke failed: ${JSON.stringify(check)}`);
  if ((path === "/" || path === "/login?intent=register") && (width === 1440 || width === 390)) {
    const name = path === "/" ? "public-home" : "auth-signup";
    await page.screenshot({ path: join(outputDir, `${name}-${width}.png`), fullPage: true });
  }
}

async function inspectMobileMenu() {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await waitForPublicHydration();
  const trigger = page.getByRole("button", { name: "Mở menu" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Menu điều hướng" });
  await dialog.waitFor({ state: "visible" });
  const opened = await page.evaluate(() => ({
    focusInside: Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)),
    backgroundInert: [...document.querySelectorAll("main, footer")].every(element => element.inert),
    bodyLocked: document.body.style.overflow === "hidden",
  }));
  await page.keyboard.press("Escape");
  const restored = await page.evaluate(() => ({
    closed: !document.querySelector('[role="dialog"]'),
    focusRestored: document.activeElement?.getAttribute("aria-label") === "Mở menu",
  }));
  const result = { name: "public-mobile-menu", path: "/", width: 390, ...opened, ...restored };
  report.push(result);
  if (!opened.focusInside || !opened.backgroundInert || !opened.bodyLocked || !restored.closed || !restored.focusRestored) throw new Error(`Public mobile menu failed: ${JSON.stringify(result)}`);
}

async function inspectTeacherModal() {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await waitForPublicHydration();
  const trigger = page.getByRole("button", { name: /Xem thông tin/ }).first();
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /Thông tin/ });
  await dialog.waitFor({ state: "visible" });
  const focusInside = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)));
  await page.keyboard.press("Escape");
  const focusRestored = await page.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Xem thông tin") ?? false);
  const result = { name: "public-teacher-modal", path: "/", width: 1440, focusInside, focusRestored, closed: await dialog.count() === 0 };
  report.push(result);
  if (!result.focusInside || !result.focusRestored || !result.closed) throw new Error(`Teacher modal failed: ${JSON.stringify(result)}`);
}

async function inspectPackageModal() {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/goi-hoc-tap`, { waitUntil: "domcontentloaded" });
  await waitForPublicHydration();
  const trigger = page.getByRole("button", { name: "Chi tiết" }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /Chi tiết/ });
  await dialog.waitFor({ state: "visible" });
  const insideViewport = await dialog.evaluate(element => { const rect = element.getBoundingClientRect(); return rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1; });
  await page.keyboard.press("Escape");
  const result = { name: "public-package-modal", path: "/goi-hoc-tap", width: 390, insideViewport, focusRestored: await trigger.evaluate(element => element === document.activeElement) };
  report.push(result);
  if (!result.insideViewport || !result.focusRestored) throw new Error(`Package modal failed: ${JSON.stringify(result)}`);
}

async function inspectSignupValidation() {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${baseUrl}/login?intent=register`, { waitUntil: "domcontentloaded" });
    await waitForPublicHydration();
    await page.locator("#signup-name").fill("Nguyễn Văn An");
    await page.locator("#signup-email").fill("hocvien@example.com");
    await page.locator("#signup-password").fill("matkhau123");
    await page.locator("#signup-confirm-password").fill("matkhau456");
    await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
    const error = page.locator("#signup-confirm-password-error");
    await error.waitFor({ state: "visible" });
    const state = await page.evaluate(() => {
      const field = document.querySelector("#signup-confirm-password");
      const root = document.documentElement;
      return {
        fieldFocused: document.activeElement === field,
        invalid: field?.getAttribute("aria-invalid") === "true",
        describedBy: field?.getAttribute("aria-describedby") === "signup-confirm-password-error",
        message: document.querySelector("#signup-confirm-password-error")?.textContent?.trim() ?? "",
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      };
    });
    const result = { name: "auth-signup-validation", path: "/login?intent=register", width, ...state };
    report.push(result);
    if (!state.fieldFocused || !state.invalid || !state.describedBy || !state.message.includes("chưa trùng khớp") || state.horizontalOverflow) {
      throw new Error(`Signup validation failed: ${JSON.stringify(result)}`);
    }
  }
}

async function inspectPublicInteractions() {
  await inspectMobileMenu();
  await inspectTeacherModal();
  await inspectPackageModal();
  await inspectSignupValidation();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/luyen-thi-tsa`, { waitUntil: "domcontentloaded" });
  await waitForPublicHydration();
  const faq = page.locator("details").first();
  if (await faq.count()) {
    await faq.locator("summary").click();
    const open = await faq.getAttribute("open") !== null;
    report.push({ name: "public-faq-disclosure", path: "/luyen-thi-tsa", width: 1440, open });
    if (!open) throw new Error("Public FAQ disclosure did not open.");
  }
}

async function inspectRedirects() {
  for (const [source, expected] of redirectRoutes) {
    await page.goto(`${baseUrl}${source}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const current = new URL(page.url());
    const actual = `${current.pathname}${current.search}`;
    const result = { name: "compatibility-redirect", path: source, expected, actual };
    report.push(result);
    if (actual !== expected) throw new Error(`Compatibility redirect failed: ${JSON.stringify(result)}`);
  }
}

try {
  for (const path of publicRoutes) {
    for (const [index, width] of widths.entries()) await inspect(path, width, { kind: "public", navigate: index === 0 });
  }
  for (const [path, heading] of authRoutes) {
    for (const [index, width] of widths.entries()) await inspect(path, width, { kind: "auth", expectedHeading: heading, navigate: index === 0 });
  }
  for (const [path, title, expected] of standaloneRoutes) {
    for (const [index, width] of [1440, 390].entries()) await inspect(path, width, { static: true, navigate: index === 0, expectedHeading: expected === "canvas" ? "" : expected, staticSurface: expected, expectedTitle: title });
  }
  await inspect("/route-khong-ton-tai-aeck", 1440, { expectedHeading: "Bạn không nên ở đây.", allowedStatus: 404 });
  await inspect("/route-khong-ton-tai-aeck", 390, { expectedHeading: "Bạn không nên ở đây.", allowedStatus: 404, navigate: false });
  await inspectPublicInteractions();
  await inspectRedirects();
} finally {
  await writeFile(reportFile, JSON.stringify({ baseUrl, routes: publicRoutes.length, widths, checks: report.length, report }, null, 2), "utf8");
  await browser.close();
}

console.log(JSON.stringify({ baseUrl, routes: publicRoutes.length, widths, checks: report.length, reportFile }));
