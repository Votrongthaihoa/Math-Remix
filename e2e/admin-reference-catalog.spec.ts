import { expect, test, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";

const courses = Array.from({ length: 24 }, (_, index) => ({
  id: `catalog-${index + 1}`,
  title: index === 0 ? "Toán tư duy – khóa học nền tảng" : index === 1 ? "LongEnglishCourseTitle".repeat(8) : index === 2 ? "=HYPERLINK(1)" : `Khóa học ${String(index + 1).padStart(2, "0")}`,
  description: index === 0 ? "Mô tả tiếng Việt dài cho khóa học, cần đọc đầy đủ mà không bị cắt mất nội dung. ".repeat(6) : "Nội dung học tập",
  cover_url: null,
  cover_color: "#cd1627",
  published: index % 2 === 0,
  sort_order: index,
  created_at: `2026-09-${String(index + 1).padStart(2, "0")}T08:00:00Z`,
}));

const rosterStudents = Array.from({ length: 25 }, (_, index) => ({
  id: `roster-${index + 1}`, full_name: index === 0 ? "Nguyễn Đặng Ánh" : index === 1 ? "VeryLongStudentName".repeat(6) : `Học viên ${index + 1}`,
  student_code: `REMIX${String(index + 1).padStart(6, "0")}`, email: index === 1 ? `${"long".repeat(20)}@example.test` : `student${index + 1}@example.test`,
  status: index % 2 ? "locked" : "active", role: "student", created_at: `2026-09-${String(index + 1).padStart(2, "0")}T08:00:00Z`,
}));
const mediaImages = Array.from({ length: 15 }, (_, index) => ({
  assetName: index === 0 ? "Ảnh bài giảng toán.png" : index === 1 ? `${"LongImageFileName".repeat(8)}.png` : `image-${index + 1}.png`,
  url: `/fixture-media/${index + 1}.svg`, used: index % 2 === 0, size: (index + 1) * 1024, lastModified: `2026-09-${String(index + 1).padStart(2, "0")}T08:00:00Z`,
}));

const auditRecords = [{
  id: "account:audit-reference-1", source: "account", action: "unban", status: "recorded",
  admin_id: "admin-reference-full-identifier-1234567890", admin_name: "Quản trị kiểm thử",
  target_id: "student-reference-full-identifier-0987654321", target_name: "Nguyễn Đặng Ánh", target_code: "REMIX000001",
  context: "Bảo mật tài khoản", reason: "Đã kiểm tra và xác minh yêu cầu mở khóa tài khoản.\nNội dung nhiều dòng cần được giữ nguyên.",
  created_at: "2026-10-08T01:00:00Z", completed_at: "2026-10-08T02:00:00Z" as string | null,
}, {
  id: "exam:audit-reference-2", source: "exam", action: "publish_exam", status: "started",
  admin_id: null as string | null, admin_name: "", target_id: null as string | null, target_name: "", target_code: "",
  context: "", reason: "", created_at: "2026-10-08T01:00:00Z", completed_at: null as string | null,
}];

async function installCatalogFixture(context: BrowserContext, baseURL: string, permissions?: string[]) {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const origin = new URL(baseURL).origin;
  const authOrigin = new URL(configured).origin;
  if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname) || !/\.(test|invalid)$/.test(new URL(authOrigin).hostname)) throw new Error("Catalogue fixture requires loopback and synthetic auth");
  const user = { id: "catalog-admin", email: "admin@example.test", aud: "authenticated", role: "authenticated", app_metadata: { role: "admin", is_super_admin: !permissions, admin_permissions: permissions ?? [] }, user_metadata: {} };
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: expiresAt, role: "authenticated", app_metadata: user.app_metadata })}.${encode("fixture-signature")}`;
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: `sb-${new URL(authOrigin).hostname.split(".")[0]}-auth-token`,
    session: { access_token: token, refresh_token: "synthetic", expires_at: expiresAt, expires_in: 3600, token_type: "bearer", user },
  });
  const state = { courses: [...courses], fail: false, delay: 0, courseReads: 0, unexpected: [] as string[], students: [...rosterStudents], rosterError: false, mediaError: false, mediaDelay: 0, images: [...mediaImages], mutations: [] as { method: string; body: unknown }[], auditRecords: auditRecords.map(item => ({ ...item })), auditError: false, auditDelay: 0, auditReads: 0 };
  await context.routeWebSocket("**/*", socket => {
    if (["localhost", "127.0.0.1"].includes(new URL(socket.url()).hostname)) socket.connectToServer();
    else socket.close();
  });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (![origin, authOrigin].includes(url.origin)) {
      state.unexpected.push(`${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (url.origin === authOrigin) {
      if (url.pathname === "/auth/v1/user") return json(user);
      const table = url.pathname.replace("/rest/v1/", "");
      if (table === "profiles") return url.searchParams.has("id") ? json({ id: user.id, email: user.email, full_name: "Quản trị kiểm thử", student_code: "TEST001", role: "admin", status: "active", account_status: "active", banned_until: null, created_at: "2026-09-01T00:00:00Z" }) : state.rosterError ? json({ message: "Không tải được hồ sơ thử nghiệm" }, 503) : json(state.students);
      if (table === "course_enrollments") return json([{ student_id: "roster-1", course_id: "catalog-1" }]);
      if (table === "courses") {
        state.courseReads += 1;
        if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
        return state.fail ? json({ message: "Không tải được danh sách thử nghiệm", code: "SYNTHETIC" }, 503) : json(state.courses);
      }
      if (table === "lessons") return json([{ id: "catalog-lesson", title: "Bài một", published: true, chapters: { course_id: courses[0].id } }]);
      if (table === "chapters") return json([]);
      if (url.pathname.startsWith("/rest/")) return json([]);
      return json({ error: "Synthetic auth endpoint unavailable" }, 401);
    }
    if (url.pathname === "/api/security/session") return json({ allowed: true, exempt: true });
    if (url.pathname === "/api/admin/audit") {
      state.auditReads += 1;
      if (state.auditDelay) await new Promise(resolve => setTimeout(resolve, state.auditDelay));
      if (state.auditError) return json({ error: "Nhật ký thử nghiệm chưa sẵn sàng" }, 503);
      return json({ items: state.auditRecords, summary: { total: state.auditRecords.length, account: 1, exam: 1, failed: 0, pending: 1 }, total: state.auditRecords.length, limit: 20, page: 1, hasNextPage: false });
    }
    if (url.pathname === "/api/admin/users") {
      if (route.request().method() !== "GET") { state.mutations.push({ method: route.request().method(), body: route.request().postDataJSON() }); return json({ success: true }); }
      return json({ users: state.students.map(student => ({ id: student.id, email: student.email })), hasMore: true });
    }
    if (url.pathname === "/api/admin/images") {
      if (state.mediaDelay) await new Promise(resolve => setTimeout(resolve, state.mediaDelay));
      return state.mediaError ? json({ error: "Kho ảnh thử nghiệm chưa sẵn sàng" }, 503) : json({ images: state.images });
    }
    if (url.pathname === "/api/admin/exam-images") return json({ images: [] });
    if (url.pathname.startsWith("/fixture-media/")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#fef2f2"/><text x="50" y="180" font-size="36" fill="#cd1627">AECK - fixture</text></svg>' });
    if (url.pathname === "/api/admin/exam-content") return json({
      rooms: [{ id: "protected-room", title: "Phòng thi kiểm tra ranh giới", description: "", exam_type: "HSA", published: true, access_mode: "open", sort_order: 0 }],
      exams: [], sections: [], questions: [], keys: [],
    });
    if (url.pathname === "/api/guest-exams") return json({
      slot: { id: "protected-slot", name: "Kíp luyện HSA", starts_at: new Date(Date.now() - 3600000).toISOString(), ends_at: new Date(Date.now() + 7200000).toISOString(), grace_period_minutes: 15, has_password: false },
      exam: { id: "protected-exam", title: "Phòng luyện HSA", description: "Kiểm tra cách ly CSS danh mục", exam_type: "HSA", duration_minutes: 90 },
      room: { title: "Phòng luyện HSA", exam_type: "HSA" },
      section: null,
      settings: { identityFields: [{ key: "full_name", label: "Họ và tên", type: "text", required: true }], maxAttempts: 1, autoMonitor: "off", hideGroupHeaders: false, resetQuestionIndex: false },
      phase: "open", serverTime: new Date().toISOString(),
    });
    if (url.pathname.startsWith("/api/")) return json({});
    return route.continue();
  });
  return state;
}

test.use({ serviceWorkers: "block" });
test.beforeEach(() => {
  test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "Requires a synthetic local build");
});

test("ported catalogue paginates, filters, exports and restores URL state", async ({ page, context, baseURL }) => {
  const state = await installCatalogFixture(context, baseURL!);
  await page.goto("/admin/courses", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/content$/);
  const rows = page.locator(".admin-source-data-table tbody tr");
  await expect(rows).toHaveCount(10);
  await expect(page.getByRole("navigation", { name: "Phân trang khóa học" })).toContainText("1–10");
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(rows).toHaveCount(10);
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(rows).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Trang sau", exact: true })).toBeDisabled();
  await page.getByRole("combobox", { name: "Trạng thái", exact: true }).selectOption("draft");
  await expect(rows).toHaveCount(10);
  await expect(page).toHaveURL(/status=draft/);
  await expect(page).not.toHaveURL(/page=/);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Trạng thái", exact: true })).toHaveValue("draft");
  await page.getByRole("button", { name: "Danh sách", exact: true }).click();
  await expect(page.locator(".admin-content-catalog-list article")).toHaveCount(10);
  await page.goBack();
  await expect(rows).toHaveCount(10);
  await page.getByRole("button", { name: "Đặt lại bộ lọc", exact: true }).click();
  await page.getByRole("searchbox", { name: "Tìm khóa học" }).fill("toan tu duy");
  await expect(rows).toHaveCount(1);
  await page.locator(".admin-source-course-cell summary").click();
  await expect(page.locator(".admin-source-course-cell details p")).toBeVisible();
  await page.getByRole("button", { name: "Đặt lại bộ lọc", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất CSV", exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("danh-muc-khoa-hoc.csv");
  const text = await readFile((await file.path())!, "utf8");
  expect(text).toContain(courses[0].title);
  expect(text).toContain("Khóa học 24");
  expect(text).toContain("'=HYPERLINK(1)");
  await page.getByRole("searchbox", { name: "Tìm khóa học" }).fill("no-matching-course");
  await expect(page.getByRole("heading", { name: "Không tìm thấy khóa học phù hợp" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xuất CSV", exact: true })).toBeDisabled();
  expect(state.unexpected).toEqual([]);
});

test("ported catalogue fits long content, keyboard controls and both views", async ({ page, context, baseURL }, testInfo) => {
  const state = await installCatalogFixture(context, baseURL!);
  const runtimeErrors: string[] = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  await page.goto("/admin/content");
  await expect(page.locator(".admin-source-data-table tbody tr")).toHaveCount(10);
  await page.locator(".admin-source-course-cell summary").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".admin-source-course-cell details p").first()).toBeVisible();
  for (const view of ["Bảng", "Danh sách"]) {
    const button = page.getByRole("button", { name: view, exact: true });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const clipped = await page.locator(".admin-content-catalog").evaluate(root => {
      const viewportWidth = document.documentElement.clientWidth;
      return [...root.querySelectorAll("a,button,input,select,summary")].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > viewportWidth + 1);
      }).map(element => element.textContent || element.tagName);
    });
    expect(clipped).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(view === "Bảng" ? "catalog-table.png" : "catalog-list.png"), fullPage: true });
  }
  await page.getByRole("button", { name: "Tạo khóa học", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

test("catalogue handles loading, failed reads, retry and reduced results", async ({ page, context, baseURL }) => {
  const state = await installCatalogFixture(context, baseURL!);
  state.fail = true;
  await page.goto("/admin/content");
  await expect(page.getByRole("heading", { name: "Không tải được khóa học" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xuất CSV", exact: true })).toBeDisabled();
  state.fail = false;
  state.delay = 700;
  await page.locator(".admin-content-catalog").getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("button", { name: "Xuất CSV", exact: true })).toBeDisabled();
  await expect(page.locator(".admin-source-data-table tbody tr")).toHaveCount(10);
  state.courses = courses.slice(0, 1);
  state.delay = 0;
  await page.goto("/admin/content?page=999");
  await expect(page.locator(".admin-source-data-table tbody tr")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Phân trang khóa học" })).toContainText("Trang 1 / 1");
  state.courses = [];
  await page.reload();
  await expect(page.getByRole("heading", { name: "Chưa có khóa học nào" })).toBeVisible();
  expect(state.unexpected).toEqual([]);
});

test("catalogue alias retains the canonical permission gate", async ({ page, context, baseURL }) => {
  const state = await installCatalogFixture(context, baseURL!, ["users"]);
  await page.goto("/admin/course-management");
  await expect(page.locator(".ui-shell.admin-app")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/students$/);
  await expect(page.locator(".admin-content-catalog")).toHaveCount(0);
  await expect(page.locator(".admin-content-catalog").getByRole("button", { name: "Xuất CSV", exact: true })).toHaveCount(0);
  expect(state.courseReads).toBe(0);
  expect(state.unexpected).toEqual([]);
});

test("manage links use the existing builder and browser Back restores catalogue state", async ({ page, context, baseURL }) => {
  const state = await installCatalogFixture(context, baseURL!);
  await page.goto("/admin/content?status=draft&page=2");
  await expect(page.locator(".admin-source-data-table tbody tr")).toHaveCount(2);
  await page.getByRole("link", { name: "Quản lý khóa học Khóa học 22", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/content\/courses\/catalog-22$/);
  await expect(page.locator(".admin-course-builder")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tên khóa học", exact: true })).toHaveValue("Khóa học 22");
  await page.goBack();
  await expect(page).toHaveURL(/status=draft&page=2$/);
  await expect(page.locator(".admin-source-data-table tbody tr")).toHaveCount(2);
  await expect(page.getByRole("combobox", { name: "Trạng thái", exact: true })).toHaveValue("draft");
  expect(state.unexpected).toEqual([]);
});

test("catalogue styles remain outside protected exam entry and admin catalogue", async ({ page, context, baseURL }, testInfo) => {
  const state = await installCatalogFixture(context, baseURL!);
  const bankStyles = await readFile(new URL("../app/admin-question-bank-workspace.css", import.meta.url), "utf8");
  const assertBankStyleIsolation = async () => {
    const presentation = () => page.locator(".ui-shell, .main-content, .topbar, .sidebar, .room-catalog-grid, .guest-exam-page").evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return { background: style.background, color: style.color, font: style.font, padding: style.padding, margin: style.margin, border: style.border, shadow: style.boxShadow };
    }));
    const before = await presentation();
    await page.addStyleTag({ content: bankStyles });
    expect(await presentation()).toEqual(before);
    await expect(page.locator(".question-bank-workspace")).toHaveCount(0);
  };
  // Audit styles are retained on client navigation too; load the new detail first.
  await page.goto("/admin/audit");
  await page.getByRole("button", { name: `Xem chi tiết bản ghi ${auditRecords[0].id}`, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Chi tiết nhật ký" })).toBeVisible();
  await page.keyboard.press("Escape");
  const auditMenu = page.getByRole("button", { name: "Mở menu", exact: true });
  if (await auditMenu.isVisible()) await auditMenu.click();
  await page.locator(".sidebar").getByRole("link", { name: "Tài nguyên", exact: true }).click();
  await expect(page.locator(".admin-source-data-table tbody tr")).toHaveCount(10);
  // Load the ported stylesheet before navigating, so retained client CSS is covered.
  const menu = page.getByRole("button", { name: "Mở menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator(".sidebar").getByRole("link", { name: "Đề thi", exact: true }).click();
  await expect(page.locator(".room-catalog-grid")).toBeVisible();
  await expect(page.locator(".ui-shell")).toHaveClass(/protected-exam-surface/);
  await expect(page.locator(".admin-content-catalog")).toHaveCount(0);
  await assertBankStyleIsolation();
  await page.screenshot({ path: testInfo.outputPath("protected-admin-exams.png"), fullPage: true });
  await page.goto("/exam/protected-guest-token-12345");
  await expect(page.locator(".guest-exam-page")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Họ và tên/ })).toBeVisible();
  await expect(page.locator(".admin-content-catalog")).toHaveCount(0);
  await expect(page.locator(".admin-source-data-table")).toHaveCount(0);
  await assertBankStyleIsolation();
  await page.screenshot({ path: testInfo.outputPath("protected-guest-entry.png"), fullPage: true });
  expect(state.unexpected).toEqual([]);
});

test("reference audit detail shows full values, supports keyboard and wraps long text", async ({ page, context, baseURL }, testInfo) => {
  const state = await installCatalogFixture(context, baseURL!);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/admin/admin-log");
  await expect(page).toHaveURL(/\/admin\/audit$/);
  const trigger = page.getByRole("button", { name: `Xem chi tiết bản ghi ${auditRecords[0].id}`, exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Chi tiết nhật ký" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(auditRecords[0].admin_id!);
  await expect(dialog).toContainText(auditRecords[0].target_id!);
  await expect(dialog).toContainText("09:00");
  await expect(dialog.locator("dd").last()).toHaveText(auditRecords[0].reason);
  const close = dialog.getByRole("button", { name: "Đóng chi tiết nhật ký" });
  await expect(close).toBeFocused();
  // Native modal dialogs make background controls inert. Tab may legitimately
  // visit browser chrome (reported as body), but never the background controls.
  await trigger.evaluate(element => element.focus());
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate(element => element.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
  await close.focus();
  await page.screenshot({ path: testInfo.outputPath("audit-detail.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  for (const content of ["Ngắn", "Nội dung tiếng Việt có dấu rất dài cần hiển thị đầy đủ. ".repeat(12), "Long English context for an administrator reviewing a record. ".repeat(12), "UnbrokenIdentifier".repeat(24), '<img src=x onerror="alert(1)">']) {
    state.auditRecords[0].reason = content;
    state.auditRecords[0].context = content;
    state.auditRecords[0].target_name = content;
    await page.getByRole("button", { name: "Làm mới", exact: true }).click();
    await trigger.click();
    await expect(dialog.locator("dd").last()).toHaveText(content);
    await expect(dialog.locator("img")).toHaveCount(0);
    expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if (content.startsWith("Unbroken")) {
      await page.screenshot({ path: testInfo.outputPath("audit-detail-long.png"), fullPage: true });
      // Exercise text enlargement without reducing font size or concealing content.
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    }
    await close.click();
    await expect(trigger).toBeFocused();
  }
  await page.getByRole("button", { name: `Xem chi tiết bản ghi ${auditRecords[1].id}`, exact: true }).click();
  await expect(dialog).toContainText("Không có ID");
  await expect(dialog).toContainText("Chưa ghi nhận");
  await expect(dialog).toContainText("Không có lý do được ghi nhận");
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
  expect(state.mutations).toEqual([]);
});

test("reference audit detail is absent during errors, loading and empty results", async ({ page, context, baseURL }) => {
  const state = await installCatalogFixture(context, baseURL!);
  state.auditError = true;
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Không thể tải nhật ký", exact: true })).toBeVisible();
  await expect(page.locator(".admin-audit-reference-detail")).toHaveCount(0);
  state.auditError = false;
  state.auditDelay = 1000;
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.locator(".admin-audit-loading")).toBeVisible();
  await expect(page.locator(".admin-audit-reference-detail")).toHaveCount(0);
  await expect(page.locator(".admin-audit-reference-detail")).toHaveCount(2);
  state.auditDelay = 0;
  state.auditRecords = [];
  await page.getByRole("button", { name: "Làm mới", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Không có bản ghi phù hợp" })).toBeVisible();
  await expect(page.locator(".admin-audit-reference-detail")).toHaveCount(0);
  expect(state.unexpected).toEqual([]);
});

test("reference audit detail retains the canonical permission gate", async ({ page, context, baseURL }) => {
  const state = await installCatalogFixture(context, baseURL!, ["courses"]);
  await page.goto("/admin/admin-log");
  await expect(page).toHaveURL(/\/admin\/content$/);
  await expect(page.locator(".admin-content-catalog")).toBeVisible();
  await expect(page.locator(".admin-audit-reference-detail")).toHaveCount(0);
  expect(state.auditReads).toBe(0);
  expect(state.unexpected).toEqual([]);
});

test("reference student roster filters, exports and opens a keyboard accessible profile", async ({ page, context, baseURL }, testInfo) => {
  const state = await installCatalogFixture(context, baseURL!);
  await page.goto("/admin/students");
  const root = page.locator(".admin-student-roster");
  const rows = root.locator("tbody tr");
  await expect(rows).toHaveCount(20);
  await expect(root.getByRole("status").filter({ hasText: "giới hạn phân trang" })).toBeVisible();
  await root.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(rows).toHaveCount(5);
  await root.getByRole("combobox", { name: "Trạng thái", exact: true }).selectOption("locked");
  await expect(rows).toHaveCount(12);
  await root.getByRole("button", { name: "Đặt lại bộ lọc", exact: true }).click();
  await root.getByRole("searchbox").fill("nguyen dang anh");
  await expect(rows).toHaveCount(1);
  const trigger = root.getByRole("button", { name: "Xem hồ sơ Nguyễn Đặng Ánh", exact: true });
  await trigger.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Hồ sơ học viên" });
  await expect(dialog).toContainText("student1@example.test");
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  const download = page.waitForEvent("download");
  await root.getByRole("button", { name: "Xuất CSV", exact: true }).click();
  const csv = await readFile((await (await download).path())!, "utf8");
  expect(csv).toContain("Nguyễn Đặng Ánh"); expect(csv).not.toContain("student2@example.test");
  await root.getByRole("button", { name: "Đặt lại bộ lọc", exact: true }).click();
  await root.getByRole("combobox", { name: "Khóa học", exact: true }).selectOption("assigned");
  await expect(rows).toHaveCount(1);
  await root.getByRole("button", { name: "Đặt lại bộ lọc", exact: true }).click();
  await root.getByRole("combobox", { name: "Sắp xếp", exact: true }).selectOption("newest");
  await expect(rows.first()).toContainText("REMIX000025");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("student-roster.png"), fullPage: true });
  await root.getByRole("searchbox").fill("VeryLongStudentName");
  await expect(rows).toHaveCount(1);
  await root.getByRole("button", { name: `Xem hồ sơ ${rosterStudents[1].full_name}`, exact: true }).click();
  await expect(dialog).toContainText(rosterStudents[1].email);
  expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("student-long-profile.png") });
  await page.keyboard.press("Escape");
  expect(await root.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  expect(state.unexpected).toEqual([]);
});

test("student roster keeps existing account actions and recovers from a load failure", async ({ page, context, baseURL }) => {
  const state = await installCatalogFixture(context, baseURL!);
  state.rosterError = true;
  await page.goto("/admin/students");
  const root = page.locator(".admin-student-roster");
  await expect(root.getByRole("heading", { name: "Không thể cập nhật danh sách học viên" })).toBeVisible();
  await expect(root.getByRole("button", { name: "Xuất CSV", exact: true })).toBeDisabled();
  state.rosterError = false;
  await root.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(root.locator("tbody tr")).toHaveCount(20);
  await root.getByRole("button", { name: "Thêm học viên", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Thêm học viên", exact: true });
  await create.getByLabel("Họ và tên").fill("Học viên kiểm thử");
  await create.getByLabel("Email", { exact: true }).fill("created@example.test");
  await create.getByLabel("Mật khẩu ban đầu").fill("fixture-only-password");
  await create.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(create).toHaveCount(0);
  expect(state.mutations[0]).toEqual({ method: "POST", body: { email: "created@example.test", password: "fixture-only-password", fullName: "Học viên kiểm thử" } });
  await root.getByRole("searchbox").fill("nguyen dang anh");
  await root.getByRole("button", { name: "Đổi mật khẩu cho Nguyễn Đặng Ánh", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Đổi mật khẩu", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await root.getByRole("searchbox").fill("not-found-student");
  await expect(root.getByRole("heading", { name: "Không tìm thấy học viên phù hợp" })).toBeVisible();
  state.students = [];
  await page.reload();
  await expect(root.getByRole("heading", { name: "Chưa có học viên", exact: true })).toBeVisible();
  expect(state.unexpected).toEqual([]);
});

test("public media ports grid/list, filters and inspector without changing private assets", async ({ page, context, baseURL }, testInfo) => {
  const state = await installCatalogFixture(context, baseURL!);
  await page.goto("/admin/media-management");
  const root = page.locator("#admin-upload-library-panel-public");
  await expect(root.locator(".admin-upload-image-card")).toHaveCount(12);
  await root.getByRole("combobox", { name: "Tình trạng sử dụng" }).selectOption("unused");
  await expect(root.locator(".admin-upload-image-card")).toHaveCount(7);
  await root.getByRole("button", { name: "Danh sách", exact: true }).click();
  await expect(root.locator(".admin-public-media-items")).toHaveClass(/is-list/);
  await page.reload();
  await expect(root.getByRole("combobox", { name: "Tình trạng sử dụng" })).toHaveValue("unused");
  await expect(root.getByRole("button", { name: "Danh sách", exact: true })).toHaveAttribute("aria-pressed", "true");
  await root.getByRole("combobox", { name: "Sắp xếp ảnh" }).selectOption("largest");
  await expect(root.locator(".admin-upload-image-card").first()).toContainText("image-14.png");
  const trigger = root.getByRole("button", { name: "Xem nhanh image-14.png", exact: true });
  await trigger.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Chi tiết ảnh" })).toContainText("14 KB");
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  await root.getByRole("button", { name: "Đặt lại bộ lọc ảnh" }).click();
  await root.getByRole("searchbox").fill("anh bai giang");
  await expect(root.locator(".admin-upload-image-card")).toHaveCount(1);
  await expect(root.getByRole("button", { name: "Đang dùng", exact: true })).toBeDisabled();
  await root.getByRole("button", { name: "Đặt lại bộ lọc ảnh" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("public-media-list.png"), fullPage: true });
  await root.getByRole("searchbox").fill("LongImageFileName");
  await root.getByRole("button", { name: `Xem nhanh ${mediaImages[1].assetName}`, exact: true }).click();
  const detail = page.getByRole("dialog", { name: "Chi tiết ảnh" });
  await expect(detail).toContainText(mediaImages[1].assetName);
  expect(await detail.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  const closeBounds = await detail.getByRole("button", { name: "Đóng chi tiết ảnh", exact: true }).boundingBox();
  expect(closeBounds!.width).toBeGreaterThanOrEqual(40);
  expect(closeBounds!.height).toBeGreaterThanOrEqual(40);
  await page.screenshot({ path: testInfo.outputPath("media-long-preview.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Ảnh đề thi", exact: true }).click();
  await expect(page.locator(".admin-public-media-tools")).toHaveCount(0);
  expect(state.unexpected).toEqual([]);
});

test("admin shell uses matching rail and content geometry", async ({ page, context, baseURL }, testInfo) => {
  await installCatalogFixture(context, baseURL!);
  await page.goto("/admin/students");
  await expect(page.locator(".admin-student-roster tbody tr")).toHaveCount(20);
  if (page.viewportSize()!.width < 768) {
    const open = page.getByRole("button", { name: "Mở menu", exact: true });
    await open.click();
    const drawer = page.getByRole("dialog", { name: "Điều hướng quản trị" });
    await expect(drawer.getByRole("link", { name: "Học viên", exact: true })).toBeVisible();
    await expect.poll(async () => (await drawer.boundingBox())!.x).toBeGreaterThanOrEqual(0);
    const drawerBounds = (await drawer.boundingBox())!;
    expect(drawerBounds.x + drawerBounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const clipped = await drawer.locator("a.admin-sidebar-nav-item > span").evaluateAll(spans => spans.filter(span => span.scrollWidth > span.clientWidth + 1).map(span => span.textContent));
    expect(clipped).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("sidebar-mobile.png") });
    await page.keyboard.press("Escape");
    await expect(open).toBeFocused();
    await expect(open).toHaveAttribute("aria-expanded", "false");
    return;
  }
  const geometry = await page.locator(".sidebar").evaluate(sidebar => {
    const element = sidebar.querySelector("nav")!;
    const css = getComputedStyle(element);
    const matches: string[] = [];
    const inspect = (rules: CSSRuleList) => { for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule && element.matches(rule.selectorText) && (rule.style.width || rule.style.maxWidth || rule.style.minWidth)) matches.push(rule.cssText);
      if ("cssRules" in rule) inspect((rule as CSSGroupingRule).cssRules);
    } };
    for (const sheet of Array.from(document.styleSheets)) { try { inspect(sheet.cssRules); } catch { /* no cross-origin sheets */ } }
    const children = [...sidebar.querySelectorAll("nav, .admin-sidebar-group, a, a > span")].slice(0, 12).map(child => {
      const style = getComputedStyle(child);
      return { tag: child.tagName, className: child.className, width: child.getBoundingClientRect().width, scrollWidth: child.scrollWidth, max: style.maxWidth, overflow: style.overflow, position: style.position, left: style.left, transform: style.transform, display: style.display };
    });
    return { width: sidebar.getBoundingClientRect().width, navWidth: element.getBoundingClientRect().width, max: css.maxWidth, min: css.minWidth, margin: getComputedStyle(document.querySelector(".main-content")!).marginLeft, matches, children };
  });
  await testInfo.attach("rail-geometry.json", { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
  expect(geometry.width).toBeCloseTo(parseFloat(geometry.margin), 0);
  expect(geometry.navWidth).toBeGreaterThan(geometry.width - 40);
  const clipped = await page.locator(".sidebar a > span").evaluateAll(spans => spans.filter(span => span.scrollWidth > span.clientWidth + 1).map(span => span.textContent));
  expect(clipped).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("sidebar-expanded.png") });
  await page.getByRole("button", { name: "Thu gọn menu", exact: true }).click();
  await expect(page.locator(".sidebar")).toHaveCSS("width", "80px");
  await expect(page.locator(".sidebar a.admin-sidebar-nav-item > span").first()).toBeHidden();
  await expect(page.locator(".main-content")).toHaveCSS("margin-left", "80px");
  await page.screenshot({ path: testInfo.outputPath("sidebar-collapsed.png") });
  await page.getByRole("button", { name: "Mở rộng menu", exact: true }).click();
  await expect(page.locator(".sidebar")).toHaveCSS("width", "288px");
});

test("public media handles loading, error, retry, empty and restricted private access", async ({ page, context, baseURL }) => {
  const state = await installCatalogFixture(context, baseURL!, ["courses"]);
  state.mediaError = true;
  await page.goto("/admin/upload?library=private");
  const root = page.locator("#admin-upload-library-panel-public");
  await expect(root.getByRole("heading", { name: "Không thể tải kho ảnh", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ảnh đề thi", exact: true })).toHaveCount(0);
  state.mediaError = false;
  state.mediaDelay = 700;
  await root.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(root).toHaveAttribute("aria-busy", "true");
  await expect(root.locator(".admin-upload-image-card")).toHaveCount(12);
  await root.getByRole("searchbox").fill("not-found-image");
  await expect(root.getByRole("heading", { name: "Không tìm thấy ảnh", exact: true })).toBeVisible();
  await root.getByRole("button", { name: "Xóa tìm kiếm và bộ lọc", exact: true }).click();
  await expect(root.locator(".admin-upload-image-card")).toHaveCount(12);
  state.images = [];
  state.mediaDelay = 0;
  await page.getByRole("button", { name: "Làm mới", exact: true }).click();
  await expect(root.getByRole("heading", { name: "Kho ảnh đang trống", exact: true })).toBeVisible();
  expect(state.unexpected).toEqual([]);
});

test("student roster alias keeps the canonical user permission gate", async ({ page, context, baseURL }) => {
  const state = await installCatalogFixture(context, baseURL!, ["courses"]);
  await page.goto("/admin/user-management");
  await expect(page).toHaveURL(/\/admin\/content$/);
  await expect(page.locator(".admin-student-roster")).toHaveCount(0);
  expect(state.mutations).toEqual([]);
  expect(state.unexpected).toEqual([]);
});
