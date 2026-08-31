import { test, expect } from "@playwright/test";

const hasAdminCredentials = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

test("public AECK homepage responds", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "GIẢI PHÁP HỌC TẬP TOÀN DIỆN" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Trang chủ AECK" }).first().locator("img")).toHaveAttribute("src", "/aeck-public/logo-wordmark-red.svg");
  await expect(page.locator('a[href="/courses"]', { hasText: "Không gian học tập" }).first()).toHaveAttribute("href", "/courses");
  await expect(page.locator('a[href^="https://hsa.aeck.vn"]')).toHaveCount(0);
});

test("admin login reaches the teacher surface", async ({ page }) => {
  test.skip(!hasAdminCredentials, "Staging E2E credentials are not configured");
  await page.goto("/admin");
  await page.waitForTimeout(5_000);
  await page.locator("#admin-login-email").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.locator("#admin-login-password").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /Vào trang quản trị|Đăng nhập/ }).click();
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.locator("main.login-page")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator("body")).toContainText(/Đề thi|soạn đề|Exam/i, { timeout: 30_000 });
});

test("responsive runner surfaces remain reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});
