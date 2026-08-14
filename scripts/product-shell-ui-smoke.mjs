import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:5175";
const mockAuth = process.env.MOCK_AUTH === "1";
const mockRole = process.env.MOCK_ROLE === "student" ? "student" : "admin";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const widths = [1440, 1280, 768, 740, 720, 390, 360, 320];
const requestedWidths = (process.env.SMOKE_WIDTHS ?? "").split(",").map(value => Number(value)).filter(value => widths.includes(value));
const auditWidths = requestedWidths.length ? requestedWidths : widths;
const safeRoutes = [
  ["admin-dashboard", "/admin"],
  ["admin-exam-catalog", "/admin/exams"],
  ["admin-room-workspace", "/admin/exams/rooms/mock-room"],
  ["admin-sessions", "/admin/sessions"],
  ["admin-exam-access", "/admin/exams/mock-exam/access?slotId=mock-slot"],
  ["admin-security", "/admin/security"],
  ["admin-content", "/admin/content"],
  ["admin-students", "/admin/students"],
  ["admin-enrollments", "/admin/enrollments"],
  ["admin-upload", "/admin/upload"],
  ["student-dashboard", "/dashboard"],
  ["student-courses", "/courses"],
  ["student-profile", "/profile"],
  ["student-history", "/exam-history"],
  ["student-exam-catalog", "/exam-room"],
  ["student-exam-list", "/exam-room/mock-room"],
];
const requestedRoutes = new Set((process.env.SMOKE_ROUTES ?? "").split(",").map(value => value.trim()).filter(Boolean));
const auditRoutes = requestedRoutes.size ? safeRoutes.filter(([name]) => requestedRoutes.has(name)) : safeRoutes;
const startPath = process.env.SMOKE_START_PATH ?? "/admin";
const stressEnabled = process.env.SMOKE_STRESS === "1";
const extendedInteractions = process.env.SMOKE_EXTENDED_INTERACTIONS !== "0";
const resourceModalEnabled = process.env.SMOKE_RESOURCE_MODAL === "1";

await mkdir("artifacts/product-shell-ui-audit", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = [];

const mockUser = {
  id: mockRole === "admin" ? "mock-admin" : "mock-student",
  aud: "authenticated",
  role: "authenticated",
  email: mockRole === "admin" ? "teacher@example.com" : "student@example.com",
};
const mockProfile = {
  id: mockUser.id,
  full_name: mockRole === "admin" ? "Nguyễn Minh Anh" : "Trần Minh Anh",
  student_code: mockRole === "admin" ? "REMIX000001" : "REMIX000128",
  role: mockRole,
  status: "active",
  created_at: "2026-08-08T08:00:00.000Z",
};
const mockCourse = {
  id: "mock-course",
  title: "Tư duy Toán học TSA",
  description: "Lộ trình luyện tập theo từng phần, bài học và tài liệu.",
  cover_url: null,
  cover_color: "#007AFF",
  published: true,
  sort_order: 1,
  created_at: "2026-08-08T08:00:00.000Z",
};
const mockRooms = [{ id: "mock-room", title: "Kỳ thi thử tháng 8", description: "", exam_type: "HSA", registration_start: null, registration_end: null, exam_start: null, exam_end: null, published: true, access_mode: "open", sort_order: 1 }];
const mockExams = [{ id: "mock-exam", room_id: "mock-room", title: "Đề TSA tổng hợp", description: "", dashboard_title: null, exam_type: "HSA", mode: "free", duration_minutes: 90, published: true, sort_order: 1, created_at: "2026-08-04T08:00:00.000Z" }];
const mockSections = [{ id: "mock-section", exam_id: "mock-exam", title: "Tư duy định lượng", duration_minutes: 90, sort_order: 1, subject_code: null }];
const mockAttempts = [
  { id: "mock-attempt-latest", exam_id: "mock-exam", status: "graded", score: 87.5, correct_answers: 42, total_questions: 50, started_at: "2026-08-09T07:00:00.000Z", submitted_at: "2026-08-09T08:12:00.000Z", duration_seconds: 4320 },
  { id: "mock-attempt-first", exam_id: "mock-exam", status: "completed", score: 72, correct_answers: 36, total_questions: 50, started_at: "2026-08-06T07:00:00.000Z", submitted_at: "2026-08-06T08:18:00.000Z", duration_seconds: 4680 },
];
const mockSecurityUser = { id: "11111111-1111-4111-8111-111111111111", full_name: "Nguyễn Minh Anh với tên tiếng Việt đủ dài để kiểm tra giao diện", student_code: "REMIX000128", email: "student.with.a.long.address@example.com", status: "active", account_status: "active", violation_count: 0, banned_at: null, banned_until: null, ban_reason: null, ban_event_id: null };
const mockSession = { id: "22222222-2222-4222-8222-222222222222", kind: "both", exam_id: "mock-exam", room_id: "mock-room", name: "Kíp thi thử có tên tiếng Việt dài để kiểm tra khả năng xuống dòng an toàn", exam_title: "Đề đánh giá năng lực tổng hợp", exam_type: "HSA", room_title: "Phòng luyện đánh giá năng lực", starts_at: "2026-08-10T08:00:00.000Z", ends_at: "2026-08-10T10:00:00.000Z", enabled: true, results_released_at: null, token_hint: "ABCD", attempt_count: 18, submitted_count: 12 };
let mockAuthStorage = null;

function jsonResponse(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

async function installMockAuth() {
  if (!mockAuth || !supabaseUrl) return;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: mockUser.id, exp: expiresAt, role: "authenticated" })}.mock-signature`;
  mockAuthStorage = { storageKey: `sb-${projectRef}-auth-token`, session: { access_token: accessToken, refresh_token: "mock-refresh", expires_in: 3600, expires_at: expiresAt, token_type: "bearer", user: mockUser } };
  await page.addInitScript(({ storageKey, user, accessToken, expiresAt }) => {
    localStorage.setItem(storageKey, JSON.stringify({ access_token: accessToken, refresh_token: "mock-refresh", expires_in: 3600, expires_at: expiresAt, token_type: "bearer", user }));
  }, { storageKey: mockAuthStorage.storageKey, user: mockUser, accessToken, expiresAt });

  await page.route("**/*", async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === new URL(supabaseUrl).origin) {
      if (requestUrl.pathname === "/auth/v1/user") return route.fulfill(jsonResponse({ user: mockUser }));
      if (requestUrl.pathname.startsWith("/rest/v1/")) {
        const table = requestUrl.pathname.slice("/rest/v1/".length);
        const rows = table === "profiles"
          ? [mockProfile, { id: "mock-student-2", full_name: "Lê Gia Bảo", student_code: "REMIX000129", role: "student", status: "active", created_at: "2026-08-07T08:00:00.000Z" }]
          : table === "courses" ? [mockCourse]
            : table === "course_enrollments" ? [{ student_id: mockUser.id, course_id: mockCourse.id, courses: mockCourse }]
              : table === "exam_rooms" ? mockRooms
                : table === "exams" ? mockExams
                  : table === "exam_room_enrollments" ? []
                    : table === "chapters" ? [{ id: "mock-chapter", course_id: mockCourse.id, title: "Hàm số", sort_order: 1 }]
                      : table === "lessons" ? [{ id: "mock-lesson", chapter_id: "mock-chapter", title: "Ôn tập nền tảng", description: "", published: true, sort_order: 1 }]
                        : [];
        const objectResponse = requestUrl.searchParams.get("id")?.includes(`eq.${mockUser.id}`) && table === "profiles";
        return route.fulfill(jsonResponse(objectResponse ? rows[0] : rows));
      }
    }
    if (requestUrl.origin === new URL(baseUrl).origin && requestUrl.pathname.startsWith("/api/")) {
      if (requestUrl.pathname === "/api/exams" && requestUrl.searchParams.get("scope") === "rooms") return route.fulfill(jsonResponse({ rooms: mockRooms, exams: mockExams, attempts: [] }));
      if (requestUrl.pathname === "/api/exams" && requestUrl.searchParams.get("scope") === "room") return route.fulfill(jsonResponse({ room: mockRooms[0], exams: mockExams, sections: mockSections, attempts: mockAttempts }));
      if (requestUrl.pathname === "/api/exams" && requestUrl.searchParams.get("scope") === "history") return route.fulfill(jsonResponse({ attempts: [] }));
      if (requestUrl.pathname === "/api/admin/users") return route.fulfill(jsonResponse({ users: [{ id: "mock-student-2", email: "student@example.com" }] }));
      if (requestUrl.pathname === "/api/admin/security" && !requestUrl.searchParams.has("userId")) return route.fulfill(jsonResponse({ users: [mockSecurityUser] }));
      if (requestUrl.pathname === "/api/admin/security" && requestUrl.searchParams.has("userId")) return route.fulfill(jsonResponse({ profile: mockSecurityUser, devices: [{ id: "33333333-3333-4333-8333-333333333333", device_name: "Máy tính xách tay Windows", browser: "Chrome", operating_system: "Windows 11", trusted_by_admin: false, verified_at: null, last_used_at: "2026-08-09T08:00:00.000Z", revoked_at: null }], sessions: [], events: [], violations: [], actions: [], serverTime: "2026-08-09T08:01:00.000Z" }));
      if (requestUrl.pathname === "/api/admin/sessions") return route.fulfill(jsonResponse({ items: [mockSession], summary: { upcoming: 1, open: 0, ended: 0, disabled: 0 }, total: 1, hasNextPage: false, page: 1, limit: 20 }));
      if (requestUrl.pathname === "/api/admin/exam-access") return route.fulfill(jsonResponse({ slots: [{ id: "mock-slot", exam_id: "mock-exam", name: "Kíp thi sáng", starts_at: "2026-08-10T08:00:00.000Z", ends_at: "2026-08-10T10:00:00.000Z", enabled: true, results_released_at: null, export_open_at: null, export_close_at: null, grace_period_minutes: 30, token_hint: "ABCD", created_at: "2026-08-08T08:00:00.000Z" }], attempts: [] }));
      if (requestUrl.pathname === "/api/admin/images" || requestUrl.pathname === "/api/admin/exam-images") return route.fulfill(jsonResponse({ images: [] }));
      return route.fulfill(jsonResponse({}));
    }
    return route.continue();
  });
}

async function inspect(name, path, width, screenshot = false) {
  await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
  if (mockAuth && mockAuthStorage && page.url().startsWith(baseUrl)) {
    await page.evaluate(({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)), mockAuthStorage);
  }
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(mockAuth ? 1_200 : 350);
  const state = await page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector(".ui-shell");
    const controls = [...document.querySelectorAll("button, a, input, select, textarea")];
    const unnamed = controls.filter(control => {
      const text = control.textContent?.trim();
      const label = control.getAttribute("aria-label") || control.getAttribute("title") || control.getAttribute("placeholder");
      const labelled = control.labels?.length || control.getAttribute("aria-labelledby");
      return !text && !label && !labelled && control.getAttribute("type") !== "hidden";
    });
    return {
      url: window.location.pathname,
      viewport: window.innerWidth,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      shell: shell?.className ?? null,
      login: Boolean(document.querySelector("main.login-page")),
      unnamedControls: unnamed.length,
      controlsOutsideViewport: controls.filter(control => {
        if (window.innerWidth <= 767 && control.closest(".sidebar:not(.mobile-open)")) return false;
        const rect = control.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1);
      }).length,
      undersizedControls: controls.filter(control => {
        const rect = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        return rect.width > 0 && style.display !== "inline" && (rect.width < 24 || rect.height < 24);
      }).map(control => {
        const rect = control.getBoundingClientRect();
        return { tag: control.tagName.toLowerCase(), className: control.className, width: Math.round(rect.width), height: Math.round(rect.height), text: control.textContent?.trim().slice(0, 40) ?? "" };
      }),
    };
  });
  if (screenshot) await page.screenshot({ path: `artifacts/product-shell-ui-audit/${name}-${width}.png`, fullPage: true });
  report.push({ name, path, width, ...state });
}

async function inspectStress(name, path, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(mockAuth ? 1_200 : 350);
  const result = await page.evaluate(() => {
    const longVietnamese = "Nội dung tiếng Việt rất dài để kiểm tra khả năng xuống dòng, thứ bậc thông tin và việc các hành động quan trọng luôn còn nhìn thấy trên màn hình hẹp";
    const unbroken = "CHUOIKHONGCODAUCACTRONGIUPHATHIENOVERFLOW".repeat(4);
    const targets = [...document.querySelectorAll(".reference-room-card-title h2, .admin-kpi-label, .admin-action-text b, .admin-session-title-row h3, .security-user-grid b, .overview-card-head b, .course-body h3, .history-exam b, .detail-row b")].slice(0, 8);
    targets.forEach((target, index) => { target.textContent = index === targets.length - 1 ? unbroken : longVietnamese; });
    document.documentElement.style.fontSize = "200%";
    const root = document.documentElement;
    const controls = [...document.querySelectorAll("button, a, input, select, textarea")];
    return {
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      controlsOutsideViewport: controls.filter(control => {
        if (window.innerWidth <= 767 && control.closest(".sidebar:not(.mobile-open)")) return false;
        const rect = control.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1);
      }).length,
    };
  });
  report.push({ name: `${name}-text-stress-200pct`, path, width, ...result });
}

async function inspectDrawer(path) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(mockAuth ? 1_200 : 350);
  await page.keyboard.press("Tab");
  const skipLink = await page.evaluate(() => {
    const active = document.activeElement;
    const rect = active?.getBoundingClientRect();
    return {
      skipLinkFocused: active?.classList.contains("skip-link") ?? false,
      skipLinkVisible: Boolean(rect && rect.top >= 0 && rect.bottom <= window.innerHeight),
    };
  });
  await page.keyboard.press("Tab");
  await page.locator(".mobile-menu").click();
  await page.waitForTimeout(100);
  const opened = await page.evaluate(() => {
    const sidebar = document.querySelector("#main-sidebar");
    const main = document.querySelector("#main-content");
    return {
      role: sidebar?.getAttribute("role"),
      modal: sidebar?.getAttribute("aria-modal"),
      mainInert: main instanceof HTMLElement ? main.inert : false,
      focusInside: Boolean(sidebar?.contains(document.activeElement)),
    };
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  const restored = await page.evaluate(() => document.activeElement?.classList.contains("mobile-menu") ?? false);
  report.push({ name: `${mockRole}-drawer-keyboard`, path, width: 390, ...skipLink, ...opened, restoredFocus: restored });
}

async function inspectSecurityDialogs() {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseUrl}/admin/security`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(1_200);
  await page.locator(".security-user-grid > button").first().click();
  await page.locator(".security-detail-panel").waitFor({ state: "visible" });
  await page.locator(".security-admin-actions button").nth(1).click();
  await page.locator(".security-action-dialog").waitFor({ state: "visible" });
  await page.waitForTimeout(100);
  const nested = await page.evaluate(() => ({
    modalCount: document.querySelectorAll('[role="dialog"][aria-modal="true"]').length,
    focusInAction: Boolean(document.querySelector(".security-action-dialog")?.contains(document.activeElement)),
  }));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  const escape = await page.evaluate(() => ({
    actionClosed: !document.querySelector(".security-action-dialog"),
    detailStillOpen: Boolean(document.querySelector(".security-detail-panel")),
  }));
  report.push({ name: "admin-security-dialog-keyboard", path: "/admin/security", width: 1280, ...nested, ...escape });
}

async function inspectCollapsedAdminSidebar() {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/admin/enrollments`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(mockAuth ? 1_200 : 350);
  await page.locator(".header-sidebar-toggle").click();
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => {
    const shell = document.querySelector(".ui-shell");
    const logo = document.querySelector(".header-brand-logo-compact")?.getBoundingClientRect();
    const labels = [...document.querySelectorAll(".admin-sidebar-section-label")];
    const navLinks = [...document.querySelectorAll(".admin-sidebar-nav-item")];
    return {
      collapsed: !shell?.classList.contains("sidebar-expanded"),
      visibleSectionLabels: labels.filter(label => getComputedStyle(label).display !== "none").length,
      namedLinks: navLinks.filter(link => Boolean(link.getAttribute("aria-label"))).length,
      navLinks: navLinks.length,
      compactLogoLeft: logo ? Math.round(logo.left) : null,
    };
  });
  await page.screenshot({ path: "artifacts/product-shell-ui-audit/admin-sidebar-collapsed-1440.png", fullPage: true });
  report.push({ name: "admin-sidebar-collapsed", path: "/admin/enrollments", width: 1440, ...state });
}

async function inspectDashboardDotAlignment() {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(mockAuth ? 1_200 : 350);
  const state = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".overview-list-card li")];
    const offsets = rows.map(row => {
      const dot = row.querySelector(".dot")?.getBoundingClientRect();
      const link = row.querySelector("a")?.getBoundingClientRect();
      return dot && link ? Math.abs((dot.top + dot.height / 2) - (link.top + link.height / 2)) : null;
    }).filter(value => value != null);
    return {
      measuredRows: offsets.length,
      maxCenterOffset: offsets.length ? Math.max(...offsets) : null,
    };
  });
  await page.screenshot({ path: "artifacts/product-shell-ui-audit/student-dashboard-dots-1440.png", fullPage: true });
  report.push({ name: "student-dashboard-dot-alignment", path: "/dashboard", width: 1440, ...state });
}

async function inspectCourseResourceModal() {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto(`${baseUrl}/admin/content`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_200);
    await page.getByRole("button", { name: /Quản lý/ }).first().click();
    await page.getByRole("button", { name: /Thêm nội dung/ }).first().click();
    await page.locator(".resource-source-modal").waitFor({ state: "visible" });

    const sourceOptions = page.locator('input[name="resourceSource"]');
    const optionCount = await sourceOptions.count();
    await sourceOptions.nth(3).check();
    const uploadVisible = await page.getByText("File PDF (tối đa 50 MB)", { exact: true }).isVisible();
    await sourceOptions.nth(2).check();
    const linkVisible = await page.getByText("Link PDF", { exact: true }).last().isVisible();
    await sourceOptions.nth(0).check();
    const youtubeVisible = await page.getByText("Link YouTube", { exact: true }).isVisible();
    await sourceOptions.nth(1).check();
    const microsoftVisible = await page.getByText("Video URL", { exact: true }).isVisible();
    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const modal = document.querySelector(".resource-source-modal");
      const rect = modal?.getBoundingClientRect();
      const controls = [...(modal?.querySelectorAll("button, input") ?? [])];
      return {
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
        modalInsideViewport: Boolean(rect && rect.left >= -1 && rect.right <= innerWidth + 1),
        unnamedControls: controls.filter(control => !control.textContent?.trim() && !control.getAttribute("aria-label") && !control.getAttribute("name") && !control.closest("label")).length,
      };
    });
    const result = { name: "admin-course-resource-modal", path: "/admin/content", width, optionCount, uploadVisible, linkVisible, youtubeVisible, microsoftVisible, ...state };
    report.push(result);
    await page.screenshot({ path: `artifacts/product-shell-ui-audit/admin-course-resource-modal-${width}.png`, fullPage: true });
    if (optionCount !== 4 || !uploadVisible || !linkVisible || !youtubeVisible || !microsoftVisible || result.horizontalOverflow || !result.modalInsideViewport || result.unnamedControls) {
      throw new Error(`Course resource modal failed at ${width}px: ${JSON.stringify(result)}`);
    }
  }
}

async function inspectExamHistoryDialog() {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto(`${baseUrl}/exam-room/mock-room`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(mockAuth ? 1_200 : 350);

    const trigger = page.locator(".reference-exam-history").first();
    await trigger.click();
    await page.locator(".exam-attempt-history-dialog").waitFor({ state: "visible" });
    await page.waitForTimeout(100);

    const opened = await page.evaluate(() => {
      const root = document.documentElement;
      const grid = document.querySelector(".exam-list-grid")?.getBoundingClientRect();
      const card = document.querySelector(".reference-exam-card")?.getBoundingClientRect();
      const dialog = document.querySelector(".exam-attempt-history-dialog");
      const close = dialog?.querySelector('button[aria-label="Đóng lịch sử"]');
      const page = document.querySelector(".exam-list-page");
      const background = page ? [...page.children].filter(element => !element.contains(dialog)) : [];
      return {
        historyItems: dialog?.querySelectorAll(".exam-attempt-history-item").length ?? 0,
        closeFocused: document.activeElement === close,
        backgroundInert: background.length > 0 && background.every(element => element instanceof HTMLElement && element.inert),
        dialogColumns: getComputedStyle(dialog?.querySelector(".exam-attempt-history-list")).gridTemplateColumns,
        cardWidth: card ? Math.round(card.width) : null,
        gridWidth: grid ? Math.round(grid.width) : null,
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      };
    });

    await page.screenshot({ path: `artifacts/product-shell-ui-audit/student-exam-history-${width}.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    const closed = await page.evaluate(() => ({
      dialogClosed: !document.querySelector(".exam-attempt-history-dialog"),
      triggerRestored: document.activeElement?.classList.contains("reference-exam-history") ?? false,
    }));
    const result = { name: "student-exam-history-dialog", path: "/exam-room/mock-room", width, ...opened, ...closed };
    report.push(result);

    if (result.historyItems !== 2 || !result.closeFocused || !result.backgroundInert || !result.dialogClosed || !result.triggerRestored || result.horizontalOverflow) {
      throw new Error(`Exam history dialog failed at ${width}px: ${JSON.stringify(result)}`);
    }
    if (width === 1440 && (result.cardWidth == null || result.cardWidth > 520 || result.dialogColumns.split(" ").length !== 2)) {
      throw new Error(`Exam package desktop layout failed: ${JSON.stringify(result)}`);
    }
    if (width === 390 && (result.cardWidth == null || result.gridWidth == null || Math.abs(result.cardWidth - result.gridWidth) > 1 || result.dialogColumns.split(" ").length !== 1)) {
      throw new Error(`Exam package mobile layout failed: ${JSON.stringify(result)}`);
    }
  }
}

await installMockAuth();
await inspect(mockRole === "student" ? "student-login" : "admin-login", startPath, 390, true);
const authenticated = !(await page.locator("main.login-page").count());

if (authenticated) {
  for (const [name, path] of auditRoutes) {
    for (const width of auditWidths) await inspect(name, path, width, width === 1440 || width === 390 || requestedWidths.includes(width));
    if (stressEnabled) await inspectStress(name, path, Math.min(...auditWidths));
  }
  if (extendedInteractions) {
    await inspectDrawer(mockRole === "admin" ? "/admin" : "/dashboard");
    if (mockRole === "admin") {
      await inspectCollapsedAdminSidebar();
      await inspectDashboardDotAlignment();
    }
    if (mockRole === "admin" && auditRoutes.some(([name]) => name === "admin-security")) await inspectSecurityDialogs();
    await inspectExamHistoryDialog();
    const catalogRoutes = [["student-exam-catalog-shell", "/exam-room"]];
    if (mockRole === "admin") catalogRoutes.push(["admin-exam-catalog-shell", "/admin/exams"]);
    for (const [name, path] of catalogRoutes) {
      await inspect(name, path, 1440, true);
      const latest = report.at(-1);
      if (!latest?.shell?.includes("product-shell") || latest.shell.includes("protected-exam-surface")) {
        throw new Error(`${name} did not expose the standardized product shell: ${latest?.shell}`);
      }
    }
    const protectedRoutes = [["protected-exam-runner", "/exam/mock-exam?mode=practice"]];
    if (mockRole === "admin") protectedRoutes.push(["protected-admin-authoring", "/admin/exams/mock-exam"]);
    for (const [name, path] of protectedRoutes) {
      await inspect(name, path, 1440, true);
      const latest = report.at(-1);
      if (latest?.shell && !latest.shell.includes("protected-exam-surface") && !latest.shell.includes("exam-shell")) {
        throw new Error(`${name} did not expose the protected shell boundary: ${latest.shell}`);
      }
    }
  }
  if (resourceModalEnabled && mockRole === "admin") await inspectCourseResourceModal();
}

console.log(JSON.stringify({ baseUrl, mockAuth, mockRole, authenticated, report }, null, 2));
await browser.close();
