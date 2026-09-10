import { defineConfig, devices } from "@playwright/test";

const htmlReportDirectory = process.env.PW_REPORT_ROOT ?? "playwright-report";
const jsonReportFile = process.env.PW_JSON_OUTPUT ?? "test-results/results.json";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["html", { open: "never", outputFolder: htmlReportDirectory }], ["json", { outputFile: jsonReportFile }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: process.env.CI ? "on-first-retry" : "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "mobile-390", use: { ...devices["iPhone 12"], viewport: { width: 390, height: 844 } } },
    { name: "mobile-360", use: { ...devices["iPhone 12"], viewport: { width: 360, height: 800 } } },
    { name: "mobile-320", use: { ...devices["iPhone 12"], viewport: { width: 320, height: 800 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
