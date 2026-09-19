import { test, expect } from "./fixtures/public-boundary";

test.use({ serviceWorkers: "block" });

test("public AECK homepage responds", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "GIẢI PHÁP HỌC TẬP TOÀN DIỆN" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Trang chủ AECK" }).first().locator("img")).toHaveAttribute("src", "/aeck-public/logo-wordmark-red.svg");
  await expect(page.locator('a[href="/courses"]', { hasText: "Không gian học tập" }).first()).toHaveAttribute("href", "/courses");
  await expect(page.locator('a[href^="https://hsa.aeck.vn"]')).toHaveCount(0);
});

test("anonymous admin login is labeled, keyboard usable, and refuses submission without anti-spam verification", async ({ page, boundary }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Đăng nhập quản trị" })).toBeVisible();
  const email = page.getByRole("textbox", { name: "Email" });
  // The required marker is intentionally aria-hidden but remains part of the
  // label's accessible name in some browser/React combinations. Role/name is
  // stable across Chromium, WebKit and the synthetic admin fixture.
  const password = page.getByRole("textbox", { name: "Mật khẩu" });
  await expect(email).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  await email.fill("anonymous@example.test");
  await email.press("Tab");
  await expect(password).toBeFocused();
  await password.fill("synthetic-not-a-real-password");
  await password.press("Tab");
  const reveal = page.getByRole("button", { name: "Hiện mật khẩu", exact: true });
  await expect(reveal).toBeFocused();
  await page.keyboard.press("Space");
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Ẩn mật khẩu", exact: true })).toHaveAttribute("aria-pressed", "true");
  await password.press("Enter");
  const antiSpamAlerts = page.getByRole("alert").filter({ hasText: /Vui lòng hoàn tất xác minh chống spam trước khi đăng nhập\.|Xác minh chống spam chưa được cấu hình\./ });
  await expect(antiSpamAlerts.first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng nhập", exact: true })).toBeEnabled();
  await expect(page.locator(".admin-app")).toHaveCount(0);
  expect(boundary.synthetic.filter(item => item.pathname === "/auth/v1/token")).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("public homepage reflows without horizontal overflow", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "GIẢI PHÁP HỌC TẬP TOÀN DIỆN" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  )).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("synthetic restored student cannot enter the admin surface or issue admin requests", async ({ page, boundary }) => {
  await boundary.restoreStudent();
  await page.goto("/admin");
  await expect.poll(() => boundary.synthetic.some(item => item.pathname === "/auth/v1/user")).toBe(true);
  await expect.poll(() => boundary.synthetic.some(item => item.pathname === "/rest/v1/profiles")).toBe(true);
  await expect(page.getByRole("heading", { name: "Đăng nhập quản trị" })).toBeVisible();
  await expect(page.locator(".admin-app")).toHaveCount(0);
  await expect(page.locator(".exam-shell")).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin$/);
});

test("public teacher dialog opens with keyboard and restores focus on Escape", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Xem thông tin Thầy Vũ Gia Khoa", exact: true });
  await expect(trigger).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Thông tin Thầy Vũ Gia Khoa", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("button", { name: "Đóng", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("public mobile menu traps keyboard focus and restores its trigger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Mở menu", exact: true });
  await expect(trigger).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Menu điều hướng", exact: true });
  const close = dialog.getByRole("button", { name: "Đóng menu", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link", { name: "Đăng ký", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator("main")).not.toHaveAttribute("inert", "");
});

test("outbound-network guard aborts and records a forbidden synthetic request", async ({ page, boundary }) => {
  // Keep the self-test on a connect-src origin so the browser reaches the
  // Playwright boundary handler; the handler still aborts it before any
  // backend can observe the request.
  const target = "https://api.mathremix.pro.vn/never-send";
  boundary.expectedBlocked.push(target);
  await page.goto("/");
  const outcome = await page.evaluate(async url => {
    try { await fetch(url); return "unexpected-success"; } catch { return "blocked"; }
  }, target);
  expect(outcome).toBe("blocked");
  expect(boundary.blocked).toEqual([{ method: "GET", origin: "https://api.mathremix.pro.vn", pathname: "/never-send", kind: "fetch" }]);
});
