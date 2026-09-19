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

test("dashboard distinguishes an unavailable history from a valid empty history and retries", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  state.historyStatus = 503;
  state.roomsPayload = {
    rooms: [{ id: "flow-room", title: "Phòng luyện thử nghiệm" }],
    exams: [],
  };
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("alert")).toContainText("Một phần dữ liệu tổng quan chưa tải được.");
  await expect(page.getByText("Chưa tải được lịch sử làm bài. Hãy thử lại.", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Chưa có bài thi nào được thực hiện.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Phòng luyện thử nghiệm", exact: true })).toBeVisible();
  expect(state.apiRequests.filter(request => /\/api\/(?:student-dashboard|dashboard\/user-info|courses)/.test(request))).toEqual([]);
  expect(state.apiRequests.filter(request => request === "GET /api/exams?scope=history")).toHaveLength(1);
  expect(state.apiRequests.filter(request => request === "GET /api/exams?scope=rooms")).toHaveLength(1);

  state.historyStatus = 200;
  state.historyPayload = {
    attempts: [{
      id: "flow-attempt",
      exam_id: "flow-exam",
      title: "Bài thi đã công bố",
      score: 12,
      correct_answers: 12,
      total_questions: 15,
      submitted_at: "2026-09-16T08:00:00.000Z",
      status: "completed",
    }],
  };
  await page.getByRole("button", { name: "Thử tải lại", exact: true }).click();
  await expect(page.getByRole("link", { name: "Bài thi đã công bố", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Chưa tải được lịch sử làm bài. Hãy thử lại.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("course navigation, reload and continue link retain lesson identity", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.locator(`.alpha-dashboard-resource-grid a[href='/courses/${course.id}']`).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${course.id}$`));
  await expect(page.getByRole("link", { name: "Quay lại khóa học", exact: true })).toBeVisible();
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

test("course list mode uses horizontal cards on desktop and stacks at 320px", async ({ context, page, baseURL }) => {
  await installStudentFixture(context, baseURL!);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/courses?view=list", { waitUntil: "domcontentloaded" });

  const list = page.locator(".reference-course-grid.course-list-view");
  const card = list.locator(":scope > .ant-card").first();
  const action = card.locator(":scope > .course-card-action");
  await expect(action).toBeVisible();
  const desktop = await action.evaluate(element => {
    const style = getComputedStyle(element);
    const cover = element.querySelector(":scope > .ant-card-cover")?.getBoundingClientRect();
    const body = element.querySelector(":scope > .ant-card-body")?.getBoundingClientRect();
    return {
      display: style.display,
      columns: style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
      coverRight: cover?.right ?? null,
      bodyLeft: body?.left ?? null,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(desktop.display).toBe("grid");
  expect(desktop.columns).toBe(2);
  expect(desktop.coverRight).not.toBeNull();
  expect(desktop.bodyLeft).not.toBeNull();
  expect(desktop.bodyLeft!).toBeGreaterThanOrEqual(desktop.coverRight! - 1);
  expect(desktop.horizontalOverflow).toBeLessThanOrEqual(1);

  await page.goto("/courses?view=grid", { waitUntil: "domcontentloaded" });
  const gridAction = page.locator(".reference-course-grid.course-grid-view > .ant-card > .course-card-action").first();
  await expect(gridAction).toBeVisible();
  await expect.poll(() => gridAction.evaluate(element => getComputedStyle(element).display)).toBe("flex");

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/courses?view=list", { waitUntil: "domcontentloaded" });
  const mobileAction = page.locator(".reference-course-grid.course-list-view > .ant-card > .course-card-action").first();
  await expect(mobileAction).toBeVisible();
  const mobile = await mobileAction.evaluate(element => {
    const style = getComputedStyle(element);
    const cover = element.querySelector(":scope > .ant-card-cover")?.getBoundingClientRect();
    const body = element.querySelector(":scope > .ant-card-body")?.getBoundingClientRect();
    return {
      display: style.display,
      columns: style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
      coverBottom: cover?.bottom ?? null,
      bodyTop: body?.top ?? null,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(mobile.display).toBe("grid");
  expect(mobile.columns).toBe(1);
  expect(mobile.coverBottom).not.toBeNull();
  expect(mobile.bodyTop).not.toBeNull();
  expect(mobile.bodyTop!).toBeGreaterThanOrEqual(mobile.coverBottom! - 1);
  expect(mobile.horizontalOverflow).toBeLessThanOrEqual(1);
});

test("course detail H1 remains readable for long localized and unbroken titles at 320px", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  const longTitle = `Khóa học Toán nâng cao với tiêu đề tiếng Việt rất dài ${"ChuoiKhongNgat".repeat(18)}`;
  state.courseEnrollmentPayload = [{
    course_id: course.id,
    courses: { ...course, title: longTitle },
  }];
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/courses/${course.id}`, { waitUntil: "domcontentloaded" });

  const title = page.getByRole("heading", { level: 1, name: longTitle, exact: true });
  await expect(title).toHaveCount(1);
  await expect(title).toBeVisible();
  await expect(title).toHaveClass(/course-detail-title/);
  await expect(page.locator("summary").first()).toBeVisible();

  const metrics = await title.evaluate(element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      text: element.textContent,
      whiteSpace: style.whiteSpace,
      overflowWrap: style.overflowWrap,
      textOverflow: style.textOverflow,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      top: box.top,
      bottom: box.bottom,
      viewportHeight: window.innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(metrics.text).toBe(longTitle);
  expect(metrics.whiteSpace).toBe("normal");
  expect(metrics.overflowWrap).toBe("anywhere");
  expect(metrics.textOverflow).not.toBe("ellipsis");
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
  expect(metrics.bottom).toBeGreaterThan(metrics.top);
  expect(metrics.top).toBeLessThan(metrics.viewportHeight);
  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
});

test("course search remains available and reflows at mobile widths", async ({ context, page, baseURL }) => {
  await installStudentFixture(context, baseURL!);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/courses", { waitUntil: "domcontentloaded" });

  const search = page.getByRole("searchbox", { name: "Tìm kiếm khóa học" });
  await expect(search).toBeVisible();
  await search.fill("Toán");
  await expect(page).toHaveURL(/(?:\?|&)q=/);
  await expect(page.getByRole("link", { name: `Vào học ${course.title}`, exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await search.fill("ChuỗiKhôngNgắtDài".repeat(16));
  await expect(page.locator("#course-search-status")).toHaveText("0 kết quả phù hợp");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("course bootstrap failure is not presented as an empty catalogue and retry recovers", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  // Supabase-js retries server errors in the browser client. A client error
  // keeps this focused on the catalogue's error-vs-empty state contract.
  state.courseEnrollmentStatus = 400;
  await page.goto("/courses", { waitUntil: "domcontentloaded" });

  const courseLoadIssue = page.getByRole("alert").filter({ hasText: "Không thể tải danh sách khóa học. Hãy kiểm tra kết nối rồi thử lại." });
  await expect(courseLoadIssue).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chưa tải được khóa học", exact: true })).toBeVisible();
  await expect(page.getByText("Khóa học sẽ xuất hiện sau khi quản trị viên phân cho tài khoản của bạn.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Chưa có khóa học", exact: true })).toHaveCount(0);

  state.courseEnrollmentStatus = 200;
  await page.getByRole("button", { name: "Tải lại khóa học", exact: true }).click();
  await expect(page.getByRole("link", { name: `Vào học ${course.title}`, exact: true })).toBeVisible();
  await expect(courseLoadIssue).toHaveCount(0);
});

test("direct course detail distinguishes catalogue failure from a missing course", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  state.courseEnrollmentStatus = 400;
  await page.goto(`/courses/${course.id}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("alert").filter({ hasText: "Không thể tải danh sách khóa học. Hãy kiểm tra kết nối rồi thử lại." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Không tìm thấy khóa học", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tải lại khóa học", exact: true })).toBeVisible();
});

test("profile distinguishes unavailable history from an empty year and retries canonical history", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  const currentYear = new Date().getFullYear();
  state.historyStatus = 503;
  await page.goto("/profile", { waitUntil: "domcontentloaded" });

  const historyIssue = page.getByRole("alert").filter({ hasText: "Chưa tải được lịch sử làm bài. Hãy thử lại." });
  await expect(historyIssue).toBeVisible();
  await expect(page.getByText(`Chưa có bài thi trong năm ${currentYear}`, { exact: true })).toHaveCount(0);
  expect(state.apiRequests.filter(request => /\/api\/(?:student-dashboard|dashboard\/user-info|courses)/.test(request))).toEqual([]);
  expect(state.apiRequests.filter(request => request === "GET /api/exams?scope=history")).toHaveLength(1);

  state.historyStatus = 200;
  state.historyPayload = {
    attempts: [{
      id: "profile-flow-attempt",
      exam_id: "profile-flow-exam",
      title: "Bài thi hồ sơ thử nghiệm",
      score: 15,
      correct_answers: 15,
      total_questions: 20,
      submitted_at: `${currentYear}-09-16T08:00:00.000Z`,
      status: "completed",
    }],
  };
  await page.getByRole("button", { name: "Tải lại thống kê", exact: true }).click();
  await expect(page.getByText("1 bài thi · Điểm trung bình 15", { exact: true })).toBeVisible();
  await expect(page.getByLabel(`Điểm trung bình năm ${currentYear}: 15`)).toBeVisible();
  await expect(historyIssue).toHaveCount(0);
  expect(state.apiRequests.filter(request => request === "GET /api/exams?scope=history")).toHaveLength(2);
  expect(state.apiRequests.filter(request => /\/api\/(?:student-dashboard|dashboard\/user-info|courses)/.test(request))).toEqual([]);
});

test("profile skip link moves keyboard focus to the main content without mobile overflow", async ({ context, page, baseURL }) => {
  await installStudentFixture(context, baseURL!);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/profile", { waitUntil: "domcontentloaded" });

  const skipLink = page.getByRole("link", { name: "Bỏ qua đến nội dung chính", exact: true });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#profile-main")).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
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
  const selectedHeading = page.getByRole("heading", { level: 1, name: resources[1].title, exact: true });
  await expect(selectedHeading).toHaveCount(1);
  await expect(selectedHeading).toBeVisible();
  expect(await selectedHeading.evaluate(element => getComputedStyle(element).display)).not.toBe("none");
  await page.reload({ waitUntil: "domcontentloaded" });
  // The selected-resource context heading is the semantic H1 on both desktop
  // and narrow study layouts; the viewer region/status identifies the media.
  await expect(page.getByRole("heading", { level: 1, name: resources[1].title, exact: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1, name: resources[1].title, exact: true })).toBeVisible();
  expect(await page.getByRole("heading", { level: 1, name: resources[1].title, exact: true }).evaluate(element => getComputedStyle(element).display)).not.toBe("none");
  await expect(page.getByRole("region", { name: `Nội dung: ${resources[1].title}` })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: `Đang mở: ${resources[1].title}` })).toBeVisible();
  const second = await context.newPage();
  await second.goto(page.url(), { waitUntil: "domcontentloaded" });
  await expect(second).toHaveURL(new RegExp(`resource=${resources[1].id}$`));
  await expect(second.getByRole("heading", { level: 1, name: resources[1].title, exact: true })).toHaveCount(1);
  await expect(second.getByRole("heading", { level: 1, name: resources[1].title, exact: true })).toBeVisible();
  expect(await second.getByRole("heading", { level: 1, name: resources[1].title, exact: true }).evaluate(element => getComputedStyle(element).display)).not.toBe("none");
  await expect(second.getByRole("region", { name: `Nội dung: ${resources[1].title}` })).toBeVisible();
  await expect(second.getByRole("status").filter({ hasText: `Đang mở: ${resources[1].title}` })).toBeVisible();
  await second.close();
});

test("missing resource query falls back to the visible picker without selecting another item", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  state.resources = resources;
  await page.goto(`/lessons/${lesson.id}?resource=missing`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: `Bài 1: ${lesson.title}`, exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: new RegExp(`${resources[0].title}.*Tài liệu PDF`) })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Đang mở:" })).toHaveCount(0);
  await expect(page).toHaveURL(/resource=missing$/);
});

test("empty lesson resources use truthful picker copy instead of asking the learner to choose", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  state.resources = [];
  await page.goto(`/lessons/${lesson.id}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: `Bài 1: ${lesson.title}`, exact: true })).toHaveCount(1);
  await expect(page.getByText("Bài học này chưa có bài giảng hoặc tài liệu.", { exact: true })).toBeVisible();
  await expect(page.getByText("Chưa có nội dung để bắt đầu.", { exact: true })).toBeVisible();
  await expect(page.getByText("Vui lòng chọn một mục bên dưới để bắt đầu học.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Tài liệu PDF|Video bài giảng/ })).toHaveCount(0);
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
  await expect(page.getByRole("heading", { level: 2, name: "Không thể tải nội dung bài học", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Không tìm thấy bài học", exact: true })).toHaveCount(0);
  await expect(page.getByText(state.resourceError, { exact: true })).toBeVisible();
  await expect(page.getByText("Chưa tải được nội dung giáo trình.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(resources[0].title) })).toHaveCount(0);
  state.resourceStatus = 200;
  await page.getByRole("button", { name: "Thử tải lại", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(`${resources[0].title}.*Tài liệu PDF`) })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: `Bài 1: ${lesson.title}`, exact: true })).toHaveCount(1);
});

test("lesson resource network failure keeps the lesson identity and retries independently", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  state.resources = resources;
  state.resourceNetworkFailure = true;
  await page.goto(`/lessons/${lesson.id}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: `Bài 1: ${lesson.title}`, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Không thể tải nội dung bài học", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Không tìm thấy bài học", exact: true })).toHaveCount(0);
  await expect(page.getByText("Không thể kết nối để tải nội dung bài học. Hãy kiểm tra kết nối rồi thử lại.", { exact: true })).toBeVisible();
  await expect(page.getByText("Chưa tải được nội dung giáo trình.", { exact: true })).toBeVisible();

  state.resourceNetworkFailure = false;
  await page.getByRole("button", { name: "Thử tải lại", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(`${resources[0].title}.*Tài liệu PDF`) })).toBeVisible();
});

test("missing lesson shows recovery and missing resource content supports retry", async ({ context, page, baseURL }) => {
  const state = await installStudentFixture(context, baseURL!);
  state.lessonStatus = 404;
  await page.goto(`/lessons/${lesson.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Không tìm thấy bài học", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Không thể tải nội dung bài học", exact: true })).toHaveCount(0);
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
    try { await fetch("https://api.mathremix.pro.vn/api/learning/continue"); return false; }
    catch { return true; }
  });
  expect(blocked).toBe(true);
  expect(state.blockedRequests).toContain("https://api.mathremix.pro.vn/api/learning/continue");
  expect(state.externalResponses).toEqual([]);
});
