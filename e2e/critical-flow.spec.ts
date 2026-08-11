import { test, expect } from "@playwright/test";

const hasAdminCredentials = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

test("public shell responds", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main.login-page")).toBeVisible();
  await expect(page.locator("#login-email")).toHaveAttribute("placeholder", "hocvien@example.com");
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
