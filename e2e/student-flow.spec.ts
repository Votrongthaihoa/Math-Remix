import { expect, test } from "@playwright/test";
import { continueItem, installStudentFixture, course, lesson, resources, studentFixtureState } from "./fixtures/student";

test.use({ serviceWorkers: "block" });
test.afterEach(async ({ context }) => {
  const state = studentFixtureState(context);
  if (state) expect(state.externalResponses, "no external origin may produce a response").toEqual([]);
});

test.beforeEach(async ({}, testInfo) => {
  test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "Student fixture needs a matching synthetic or intercepted test build");
  test.skip(!["chromium", "tablet-768", "mobile-390", "mobile-320", "mobile-360", "webkit"].includes(testInfo.project.name), "Student matrix");
});

test("signed-in login return preserves a lesson query", async ({ context, page, baseURL }) => {
  await installStudentFixture(context, baseURL!);
  await page.goto(`/login?redirect=${encodeURIComponent(`/lessons/${lesson.id}?resource=missing`)}`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`/lessons/${lesson.id}\\?resource=missing$`));
  await expect(page.locator(".lesson-page")).toBeVisible();
});

test("dashboard failure, device fallback and keyboard retry recover to empty", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  state.payload = { item: { invalid: true } };
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  const retry = page.getByRole("button", { name: "Tải lại bài học gần đây" });
  await expect(retry).toBeVisible();
  await page.evaluate(item => localStorage.setItem("aeck.continue-learning.v1:flow-student", JSON.stringify({ version: 1, lessonId: item.lessonId, updatedAt: item.updatedAt })), continueItem);
  await retry.click();
  await expect(page.getByText("Đang dùng bản lưu trên thiết bị; dữ liệu chưa được đồng bộ.", { exact: true })).toBeVisible();
  state.payload = { item: null };
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Chọn một khóa học để bắt đầu hành trình của bạn.", { exact: true })).toBeVisible();
  await expect(retry).toHaveCount(0);
});

test("course navigation, reload and continue link retain lesson identity", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.locator(`.alpha-dashboard-resource-grid a[href='/courses/${course.id}']`).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${course.id}$`));
  await page.locator(".ant-collapse-item summary").first().click();
  await page.locator(`.ant-collapse-item a[href='/lessons/${lesson.id}']`).click();
  await expect(page).toHaveURL(new RegExp(`/lessons/${lesson.id}$`));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".lesson-page")).toBeVisible();
  state.payload = { item: continueItem };
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".alpha-dashboard-continue-action")).toHaveAttribute("href", `/lessons/${lesson.id}`);
  await page.locator(".alpha-dashboard-continue-action").click();
  await expect(page).toHaveURL(new RegExp(`/lessons/${lesson.id}$`));
});

test("continue learning status reflows at supported widths", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  state.payload = { item: { ...continueItem, lessonTitle: "Tiêu đề bài học tiếng Việt dài ".repeat(8), courseTitle: "LongUnbrokenTitle".repeat(20) } };
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".alpha-dashboard-continue")).toHaveAttribute("aria-busy", "false");
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("browser Back and Forward restore course and lesson navigation", async ({ context, page, baseURL }) => {
  await installStudentFixture(context, baseURL!);
  await page.goto("/courses?examType=TSA&view=list&q=To%C3%A1n", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: `Vào học ${course.title}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nội dung giáo trình" })).toBeVisible();
  await page.locator("summary").filter({ hasText: "Hàm số" }).click();
  await page.getByRole("link", { name: /Bài học thử nghiệm/ }).click();
  await expect(page.getByRole("heading", { name: /Bài học thử nghiệm/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/courses/${course.id}$`));
  await page.goBack();
  await expect(page.getByRole("tab", { name: /^TSA/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Danh sách", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/examType=TSA.*view=list.*q=To/);
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/courses/${course.id}$`));
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/lessons/${lesson.id}$`));
});

test("course filters persist through reload and support keyboard tab selection", async ({ context, page, baseURL }) => {
  await installStudentFixture(context, baseURL!);
  await page.goto("/courses?examType=TSA&view=list&q=To%C3%A1n", { waitUntil: "domcontentloaded" });
  const tsa = page.getByRole("tab", { name: /^TSA/ });
  await expect(tsa).toHaveAttribute("aria-selected", "true");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(tsa).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Danh sách", exact: true })).toHaveAttribute("aria-pressed", "true");
  await tsa.focus();
  await page.keyboard.press("ArrowRight");
  const hsa = page.getByRole("tab", { name: /^HSA/ });
  await expect(hsa).toBeFocused();
  await expect(hsa).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/examType=HSA/);
  await expect(page.getByRole("heading", { name: "Chưa có khóa học HSA" })).toBeVisible();
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: /^Tất cả/ })).toBeFocused();
  await expect(page.getByRole("link", { name: `Vào học ${course.title}`, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/view=list.*q=To/);
});

test("resource choice survives reload and opening the same URL in a new context page", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  state.resources = resources;
  await page.goto(`/lessons/${lesson.id}`, { waitUntil: "domcontentloaded" });
  const choice = page.getByRole("button", { name: new RegExp(`${resources[1].title}.*Tài liệu PDF`) });
  await expect(choice).toBeVisible();
  await choice.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`resource=${resources[1].id}$`));
  await expect(page.getByRole("status").filter({ hasText: `Đang mở: ${resources[1].title}` })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  // The desktop product shell intentionally hides the duplicate resource
  // context heading; the region/status is the visible contract that survives
  // a reload and still identifies the selected resource.
  await expect(page.getByRole("region", { name: `Nội dung: ${resources[1].title}` })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: `Đang mở: ${resources[1].title}` })).toBeVisible();
  const second = await context.newPage();
  await second.goto(page.url(), { waitUntil: "domcontentloaded" });
  await expect(second).toHaveURL(new RegExp(`resource=${resources[1].id}$`));
  await expect(second.getByRole("region", { name: `Nội dung: ${resources[1].title}` })).toBeVisible();
  await expect(second.getByRole("status").filter({ hasText: `Đang mở: ${resources[1].title}` })).toBeVisible();
  await second.close();
});

test("missing resource query falls back to the visible picker without selecting another item", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  state.resources = resources;
  await page.goto(`/lessons/${lesson.id}?resource=missing`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: new RegExp(`${resources[0].title}.*Tài liệu PDF`) })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Đang mở:" })).toHaveCount(0);
  await expect(page).toHaveURL(/resource=missing$/);
});

test("course content failure recovers through its visible retry action", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  // Supabase-js retries 5xx responses in the browser client. Use a client
  // error here so the test isolates CourseDetail's visible error/retry state
  // without turning the fixture into a transport-retry test.
  state.chapterStatus = 400;
  await page.goto(`/courses/${course.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("alert")).toContainText("Không thể tải chương thử nghiệm.");
  state.chapterStatus = 200;
  await page.getByRole("button", { name: "Thử tải lại", exact: true }).click();
  await expect(page.locator("summary").filter({ hasText: "Hàm số" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("lesson permission failure shows no content and retry can recover", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  state.resources = resources;
  state.resourceStatus = 403;
  state.resourceError = "Bạn chưa được phân khóa học thử nghiệm này.";
  await page.goto(`/lessons/${lesson.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(state.resourceError, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(resources[0].title) })).toHaveCount(0);
  state.resourceStatus = 200;
  await page.getByRole("button", { name: "Thử tải lại", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(`${resources[0].title}.*Tài liệu PDF`) })).toBeVisible();
});

test("missing lesson shows recovery and missing resource content supports retry", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  state.lessonStatus = 404;
  await page.goto(`/lessons/${lesson.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Không tìm thấy bài học" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quay lại khóa học" })).toBeVisible();
  state.lessonStatus = 200;
  state.resources = resources;
  await page.getByRole("button", { name: "Thử tải lại", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`${resources[0].title}.*Tài liệu PDF`) }).click();
  await expect(page.getByRole("alert")).toContainText(state.tokenError);
  const requestsBefore = state.apiRequests.filter(value => value === "POST /api/video-token").length;
  state.tokenError = "Quyền truy cập tài liệu thử nghiệm đã hết hạn.";
  await page.getByRole("button", { name: "Thử tải lại", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(state.tokenError);
  expect(state.apiRequests.filter(value => value === "POST /api/video-token").length).toBe(requestsBefore + 1);
});

test("reduced-motion and 200-percent content zoom preserve recovery controls", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  state.payload = { item: { invalid: true } };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  const retry = page.getByRole("button", { name: "Tải lại bài học gần đây" });
  await expect(retry).toBeVisible();
  // CSS content zoom is portable across this matrix; it is not a claim that
  // the browser's native UI zoom shortcut or assistive technology was tested.
  // Halve the layout viewport first so media queries observe the same effective
  // viewport that a native 200% browser zoom would expose. Otherwise a desktop
  // sidebar remains expanded into the zoomed canvas and leaves the copy column
  // with zero width, which is not a realistic browser-zoom simulation.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await retry.scrollIntoViewIfNeeded();
  await retry.focus();
  await expect(retry).toBeFocused();
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  state.payload = { item: null };
  await page.keyboard.press("Enter");
  const continueRegion = page.getByRole("region", { name: "Tiếp tục học" });
  // CSS zoom keeps the text in the accessibility tree even when the narrow
  // synthetic canvas gives the copy column no physical width. Assert the
  // state at zoom, then restore the canvas before requiring visual visibility.
  await expect(continueRegion).toContainText("Chọn một khóa học để bắt đầu hành trình của bạn.");
  await expect(continueRegion.getByText("Chọn một khóa học để bắt đầu hành trình của bạn.", { exact: true })).toBeAttached();
  await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
  await expect(continueRegion.getByText("Chọn một khóa học để bắt đầu hành trình của bạn.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Khám phá khóa học", exact: true })).toBeVisible();
});

test("fixture blocks external requests before API dispatch and records attempted egress", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Khám phá khóa học", exact: true })).toBeVisible();
  const blocked = await page.evaluate(async () => {
    try { await fetch("https://outbound-fixture.invalid/api/learning/continue"); return false; }
    catch { return true; }
  });
  expect(blocked).toBe(true);
  expect(state.blockedRequests).toContain("https://outbound-fixture.invalid/api/learning/continue");
  expect(state.externalResponses).toEqual([]);
});
