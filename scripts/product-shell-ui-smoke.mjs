import { mkdir, writeFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { join } from "node:path";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const mockAuth = process.env.MOCK_AUTH === "1";
const mockRole = process.env.MOCK_ROLE === "student" ? "student" : "admin";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const widths = [1440, 1280, 768, 740, 720, 390, 360, 320];
const requestedWidths = (process.env.SMOKE_WIDTHS ?? "").split(",").map(value => Number(value)).filter(value => widths.includes(value));
const auditWidths = requestedWidths.length ? requestedWidths : widths;
const redesignRoutes = [
  ["admin-dashboard", "/admin"],
  ["admin-timetable", "/admin/timetable"],
  ["admin-audit", "/admin/audit"],
  ["admin-sessions", "/admin/sessions"],
  ["admin-security", "/admin/security"],
  ["admin-content", "/admin/content"],
  ["admin-students", "/admin/students"],
  ["admin-enrollments", "/admin/enrollments"],
  ["admin-upload", "/admin/upload"],
  ["admin-hls-vault", "/admin/hls-vault"],
  ["admin-capabilities", "/admin/capabilities"],
  ["admin-server-health", "/admin/server-health"],
  ["admin-session-create", "/admin/sessions/new"],
  ["admin-course-detail", "/admin/content/courses/mock-course"],
  ["admin-question-bank", "/admin/question-bank"],
  ["student-dashboard", "/dashboard"],
  ["student-courses", "/courses"],
  ["student-course-detail", "/courses/mock-course"],
  ["student-lesson", "/lessons/mock-lesson"],
  ["student-profile", "/profile"],
  ["student-history", "/exam-history"],
  ["student-progress", "/progress"],
  ["student-search", "/search"],
  ["student-schedule", "/tkb"],
];
const chromeOnlyRoutes = [
  ["student-exam-catalog", "/exam-room"],
  ["student-exam-list", "/exam-room/mock-room"],
];
const accountExamId = "00000000-0000-4000-8000-000000000001";
const protectedRegressionRoutes = [
  ["protected-guest-exam", "/exam/mock-guest-token-12345", ".guest-exam-page"],
  ["protected-legacy-guest-exam", "/guest/exam/mock-guest-token-12345", ".guest-exam-page"],
  ["protected-account-exam-dashboard", `/exam/${accountExamId}?mode=practice`, ".hsa-session-page .tsa-session-page"],
  ["protected-account-exam-confirm", `/exam/${accountExamId}/section/mock-account-section/confirm?mode=practice`, ".hsa-confirmation-page"],
  ["protected-account-exam-runner", `/exam/${accountExamId}/section/mock-account-section?mode=practice`, ".hsa-exam-page"],
  ["protected-exam-result", "/exam/result/mock-attempt-latest", ".exam-result-page"],
  ["protected-admin-exam-catalog", "/admin/exams", ".room-catalog-grid"],
  ["protected-admin-room-new", "/admin/exams/rooms/new", ".room-form-page"],
  ["protected-admin-room-workspace", "/admin/exams/rooms/mock-room", ".room-workspace-page"],
  ["protected-admin-room-edit", "/admin/exams/rooms/mock-room/edit", ".room-form-page"],
  ["protected-admin-exam-new", "/admin/exams/rooms/mock-room/exams/new", ".exam-create-page"],
  ["protected-admin-exam-workspace", "/admin/exams/mock-exam", ".exam-editor-page"],
  ["protected-admin-exam-access", "/admin/exams/mock-exam/access?slotId=mock-slot", ".admin-access-page"],
  ["protected-admin-exam-policy", "/admin/exams/mock-exam/policy", ".policy-page"],
  ["protected-admin-question-new", "/admin/exams/mock-exam/questions/new?section=mock-section", ".question-editor-page"],
  ["protected-admin-question-edit", "/admin/exams/mock-exam/questions/mock-question", ".question-editor-page"],
  ["protected-admin-section-editor", "/admin/exams/mock-exam/sections/mock-section/editor", ".question-editor-page"],
  ["protected-admin-exam-preview", "/admin/exams/mock-exam/preview", ".exam-preview-page"],
  ["protected-admin-section-preview", "/admin/exams/mock-exam/sections/mock-section/preview?draft=mock-draft", ".section-preview-page"],
  ["protected-admin-question-bank", "/admin/question-bank", ".question-bank-page"],
  ["protected-admin-session-results", "/admin/sessions/mock-session/results?examId=mock-exam&slotId=mock-slot&mode=both", ".admin-session-results"],
];
const protectedRegressionWidths = [1440, 768, 390, 320];
const requestedRoutes = new Set((process.env.SMOKE_ROUTES ?? "").split(",").map(value => value.trim()).filter(Boolean));
const focusedAudit = requestedRoutes.size > 0;
const roleProtectedRoutes = protectedRegressionRoutes.filter(([name]) => mockRole === "admin" || !name.startsWith("protected-admin"));
const protectedAuditRequested = !focusedAudit
  || roleProtectedRoutes.some(([name]) => requestedRoutes.has(name))
  || requestedRoutes.has("student-exam-catalog")
  || requestedRoutes.has("student-exam-list");
const roleAuditRoutes = mockRole === "student"
  ? [...redesignRoutes.filter(([name]) => name.startsWith("student-")), ...chromeOnlyRoutes]
  : [...redesignRoutes, ...chromeOnlyRoutes];
const allAuditRoutes = roleAuditRoutes;
const auditRoutes = requestedRoutes.size ? allAuditRoutes.filter(([name]) => requestedRoutes.has(name)) : allAuditRoutes;
const startPath = process.env.SMOKE_START_PATH ?? (mockRole === "student" ? "/dashboard" : "/admin");
const stressEnabled = process.env.SMOKE_STRESS === "1";
const extendedInteractions = process.env.SMOKE_EXTENDED_INTERACTIONS !== "0";
const resourceModalEnabled = process.env.SMOKE_RESOURCE_MODAL === "1";
const courseCoverEnabled = process.env.SMOKE_COURSE_COVER === "1";
const outputDir = process.env.SMOKE_OUTPUT_DIR ?? "artifacts/product-shell-ui-audit";
const reportFile = process.env.SMOKE_REPORT_FILE ?? "";
const quietOutput = process.env.SMOKE_QUIET === "1";

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = [];
const runtimeIssues = [];
const expectedMockFailureMessages = [];
page.on("pageerror", error => runtimeIssues.push({ type: "pageerror", text: error.message, url: page.url(), viewport: page.viewportSize() }));
page.on("console", message => {
  if (message.type() !== "error") return;
  if (mockAuth && message.text().includes("/realtime/v1/websocket") && message.text().includes("ERR_NAME_NOT_RESOLVED")) return;
  if (message.text() === "Permissions policy violation: compute-pressure is not allowed in this document.") return;
  const expectedIndex = expectedMockFailureMessages.findIndex(expected => message.text().includes(expected));
  if (expectedIndex >= 0) {
    expectedMockFailureMessages.splice(expectedIndex, 1);
    return;
  }
  runtimeIssues.push({ type: "console", text: message.text(), url: page.url(), viewport: page.viewportSize() });
});

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
  cover_color: "#d25362",
  published: true,
  sort_order: 1,
  created_at: "2026-08-08T08:00:00.000Z",
};
const mockScheduleStart = new Date();
mockScheduleStart.setHours(10, 0, 0, 0);
const mockScheduleEnd = new Date(mockScheduleStart);
mockScheduleEnd.setHours(12, 0, 0, 0);
const mockRooms = [
  { id: "mock-room", title: "Kỳ thi thử tháng 8", description: "Lịch thi tổng hợp dành cho học viên đang ôn TSA và HSA.", exam_type: "HSA", registration_start: null, registration_end: null, exam_start: mockScheduleStart.toISOString(), exam_end: mockScheduleEnd.toISOString(), published: true, access_mode: "open", sort_order: 1 },
  { id: "mock-open-room", title: "Phòng luyện tự do", description: "Phòng luyện không giới hạn thời gian.", exam_type: "TSA", registration_start: null, registration_end: null, exam_start: null, exam_end: null, published: true, access_mode: "open", sort_order: 2 },
];
const mockExams = [
  { id: "mock-exam", room_id: "mock-room", title: "Đề TSA tổng hợp", description: "", dashboard_title: null, exam_type: "HSA", mode: "free", duration_minutes: 90, published: true, sort_order: 1, created_at: "2026-08-04T08:00:00.000Z" },
  { id: "mock-exam-2", room_id: "mock-room", title: "Đề TSA luyện tập số 2", description: "", dashboard_title: null, exam_type: "HSA", mode: "free", duration_minutes: 90, published: true, sort_order: 2, created_at: "2026-08-05T08:00:00.000Z" },
];
const mockSections = [
  { id: "mock-section", exam_id: "mock-exam", title: "Tư duy định lượng", duration_minutes: 90, sort_order: 1, subject_code: null },
  { id: "mock-section-2", exam_id: "mock-exam-2", title: "Tư duy định lượng", duration_minutes: 90, sort_order: 1, subject_code: null },
];
const mockAdminSections = [
  { id: "mock-section", exam_id: "mock-exam", title: "Tư duy định lượng", duration_minutes: 75, sort_order: 0, subject_code: null, source_latex: null },
  { id: "mock-section-language", exam_id: "mock-exam", title: "Tư duy ngôn ngữ", duration_minutes: 60, sort_order: 1, subject_code: null, source_latex: null },
  { id: "mock-section-science", exam_id: "mock-exam", title: "Khoa học", duration_minutes: 60, sort_order: 2, subject_code: null, source_latex: null },
];
const mockAccountSections = [
  { id: "mock-account-section", exam_id: accountExamId, title: "Tư duy định lượng", duration_minutes: 75, sort_order: 0, subject_code: null },
  { id: "mock-account-language", exam_id: accountExamId, title: "Tư duy ngôn ngữ", duration_minutes: 60, sort_order: 1, subject_code: null },
  { id: "mock-account-science", exam_id: accountExamId, title: "Khoa học", duration_minutes: 60, sort_order: 2, subject_code: null },
];
const mockAdminQuestion = {
  id: "mock-question",
  section_id: "mock-section",
  prompt: "Cho 2 + 2 bằng bao nhiêu?",
  question_type: "single",
  options: [{ value: "A", label: "4" }, { value: "B", label: "5" }],
  points: 1,
  sort_order: 0,
  passage: null,
  media_url: null,
  instruction: null,
  latex_source: null,
  solution_source: "Ta có 2 + 2 = 4.",
};
const mockAdminKeys = [{ question_id: "mock-question", correct_answer: "A", explanation: "Ta có 2 + 2 = 4." }];
const mockExamPolicy = {
  version: 1,
  examType: "HSA",
  mode: "practice",
  examCode: null,
  access: { audience: "account", accountRequired: true, rosterMode: "open", allowedClasses: [], maxAttempts: 0, passwordRequired: false },
  timing: { opensAt: null, closesAt: null, durationMinutes: 195, gracePeriodMinutes: 0 },
  randomization: { enabled: false, shuffleQuestions: false, shuffleOptions: false, questionPoolSize: 0, randomizationMode: "none", examCodeCount: 0, seedStrategy: "none", seed: null },
  navigation: { allowBacktrack: true, allowSkip: true, allowSectionBacktrack: true, requireAnswerBeforeNext: false, lockCompletedSections: false },
  integrity: { fullscreenRequired: false, warnOnExit: false, visibilityMonitoring: false, focusMonitoring: false, copyProtection: false, pasteProtection: false, contextMenuProtection: false, maxConcurrentDevices: 1 },
  release: { score: "after_submit", answers: "after_submit", solutions: "after_submit", scoreThreshold: 0, answerThreshold: 0, hideWrongAnswers: false, releaseAt: null },
  network: { showSaveState: true, allowOfflineDraft: true },
  review: { manualReviewRequired: false, allowScoreOverride: false, regradeVersion: 1 },
};
const mockParsedPreviewQuestion = {
  source: "\\begin{ex}Cho 2 + 2 bằng bao nhiêu?\\choice{\\True 4}{5}\\loigiai{Ta có 2 + 2 = 4.}\\end{ex}",
  body: "Cho 2 + 2 bằng bao nhiêu?",
  prompt: "Cho 2 + 2 bằng bao nhiêu?",
  questionType: "single",
  optionColumns: 1,
  detectedCommands: ["choice", "loigiai"],
  options: [{ value: "A", label: "4", correct: true }, { value: "B", label: "5" }],
  correctAnswer: "A",
  solution: "Ta có 2 + 2 = 4.",
};
const mockSectionPreviewDraft = {
  version: 1,
  examTitle: "Đề HSA tổng hợp",
  sectionTitle: "Tư duy định lượng",
  durationMinutes: 75,
  questions: [{ parsed: mockParsedPreviewQuestion }],
};
const mockAttemptYear = new Date().getFullYear();
const mockAttempts = [
  { id: "mock-attempt-latest", exam_id: "mock-exam", exam_type: "HSA", title: "Đề TSA tổng hợp", status: "graded", score: 87.5, correct_answers: 42, total_questions: 50, started_at: `${mockAttemptYear}-08-09T07:00:00.000Z`, submitted_at: `${mockAttemptYear}-08-09T08:12:00.000Z`, duration_seconds: 4320 },
  { id: "mock-attempt-first", exam_id: "mock-exam", exam_type: "TSA", title: "Đề TSA luyện tập số 2", status: "completed", score: 72, correct_answers: 36, total_questions: 50, started_at: `${mockAttemptYear}-08-06T07:00:00.000Z`, submitted_at: `${mockAttemptYear}-08-06T08:18:00.000Z`, duration_seconds: 4680 },
];
const mockActiveAttempt = {
  id: "mock-account-attempt",
  exam_id: accountExamId,
  mode: "practice",
  section_id: "mock-account-section",
  student_id: mockUser.id,
  status: "in_progress",
  score: 0,
  correct_answers: 0,
  total_questions: 1,
  submitted_at: null,
  started_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  deadline_at: new Date(Date.now() + 73 * 60 * 1000).toISOString(),
  section_started_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  current_section_id: "mock-account-section",
  answers: {},
  flagged_questions: [],
  progress_version: 0,
  network_state: "online",
  policy: mockExamPolicy,
};
const mockSecurityUser = { id: "11111111-1111-4111-8111-111111111111", full_name: "Nguyễn Minh Anh với tên tiếng Việt đủ dài để kiểm tra giao diện", student_code: "REMIX000128", email: "student.with.a.long.address@example.com", status: "active", account_status: "active", violation_count: 0, banned_at: null, banned_until: null, ban_reason: null, ban_event_id: null };
const mockSession = { id: "22222222-2222-4222-8222-222222222222", kind: "both", exam_id: "mock-exam", room_id: "mock-room", name: "Kíp thi thử có tên tiếng Việt dài để kiểm tra khả năng xuống dòng an toàn", exam_title: "Đề đánh giá năng lực tổng hợp", exam_type: "HSA", room_title: "Phòng luyện đánh giá năng lực", starts_at: "2026-08-10T08:00:00.000Z", ends_at: "2026-08-10T10:00:00.000Z", enabled: true, results_released_at: null, token_hint: "ABCD", attempt_count: 18, submitted_count: 12 };
const mockAuditItems = [
  { id: "exam:1", source: "exam", action: "create_exam_access_slot", status: "succeeded", admin_id: "mock-admin", admin_name: "Nguyễn Minh Anh", target_id: "mock-room", target_name: "Phòng thi", target_code: "mock-room", context: "Kíp thi", reason: "", created_at: "2026-08-09T08:20:00.000Z", completed_at: "2026-08-09T08:20:04.000Z" },
  { id: "account:2", source: "account", action: "trust_device", status: "recorded", admin_id: "mock-admin", admin_name: "Nguyễn Minh Anh", target_id: "mock-student-2", target_name: "Lê Gia Bảo", target_code: "REMIX000129", context: "Bảo mật tài khoản", reason: "Thiết bị học tập đã được xác minh.", created_at: "2026-08-09T08:10:00.000Z", completed_at: "2026-08-09T08:10:00.000Z" },
  { id: "exam:3", source: "exam", action: "extend_exam_attempt_time", status: "failed", admin_id: "mock-admin", admin_name: "Nguyễn Minh Anh", target_id: "mock-exam", target_name: "Đề thi", target_code: "mock-exam", context: "Đề thi", reason: "", created_at: "2026-08-09T08:00:00.000Z", completed_at: "2026-08-09T08:00:02.000Z" },
];
const mockLessonResources = [
  { id: "mock-video-resource", lesson_id: "mock-lesson", title: "Video bài giảng TSA", resource_type: "youtube", allow_download: false, sort_order: 1, provider_metadata: {}, videoToken: "mock-video-token" },
  { id: "mock-pdf-resource", lesson_id: "mock-lesson", title: "Tài liệu bài học HSA", resource_type: "storage_pdf", allow_download: true, sort_order: 2, provider_metadata: {}, videoToken: "mock-pdf-token" },
];
const mockMiddleLessonResources = [
  { id: "mock-video-resource-middle", lesson_id: "mock-lesson-middle", title: "Video khảo sát hàm số", resource_type: "youtube", allow_download: false, sort_order: 1, provider_metadata: {}, videoToken: "mock-video-token-middle" },
];
const mockLastLessonResources = [
  { id: "mock-video-resource-last", lesson_id: "mock-lesson-last", title: "Video tích phân cuối khóa", resource_type: "youtube", allow_download: false, sort_order: 1, provider_metadata: {}, videoToken: "mock-video-token-last" },
];
const mockLessonRows = [
  { id: "mock-lesson", chapter_id: "mock-chapter", title: "Ôn tập nền tảng", description: "Bài học kết hợp video TSA và tài liệu HSA.", published: true, sort_order: 0 },
  { id: "mock-lesson-middle", chapter_id: "mock-chapter", title: "Khảo sát hàm số", description: "Bài học giữa khóa để kiểm tra điều hướng.", published: true, sort_order: 1 },
  { id: "mock-lesson-last", chapter_id: "mock-chapter-last", title: "Tích phân tổng hợp", description: "Bài học cuối khóa để kiểm tra trạng thái biên.", published: true, sort_order: 0 },
];
const mockLessonResourcesByLesson = new Map([
  ["mock-lesson", mockLessonResources],
  ["mock-lesson-middle", mockMiddleLessonResources],
  ["mock-lesson-last", mockLastLessonResources],
]);
const mockLessonCurriculum = [
  {
    id: "mock-chapter",
    title: "Hàm số",
    sort_order: 0,
    lessons: [
      { ...mockLessonRows[0], resources: mockLessonResources },
      { ...mockLessonRows[1], resources: mockMiddleLessonResources },
    ],
  },
  {
    id: "mock-chapter-last",
    title: "Tích phân",
    sort_order: 1,
    lessons: [{ ...mockLessonRows[2], resources: mockLastLessonResources }],
  },
];
const mockGuestMeta = {
  slot: {
    id: "mock-guest-slot",
    name: "Kíp luyện HSA",
    starts_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    grace_period_minutes: 15,
    has_password: false,
  },
  exam: {
    id: "mock-guest-exam",
    title: "Phòng luyện đánh giá năng lực HSA",
    description: "Giao diện vào phòng thi dành cho học viên AECK.",
    exam_type: "HSA",
    duration_minutes: 90,
  },
  room: { title: "Không gian luyện HSA", exam_type: "HSA" },
  section: null,
  settings: {
    identityFields: [
      { key: "full_name", label: "Họ và tên", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
    ],
    maxAttempts: 1,
    autoMonitor: "off",
    hideGroupHeaders: false,
    resetQuestionIndex: false,
  },
  phase: "open",
  serverTime: new Date().toISOString(),
};
const mockPdfDocument = await PDFDocument.create();
mockPdfDocument.addPage([595, 842]);
const mockPdfBase64 = Buffer.from(await mockPdfDocument.save()).toString("base64");
let mockAuthStorage = null;
let failNextLogout = false;
let failNextVideoToken = false;

function jsonResponse(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function encryptMockExamPayload(payload, clientPublicKey, expectedBinding) {
  const subtle = webcrypto.subtle;
  const clientKey = await subtle.importKey("jwk", clientPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const serverKeyPair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const sharedSecret = await subtle.deriveBits({ name: "ECDH", public: clientKey }, serverKeyPair.privateKey, 256);
  const hkdfKey = await subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const binding = { version: 1, ...expectedBinding, expiresAt };
  const encoder = new TextEncoder();
  const aad = encoder.encode(JSON.stringify(binding));
  const key = await subtle.deriveKey({
    name: "HKDF",
    hash: "SHA-256",
    salt,
    info: encoder.encode(`remix-exam-content:v1:${expectedBinding.kind}`),
  }, hkdfKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key, encoder.encode(JSON.stringify(payload)));
  return {
    version: 1,
    algorithm: "ECDH-P256+HKDF-SHA256+A256GCM",
    serverPublicKey: await subtle.exportKey("jwk", serverKeyPair.publicKey),
    salt: base64Url(salt),
    iv: base64Url(iv),
    aad: base64Url(aad),
    ciphertext: base64Url(new Uint8Array(ciphertext)),
    expiresAt,
  };
}

async function waitForRouteSurface() {
  await page.locator(".ui-shell, main.login-page, .exam-shell, .guest-exam-page, .guest-exam-state").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForFunction(
    () => !document.body.innerText.includes("Đang xác thực tài khoản"),
    null,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(mockAuth ? 250 : 100);
}

function isNavigationSnapshotRace(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Execution context was destroyed")
    || message.includes("Cannot find context with specified id")
    || message.includes("most likely because of a navigation");
}

async function installMockAuth() {
  if (!mockAuth || !supabaseUrl) return;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: mockUser.id, exp: expiresAt, role: "authenticated" })}.mock-signature`;
  mockAuthStorage = { storageKey: `sb-${projectRef}-auth-token`, session: { access_token: accessToken, refresh_token: "mock-refresh", expires_in: 3600, expires_at: expiresAt, token_type: "bearer", user: mockUser } };
  await page.addInitScript(({ storageKey, user, accessToken, expiresAt, sectionPreviewDraft }) => {
    localStorage.setItem(storageKey, JSON.stringify({ access_token: accessToken, refresh_token: "mock-refresh", expires_in: 3600, expires_at: expiresAt, token_type: "bearer", user }));
    localStorage.setItem("exam-preview:mock-draft", JSON.stringify(sectionPreviewDraft));
  }, { storageKey: mockAuthStorage.storageKey, user: mockUser, accessToken, expiresAt, sectionPreviewDraft: mockSectionPreviewDraft });

  await page.route("**/*", async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === new URL(supabaseUrl).origin) {
      if (requestUrl.pathname === "/auth/v1/user") return route.fulfill(jsonResponse({ user: mockUser }));
      if (requestUrl.pathname === "/auth/v1/logout") {
        if (failNextLogout) {
          failNextLogout = false;
          return route.fulfill(jsonResponse({ message: "Mock logout unavailable" }, 503));
        }
        return route.fulfill({ status: 204, body: "" });
      }
      if (requestUrl.pathname.startsWith("/rest/v1/")) {
        const table = requestUrl.pathname.slice("/rest/v1/".length);
        const rows = table === "profiles"
          ? [mockProfile, { id: "mock-student-2", full_name: "Lê Gia Bảo", student_code: "REMIX000129", role: "student", status: "active", created_at: "2026-08-07T08:00:00.000Z" }]
          : table === "courses" ? [mockCourse]
            : table === "course_enrollments" ? [{ student_id: mockUser.id, course_id: mockCourse.id, courses: mockCourse }]
              : table === "exam_rooms" ? mockRooms
                : table === "exams" ? mockExams
                  : table === "exam_room_enrollments" ? []
                : table === "chapters" ? [{ id: "mock-chapter", course_id: mockCourse.id, title: "Hàm số", sort_order: 0 }, { id: "mock-chapter-last", course_id: mockCourse.id, title: "Tích phân", sort_order: 1 }]
                      : table === "lessons" ? mockLessonRows
                        : [];
        const objectProfileResponse = requestUrl.searchParams.get("id")?.includes(`eq.${mockUser.id}`) && table === "profiles";
        const requestedLessonId = table === "lessons"
          ? mockLessonRows.find(item => requestUrl.searchParams.get("id")?.includes(`eq.${item.id}`))?.id ?? ""
          : "";
        const requestedLesson = mockLessonRows.find(item => item.id === requestedLessonId);
        const requestedChapter = requestedLesson?.chapter_id === "mock-chapter-last"
          ? { course_id: mockCourse.id, title: "Tích phân", sort_order: 1, courses: { title: mockCourse.title } }
          : { course_id: mockCourse.id, title: "Hàm số", sort_order: 0, courses: { title: mockCourse.title } };
        const lessonWithRelations = {
          ...requestedLesson,
          chapters: requestedChapter,
        };
        return route.fulfill(jsonResponse(objectProfileResponse ? rows[0] : requestedLesson ? lessonWithRelations : rows));
      }
    }
    if (requestUrl.origin === new URL(baseUrl).origin && requestUrl.pathname.startsWith("/api/")) {
      if (requestUrl.pathname === "/api/guest-exams" && route.request().method() === "GET") return route.fulfill(jsonResponse(mockGuestMeta));
      if (requestUrl.pathname === "/api/security/session") return route.fulfill(jsonResponse({ allowed: true, exempt: true, serverTime: new Date().toISOString() }));
      if (requestUrl.pathname === "/api/lesson-resources") {
        const requestedLessonId = requestUrl.searchParams.get("lessonId") ?? "mock-lesson";
        return route.fulfill(jsonResponse({ resources: mockLessonResourcesByLesson.get(requestedLessonId) ?? [], curriculum: mockLessonCurriculum }));
      }
      if (requestUrl.pathname === "/api/video-token") {
        if (failNextVideoToken) {
          failNextVideoToken = false;
          return route.fulfill(jsonResponse({ error: "Không thể mở nội dung thử nghiệm." }, 503));
        }
        const body = JSON.parse(route.request().postData() || "{}");
        if (body.videoToken === "mock-video-token") return route.fulfill(jsonResponse({ type: "youtube", title: "Video bài giảng TSA", youtubeId: "dQw4w9WgXcQ", start: 0 }));
        if (body.videoToken === "mock-video-token-middle") return route.fulfill(jsonResponse({ type: "youtube", title: "Video khảo sát hàm số", youtubeId: "dQw4w9WgXcQ", start: 0 }));
        if (body.videoToken === "mock-video-token-last") return route.fulfill(jsonResponse({ type: "youtube", title: "Video tích phân cuối khóa", youtubeId: "dQw4w9WgXcQ", start: 0 }));
        if (body.videoToken === "mock-pdf-token") return route.fulfill(jsonResponse({ type: "storage_pdf", title: "Tài liệu bài học HSA", protectedContent: "pdf" }));
        return route.fulfill(jsonResponse({ error: "Token nội dung thử nghiệm không hợp lệ." }, 403));
      }
      if (requestUrl.pathname === "/api/resource-content") return route.fulfill(jsonResponse({ encoding: "base64", mimeType: "application/pdf", data: mockPdfBase64 }));
      if (requestUrl.pathname === "/api/exams/content" && route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        const index = Number(body.index) || 0;
        const question = { ...mockAdminQuestion, id: "mock-account-question", section_id: String(body.sectionId || "mock-account-section"), index };
        const envelope = await encryptMockExamPayload({
          kind: "question-group",
          attemptId: String(body.attemptId),
          sectionId: String(body.sectionId),
          requestedIndex: index,
          questionCount: 1,
          questions: [question],
          serverTime: new Date().toISOString(),
        }, body.clientPublicKey, { kind: "question", attemptId: String(body.attemptId), sectionId: String(body.sectionId), index, nonce: String(body.nonce) });
        return route.fulfill(jsonResponse(envelope));
      }
      if (requestUrl.pathname === "/api/exams/result-content" && route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        const resultAttempt = {
          ...mockAttempts[0],
          exam_id: accountExamId,
          mode: "practice",
          section_id: "mock-account-section",
          student_id: mockUser.id,
          answers: { "mock-account-question": "A" },
          flagged_questions: [],
        };
        const resultQuestion = { ...mockAdminQuestion, id: "mock-account-question", section_id: "mock-account-section" };
        const envelope = await encryptMockExamPayload({
          room: { ...mockRooms[0], exam_type: "HSA" },
          exam: { ...mockExams[0], id: accountExamId, exam_type: "HSA", duration_minutes: 195 },
          sections: mockAccountSections,
          questions: [resultQuestion],
          attempt: resultAttempt,
          keys: [{ question_id: resultQuestion.id, correct_answer: "A", explanation: "Ta có 2 + 2 = 4." }],
          resultVisibility: { scoreVisible: true, answersVisible: true, solutionsVisible: true },
        }, body.clientPublicKey, { kind: "result", attemptId: String(body.attemptId), sectionId: null, index: null, nonce: String(body.nonce) });
        return route.fulfill(jsonResponse(envelope));
      }
      if (requestUrl.pathname === "/api/exams" && requestUrl.searchParams.get("scope") === "rooms") return route.fulfill(jsonResponse({ rooms: mockRooms, exams: mockExams, attempts: mockAttempts }));
      if (requestUrl.pathname === "/api/exams" && requestUrl.searchParams.get("scope") === "room") return route.fulfill(jsonResponse({ room: mockRooms[0], exams: mockExams, sections: mockSections, attempts: mockAttempts }));
      if (requestUrl.pathname === "/api/exams" && requestUrl.searchParams.get("scope") === "history") return route.fulfill(jsonResponse({ attempts: mockAttempts }));
      if (requestUrl.pathname === "/api/exams" && requestUrl.searchParams.get("scope") === "exam") {
        const sectionId = requestUrl.searchParams.get("sectionId");
        return route.fulfill(jsonResponse({
          room: { ...mockRooms[0], exam_type: "HSA" },
          exam: { ...mockExams[0], id: accountExamId, exam_type: "HSA", duration_minutes: 195 },
          sections: mockAccountSections,
          questions: [],
          questionCounts: Object.fromEntries(mockAccountSections.map(section => [section.id, section.id === "mock-account-section" ? 1 : 0])),
          policy: mockExamPolicy,
          activeAttempt: sectionId ? mockActiveAttempt : null,
          subjectAttempts: [],
        }));
      }
      if (requestUrl.pathname === "/api/admin/exam-content") return route.fulfill(jsonResponse({
        rooms: mockRooms,
        exams: mockExams,
        sections: mockAdminSections,
        questions: [mockAdminQuestion],
        keys: mockAdminKeys,
      }));
      if (requestUrl.pathname === "/api/admin/exam-policy") return route.fulfill(jsonResponse({ policy: mockExamPolicy, presets: [], exam: { results_released_at: null } }));
      if (requestUrl.pathname === "/api/admin/exam-regrade") return route.fulfill(jsonResponse({
        questions: [{ id: mockAdminQuestion.id, section_id: mockAdminQuestion.section_id, section_title: mockAdminSections[0].title, prompt: mockAdminQuestion.prompt, question_type: mockAdminQuestion.question_type }],
        versions: [],
        runs: [],
      }));
      if (requestUrl.pathname === "/api/admin/exam-operations") return route.fulfill(jsonResponse({
        session: { id: "mock-session", name: mockSession.name, mode: "both", examTitle: mockSession.exam_title, examType: mockSession.exam_type, roomId: mockSession.room_id, startsAt: mockSession.starts_at, endsAt: mockSession.ends_at, enabled: true, resultsReleasedAt: null, tokenHint: mockSession.token_hint },
        attempts: [{ id: "mock-result-attempt", kind: "account", candidate_name: "Trần Minh Anh", candidate_code: "REMIX000128", status: "graded", score: 87.5, correct_answers: 1, total_questions: 1, answers: { "mock-question": "A" }, network_state: "online", monitor_events: [], started_at: mockAttempts[0].started_at, submitted_at: mockAttempts[0].submitted_at, duration_seconds: mockAttempts[0].duration_seconds }],
        stats: { total: 1, inProgress: 0, submitted: 1, expired: 0, offline: 0, autosaveErrors: 0, monitorEvents: 0, fullscreenExits: 0, visibilityEvents: 0, focusEvents: 0, tabExits: 0, suspectedAppSwitches: 0, attentionAwaySeconds: 0, longestAwaySeconds: 0, fullscreenAwaySeconds: 0, averageScore: 87.5, completionRate: 100 },
        questionStats: [{ id: "mock-question", prompt: mockAdminQuestion.prompt, attempted: 1, correct: 1, accuracy: 100 }],
      }));
      if (requestUrl.pathname === "/api/admin/users") return route.fulfill(jsonResponse({ users: [{ id: "mock-student-2", email: "student@example.com" }] }));
      if (requestUrl.pathname === "/api/admin/course-covers" && route.request().method() === "POST") {
        mockCourse.cover_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
        return route.fulfill(jsonResponse({ assetName: "mock-cover.png", url: mockCourse.cover_url, contentType: "image/png" }, 201));
      }
      if (requestUrl.pathname === "/api/admin/course-covers" && route.request().method() === "DELETE") {
        mockCourse.cover_url = null;
        return route.fulfill(jsonResponse({ deleted: true, assetName: "mock-cover.png" }));
      }
      if (requestUrl.pathname === "/api/admin/security" && !requestUrl.searchParams.has("userId")) {
        return route.fulfill(jsonResponse({
          items: [mockSecurityUser],
          total: 1,
          page: 1,
          limit: 20,
          hasNextPage: false,
          serverTime: "2026-08-09T08:01:00.000Z",
        }));
      }
      if (requestUrl.pathname === "/api/admin/security" && requestUrl.searchParams.has("userId")) return route.fulfill(jsonResponse({ profile: mockSecurityUser, devices: [{ id: "33333333-3333-4333-8333-333333333333", device_name: "Máy tính xách tay Windows", browser: "Chrome", operating_system: "Windows 11", trusted_by_admin: false, verified_at: null, last_used_at: "2026-08-09T08:00:00.000Z", revoked_at: null }], sessions: [], events: [], violations: [], actions: [], serverTime: "2026-08-09T08:01:00.000Z" }));
      if (requestUrl.pathname === "/api/admin/sessions") return route.fulfill(jsonResponse({ items: [mockSession], summary: { upcoming: 1, open: 0, ended: 0, disabled: 0 }, total: 1, hasNextPage: false, page: 1, limit: 20 }));
      if (requestUrl.pathname === "/api/admin/timetable" && route.request().method() === "GET") {
        return route.fulfill(jsonResponse({
          rooms: mockRooms.map(room => ({ ...room, created_at: "2026-08-08T08:00:00.000Z", exam_count: mockExams.filter(exam => exam.room_id === room.id).length, published_exam_count: mockExams.filter(exam => exam.room_id === room.id && exam.published).length })),
          serverTime: new Date().toISOString(),
        }));
      }
      if (requestUrl.pathname === "/api/admin/timetable" && route.request().method() === "PATCH") {
        const body = JSON.parse(route.request().postData() || "{}");
        const room = mockRooms.find(item => item.id === body.roomId);
        if (!room) return route.fulfill(jsonResponse({ error: "Không tìm thấy phòng thi." }, 404));
        room.exam_start = body.startAt;
        room.exam_end = body.endAt;
        return route.fulfill(jsonResponse({ room: { ...room, created_at: "2026-08-08T08:00:00.000Z" } }));
      }
      if (requestUrl.pathname === "/api/admin/audit") {
        const source = requestUrl.searchParams.get("source");
        const status = requestUrl.searchParams.get("status");
        const query = (requestUrl.searchParams.get("q") || "").toLocaleLowerCase("vi-VN");
        const items = mockAuditItems.filter(item => (!source || item.source === source) && (!status || item.status === status) && (!query || JSON.stringify(item).toLocaleLowerCase("vi-VN").includes(query)));
        return route.fulfill(jsonResponse({ items, summary: { total: mockAuditItems.length, exam: 2, account: 1, failed: 1, pending: 0 }, total: items.length, page: 1, limit: 20, hasNextPage: false, serverTime: "2026-08-09T08:21:00.000Z" }));
      }
      if (requestUrl.pathname === "/api/admin/exam-access") return route.fulfill(jsonResponse({ exam: { settings: {} }, sections: mockAdminSections, slots: [{ id: "mock-slot", exam_id: "mock-exam", section_id: null, name: "Kíp thi sáng", starts_at: "2026-08-10T08:00:00.000Z", ends_at: "2026-08-10T10:00:00.000Z", enabled: true, results_released_at: null, export_open_at: null, export_close_at: null, grace_period_minutes: 30, token_hint: "ABCD", created_at: "2026-08-08T08:00:00.000Z" }], attempts: [] }));
      if (requestUrl.pathname === "/api/admin/images" || requestUrl.pathname === "/api/admin/exam-images") return route.fulfill(jsonResponse({ images: [] }));
      return route.fulfill(jsonResponse({}));
    }
    return route.continue();
  });
}

async function inspect(name, path, width, screenshot = false, expectedSurface = "", reuseCurrentRoute = false) {
  await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
  if (mockAuth && mockAuthStorage && page.url().startsWith(baseUrl)) {
    await page.evaluate(({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)), mockAuthStorage);
  }
  const targetUrl = new URL(path, baseUrl);
  const currentUrl = page.url().startsWith(baseUrl) ? new URL(page.url()) : null;
  const canReuse = reuseCurrentRoute && currentUrl?.pathname === targetUrl.pathname && currentUrl.search === targetUrl.search;
  if (!canReuse) await page.goto(targetUrl.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
  for (let surfaceAttempt = 0; surfaceAttempt < 2; surfaceAttempt += 1) {
    await page.waitForTimeout(mockAuth ? 1_200 : 350);
    try {
      await waitForRouteSurface();
      if (expectedSurface) await page.locator(expectedSurface).first().waitFor({ state: "visible", timeout: 10_000 });
      break;
    } catch (error) {
      if (surfaceAttempt === 1) throw error;
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    }
  }
  let state;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      state = await page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector(".ui-shell");
    const controls = [...document.querySelectorAll("button, a, input, select, textarea")];
    const visibleControls = controls.filter(control => {
      const rect = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      const visuallyHiddenFile = control instanceof HTMLInputElement && control.type === "file" && rect.width <= 2 && rect.height <= 2;
      return !visuallyHiddenFile && rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
    const activeStudentNav = document.querySelector(".student-sidebar-nav .student-nav-primary.active, .student-sidebar-nav .student-nav-children a.active, .student-sidebar-nav .student-nav-disclosure.active-parent > summary");
    const activeStudentNavStyle = activeStudentNav ? getComputedStyle(activeStudentNav) : null;
    const adminNavItems = [...document.querySelectorAll(".admin-sidebar-nav-item")];
    const adminNavItemGeometry = adminNavItems.map(item => {
      const icon = [...item.children].find(child => child.tagName.toLowerCase() === "svg");
      const label = [...item.children].find(child => child.tagName.toLowerCase() === "span");
      return {
        iconPresent: Boolean(icon),
        iconVisible: Boolean(icon && getComputedStyle(icon).display !== "none" && icon.getBoundingClientRect().width > 0),
        labelPresent: Boolean(label && label.textContent?.trim()),
      };
    });
    const unnamed = visibleControls.filter(control => {
      const text = control.textContent?.trim();
      const label = control.getAttribute("aria-label") || control.getAttribute("title") || control.getAttribute("placeholder");
      const labelled = control.labels?.length || control.getAttribute("aria-labelledby");
      return !text && !label && !labelled && control.getAttribute("type") !== "hidden";
    });
    const outsideViewportControls = visibleControls.filter(control => {
      if (window.innerWidth <= 767 && control.closest(".sidebar:not(.mobile-open)")) return false;
      const examSidebar = control.closest(".math-exam-sidebar");
      if (examSidebar && !examSidebar.classList.contains("open") && getComputedStyle(examSidebar).transform !== "none") return false;
      const rect = control.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1);
    }).map(control => {
      const rect = control.getBoundingClientRect();
      const scrollContainer = control.closest(".student-timetable-scroll, .admin-timetable-week-grid, .exam-part-sidebar, .access-table-wrap");
      return {
        tag: control.tagName.toLowerCase(),
        className: control.className,
        text: control.textContent?.trim().slice(0, 40) ?? "",
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        scrollRegion: scrollContainer?.classList.contains("student-timetable-scroll")
          ? "student-timetable-scroll"
          : scrollContainer?.classList.contains("admin-timetable-week-grid")
            ? "admin-timetable-week-grid"
          : scrollContainer?.classList.contains("exam-part-sidebar")
            ? "exam-part-sidebar"
            : scrollContainer?.classList.contains("access-table-wrap")
              ? "access-table-wrap"
              : null,
      };
    });
    return {
      url: window.location.pathname,
      viewport: window.innerWidth,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      shell: shell?.className ?? null,
      guestExam: Boolean(document.querySelector(".guest-exam-page")),
      login: Boolean(document.querySelector("main.login-page")),
      adminNavItems: adminNavItems.length,
      adminNavItemsWithIcons: adminNavItemGeometry.filter(item => item.iconPresent).length,
      adminNavItemsWithVisibleIcons: adminNavItemGeometry.filter(item => item.iconVisible).length,
      adminNavItemsWithLabels: adminNavItemGeometry.filter(item => item.labelPresent).length,
      unnamedControls: unnamed.length,
      unnamedControlDetails: unnamed.map(control => ({ tag: control.tagName.toLowerCase(), type: control.getAttribute("type"), className: control.className, id: control.id })),
      controlsOutsideViewport: outsideViewportControls.filter(control => !control.scrollRegion).length,
      scrollRegionControlsOutsideViewport: outsideViewportControls.filter(control => control.scrollRegion).length,
      outsideViewportControls,
      activeStudentNav: activeStudentNav?.textContent?.trim().slice(0, 80) ?? null,
      activeStudentNavColor: activeStudentNavStyle?.color ?? null,
      activeStudentNavBackground: activeStudentNavStyle?.backgroundColor ?? null,
      undersizedControls: visibleControls.filter(control => {
        const rect = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        const hiddenFileInput = control instanceof HTMLInputElement
          && control.type === "file"
          && (style.opacity === "0" || style.visibility === "hidden" || rect.width <= 2 || rect.height <= 2);
        const inlineTextLink = control instanceof HTMLAnchorElement
          && !control.querySelector("svg, img")
          && style.borderStyle === "none"
          && (style.backgroundColor === "rgba(0, 0, 0, 0)" || style.backgroundColor === "transparent");
        return rect.width > 0 && !hiddenFileInput && !inlineTextLink && (rect.width < 24 || rect.height < 24);
      }).map(control => {
        const rect = control.getBoundingClientRect();
        return { tag: control.tagName.toLowerCase(), className: control.className, width: Math.round(rect.width), height: Math.round(rect.height), text: control.textContent?.trim().slice(0, 40) ?? "" };
      }),
    };
      });
      break;
    } catch (error) {
      if (!isNavigationSnapshotRace(error) || attempt === 2) throw error;
      await page.waitForLoadState("domcontentloaded");
      await waitForRouteSurface();
    }
  }
  if (!state) throw new Error(`Unable to inspect ${path} at ${width}px.`);
  if (mockRole === "admin" && path.startsWith("/admin") && state.adminNavItems > 0 && (
    state.adminNavItemsWithIcons !== state.adminNavItems
    || state.adminNavItemsWithVisibleIcons !== state.adminNavItems
    || state.adminNavItemsWithLabels !== state.adminNavItems
  )) {
    throw new Error(`Admin sidebar icon/label geometry failed at ${width}px: ${JSON.stringify(state)}`);
  }
  if (screenshot) await page.screenshot({ path: join(outputDir, `${name}-${width}.png`), fullPage: true });
  report.push({ name, path, width, ...state });
}

async function inspectStress(name, path, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(mockAuth ? 1_200 : 350);
  await waitForRouteSurface();
  const result = await page.evaluate(() => {
    const longVietnamese = "Nội dung tiếng Việt rất dài để kiểm tra khả năng xuống dòng, thứ bậc thông tin và việc các hành động quan trọng luôn còn nhìn thấy trên màn hình hẹp";
    const unbroken = "CHUOIKHONGCODAUCACTRONGIUPHATHIENOVERFLOW".repeat(4);
    const targets = [...document.querySelectorAll(".reference-room-card-title h2, .admin-kpi-label, .admin-action-text b, .admin-session-title-row h3, .security-user-grid b, .overview-card-head b, .course-body h3, .history-exam b, .detail-row b, .breadcrumb-course, .breadcrumb-current, .study-lesson-context h1, .study-lesson-context p, .curriculum-lesson-title b, .curriculum-resource b")].slice(0, 8);
    targets.forEach((target, index) => { target.textContent = index === targets.length - 1 ? unbroken : longVietnamese; });
    document.documentElement.style.fontSize = "200%";
    const root = document.documentElement;
    const controls = [...document.querySelectorAll("button, a, input, select, textarea")];
    const outsideViewportControls = controls.filter(control => {
      if (window.innerWidth <= 767 && control.closest(".sidebar:not(.mobile-open)")) return false;
      if (control.closest(".curriculum-panel:not(.mobile-open)")) return false;
      const rect = control.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1);
    });
    return {
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      controlsOutsideViewport: outsideViewportControls.filter(control => !control.closest(".student-timetable-scroll, .admin-timetable-week-grid")).length,
      scrollRegionControlsOutsideViewport: outsideViewportControls.filter(control => control.closest(".student-timetable-scroll, .admin-timetable-week-grid")).length,
      outsideViewportControls: outsideViewportControls.map(control => {
        const rect = control.getBoundingClientRect();
        return { tag: control.tagName.toLowerCase(), className: control.className, text: control.textContent?.trim().slice(0, 80) ?? "", left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
      }),
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
    const fullLogo = sidebar?.querySelector(".mobile-sidebar-logo-full");
    const compactLogo = sidebar?.querySelector(".mobile-sidebar-logo-compact");
    const fullRect = fullLogo?.getBoundingClientRect();
    const compactRect = compactLogo?.getBoundingClientRect();
    return {
      role: sidebar?.getAttribute("role"),
      modal: sidebar?.getAttribute("aria-modal"),
      mainInert: main instanceof HTMLElement ? main.inert : false,
      focusInside: Boolean(sidebar?.contains(document.activeElement)),
      drawerFullLogoVisible: Boolean(fullLogo && getComputedStyle(fullLogo).display !== "none" && fullRect && fullRect.width > 0 && fullRect.height > 0),
      drawerFullLogoSource: fullLogo?.getAttribute("src") ?? null,
      drawerCompactLogoVisible: Boolean(compactLogo && getComputedStyle(compactLogo).display !== "none" && compactRect && compactRect.width > 0 && compactRect.height > 0),
    };
  });
  await page.screenshot({ path: join(outputDir, `${mockRole}-drawer-open-390.png`), fullPage: true });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  const restored = await page.evaluate(() => document.activeElement?.classList.contains("mobile-menu") ?? false);
  report.push({ name: `${mockRole}-drawer-keyboard`, path, width: 390, ...skipLink, ...opened, restoredFocus: restored });
  if (!opened.drawerFullLogoVisible || opened.drawerFullLogoSource !== "/logo_aeck.svg" || opened.drawerCompactLogoVisible) {
    throw new Error(`${mockRole} drawer logo variant failed: ${JSON.stringify(opened)}`);
  }
}

async function inspectAccountMenu() {
  const accountMenuPath = mockRole === "admin" ? "/admin" : "/dashboard";
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto(`${baseUrl}${accountMenuPath}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForRouteSurface();
    const trigger = page.locator(".account-trigger");
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await page.locator("#account-menu:not([hidden])").waitFor({ state: "visible" });
    const opened = await page.evaluate(() => {
      const menu = document.querySelector("#account-menu");
      const avatar = document.querySelector(".account-trigger > .account-avatar");
      const menuRect = menu?.getBoundingClientRect();
      const avatarRect = avatar?.getBoundingClientRect();
      return {
        firstItemFocused: document.activeElement?.matches('[data-account-menu-item]:first-of-type') ?? false,
        avatarVisible: Boolean(avatar && getComputedStyle(avatar).display === "grid" && avatarRect && avatarRect.width > 0 && avatarRect.height > 0),
        menuInsideViewport: Boolean(menuRect && menuRect.left >= -1 && menuRect.right <= innerWidth + 1),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    await page.keyboard.press("ArrowDown");
    const secondItemFocused = await page.evaluate(() => document.activeElement?.matches('[data-account-menu-item]:last-of-type') ?? false);
    await page.keyboard.press("Escape");
    const escapeRestoredTrigger = await page.evaluate(() => document.activeElement?.classList.contains("account-trigger") ?? false);

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(50);
    const focusOutsideClosed = await page.locator("#account-menu").getAttribute("hidden") !== null;
    await page.screenshot({ path: join(outputDir, `${mockRole}-account-menu-${width}.png`), fullPage: true });
    const result = { name: `${mockRole}-account-menu-keyboard`, path: accountMenuPath, width, ...opened, secondItemFocused, escapeRestoredTrigger, focusOutsideClosed };
    report.push(result);
    if (!opened.firstItemFocused || !opened.avatarVisible || !opened.menuInsideViewport || opened.horizontalOverflow || !secondItemFocused || !escapeRestoredTrigger || !focusOutsideClosed) {
      throw new Error(`Account menu keyboard flow failed at ${width}px: ${JSON.stringify(result)}`);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}${accountMenuPath}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForRouteSurface();
  failNextLogout = true;
  expectedMockFailureMessages.push("status of 503");
  await page.locator(".account-trigger").click();
  await page.getByRole("menuitem", { name: /Đăng xuất/ }).click();
  await page.waitForURL(url => url.pathname === "/login" && url.searchParams.get("logoutWarning") === "1", { timeout: 5_000 });
  await page.getByText("Máy chủ chưa xác nhận thu hồi phiên", { exact: false }).waitFor({ state: "visible" });
  const failureEndedLocalSession = new URL(page.url()).pathname === "/login" && await page.locator(".account-trigger").count() === 0;
  await page.evaluate(({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)), mockAuthStorage);
  await page.goto(`${baseUrl}${accountMenuPath}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForRouteSurface();
  await page.locator(".account-trigger").click();
  await page.getByRole("menuitem", { name: /Đăng xuất/ }).click();
  await page.waitForURL(url => url.pathname === "/login" && url.searchParams.get("loggedOut") === "1" && !url.searchParams.has("logoutWarning"), { timeout: 5_000 });
  await page.getByText("Bạn đã đăng xuất an toàn khỏi thiết bị này.").waitFor({ state: "visible" });
  const result = { name: `${mockRole}-account-logout-feedback`, path: accountMenuPath, width: 1440, failureEndedLocalSession, successUrl: page.url() };
  report.push(result);
  if (!failureEndedLocalSession) throw new Error(`Account logout failure recovery failed: ${JSON.stringify(result)}`);
}

async function inspectLessonResources() {
  for (const width of [1440, 1100, 768, 390, 320]) {
    const usesCurriculumDrawer = width >= 1024 && width <= 1199;
    const studyRequests = { lesson: 0, curriculum: 0 };
    const recordStudyRequest = request => {
      const requestUrl = new URL(request.url());
      if (requestUrl.pathname === "/api/lesson-resources") studyRequests.curriculum += 1;
      if (requestUrl.pathname === "/rest/v1/lessons" && requestUrl.searchParams.has("id")) studyRequests.lesson += 1;
    };
    page.on("request", recordStudyRequest);
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto(`${baseUrl}/lessons/mock-lesson`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForRouteSurface();
    const resourcePicker = page.locator(".lesson-resource-picker");
    await resourcePicker.waitFor({ state: "visible", timeout: 10_000 });
    const pickerState = await page.evaluate(expectedCount => {
      const picker = document.querySelector(".lesson-resource-picker");
      const grid = document.querySelector(".lesson-resource-picker-grid");
      return {
        pickerVisible: Boolean(picker && picker.getBoundingClientRect().width > 0),
        choiceCount: document.querySelectorAll(".lesson-resource-choice").length,
        expectedCount,
        choiceIcons: [...document.querySelectorAll(".lesson-resource-choice svg")].map(icon => icon.getAttribute("data-icon")),
        curriculumIcons: [...document.querySelectorAll(".curriculum-resource svg")].map(icon => icon.getAttribute("data-icon")),
        playerAbsentBeforeSelection: !document.querySelector(".lesson-video, .lesson-document"),
        gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length : 0,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    }, mockLessonResources.length);
    await page.screenshot({ path: join(outputDir, `student-lesson-picker-${width}.png`), fullPage: true });
    if (!pickerState.pickerVisible || pickerState.choiceCount !== pickerState.expectedCount || !pickerState.playerAbsentBeforeSelection
      || pickerState.horizontalOverflow || pickerState.gridColumns !== (width >= 768 ? 2 : 1)
      || JSON.stringify(pickerState.choiceIcons) !== JSON.stringify(["play-circle", "file-pdf"])
      || !pickerState.curriculumIcons.includes("play-circle") || !pickerState.curriculumIcons.includes("file-pdf")) {
      throw new Error(`Study resource picker failed at ${width}px: ${JSON.stringify(pickerState)}`);
    }
    await resourcePicker.locator(".lesson-resource-choice").first().click();
    await page.locator('.lesson-video[title="Video bài giảng TSA"]').waitFor({ state: "visible", timeout: 10_000 });
    const videoState = await page.evaluate(() => ({
      lessonContext: document.querySelector(".study-lesson-context p")?.textContent?.trim() ?? "",
      resourceHeading: document.querySelector("#study-lesson-title")?.textContent?.trim() ?? "",
      videoVisible: Boolean(document.querySelector('.lesson-video[title="Video bài giảng TSA"]')),
      curriculumVisible: Boolean(document.querySelector(".lesson-nav.curriculum-panel")),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    let presentationStability = null;
    if (width === 1440) {
      await page.locator('.lesson-video[title="Video bài giảng TSA"]').evaluate(element => { element.dataset.studyPresentationStable = "true"; });
      const stablePlayer = () => page.locator('.lesson-video[title="Video bài giảng TSA"]').evaluate(element => element.dataset.studyPresentationStable === "true");
      const compactCourseTrigger = page.locator('[data-compact-nav-trigger="courses"]');
      const compactCourseFlyout = page.locator("#compact-nav-courses-popover");
      await compactCourseTrigger.click();
      await compactCourseFlyout.waitFor({ state: "visible" });
      const compactFlyoutGeometry = await page.evaluate(() => {
        const flyout = document.querySelector("#compact-nav-courses-popover");
        const flyoutBox = flyout?.getBoundingClientRect();
        const flyoutStyle = flyout ? getComputedStyle(flyout) : null;
        const itemHeights = [...(flyout?.querySelectorAll(":scope > a") ?? [])].map(item => Math.round(item.getBoundingClientRect().height));
        return {
          left: Math.round(flyoutBox?.left ?? 0),
          width: Math.round(flyoutBox?.width ?? 0),
          paddingTop: flyoutStyle?.paddingTop ?? "",
          paddingBottom: flyoutStyle?.paddingBottom ?? "",
          borderTopWidth: flyoutStyle?.borderTopWidth ?? "",
          borderRadius: flyoutStyle?.borderTopLeftRadius ?? "",
          itemHeights,
        };
      });
      const compactFlyoutStable = await stablePlayer();
      const compactFlyoutExpanded = await compactCourseTrigger.getAttribute("aria-expanded") === "true";
      await compactCourseTrigger.click();
      await compactCourseFlyout.waitFor({ state: "detached" });
      const compactFlyoutSecondClickClosed = await compactCourseTrigger.getAttribute("aria-expanded") === "false";
      const compactFlyoutSecondClickStable = await stablePlayer();
      await compactCourseTrigger.click();
      await compactCourseFlyout.waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await compactCourseFlyout.waitFor({ state: "detached" });
      const compactFlyoutEscapeClosed = await compactCourseTrigger.getAttribute("aria-expanded") === "false";
      const compactFlyoutEscapeFocusRestored = await compactCourseTrigger.evaluate(element => document.activeElement === element);
      const compactFlyoutEscapeStable = await stablePlayer();
      await compactCourseTrigger.click();
      await compactCourseFlyout.waitFor({ state: "visible" });
      await page.locator(".lesson-breadcrumb").click();
      await compactCourseFlyout.waitFor({ state: "detached" });
      const compactFlyoutOutsideClosed = await compactCourseTrigger.getAttribute("aria-expanded") === "false";
      const compactFlyoutOutsideStable = await stablePlayer();
      const compactFlyoutGeometryValid = compactFlyoutGeometry.left === 104
        && compactFlyoutGeometry.width === 224
        && compactFlyoutGeometry.paddingTop === "8px"
        && compactFlyoutGeometry.paddingBottom === "8px"
        && compactFlyoutGeometry.borderTopWidth === "0px"
        && compactFlyoutGeometry.borderRadius === "8px"
        && compactFlyoutGeometry.itemHeights.length > 0
        && compactFlyoutGeometry.itemHeights.every(itemHeight => itemHeight === 40);
      const chapterToggle = page.locator(".lesson-curriculum-list summary").first();
      await chapterToggle.click();
      const chapterCollapsedStable = await stablePlayer();
      await chapterToggle.click();
      const chapterExpandedStable = await stablePlayer();
      const secondChapterToggle = page.locator(".lesson-curriculum-list summary").nth(1);
      await secondChapterToggle.click();
      const accordion = await page.evaluate(() => {
        const chapters = [...document.querySelectorAll(".lesson-curriculum-list details")];
        return { firstClosed: !chapters[0]?.open, secondOpen: chapters[1]?.open ?? false };
      });
      const accordionStable = await stablePlayer();
      await chapterToggle.click();
      const activeChapterRestoredStable = await stablePlayer();
      await page.setViewportSize({ width: 1180, height: 900 });
      await page.waitForTimeout(350);
      const compactResizeStable = await stablePlayer();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(350);
      const desktopResizeStable = await stablePlayer();
      presentationStability = {
        compactFlyoutGeometry,
        compactFlyoutGeometryValid,
        compactFlyoutStable,
        compactFlyoutExpanded,
        compactFlyoutSecondClickClosed,
        compactFlyoutSecondClickStable,
        compactFlyoutEscapeClosed,
        compactFlyoutEscapeFocusRestored,
        compactFlyoutEscapeStable,
        compactFlyoutOutsideClosed,
        compactFlyoutOutsideStable,
        chapterCollapsedStable,
        chapterExpandedStable,
        accordion,
        accordionStable,
        activeChapterRestoredStable,
        compactResizeStable,
        desktopResizeStable,
      };
      if (!compactFlyoutGeometryValid || !compactFlyoutStable || !compactFlyoutExpanded
        || !compactFlyoutSecondClickClosed || !compactFlyoutSecondClickStable
        || !compactFlyoutEscapeClosed || !compactFlyoutEscapeFocusRestored || !compactFlyoutEscapeStable
        || !compactFlyoutOutsideClosed || !compactFlyoutOutsideStable) {
        throw new Error(`Compact course flyout failed: ${JSON.stringify(presentationStability)}`);
      }
      if (!accordion.firstClosed || !accordion.secondOpen) throw new Error(`Study chapters are not exclusive: ${JSON.stringify(accordion)}`);
      if (Object.values(presentationStability).some(value => !value)) throw new Error(`Study presentation state replaced the player: ${JSON.stringify(presentationStability)}`);
    }

    let curriculumPresentation = null;
    if (usesCurriculumDrawer) {
      await page.locator('.lesson-video[title="Video bài giảng TSA"]').evaluate(element => { element.dataset.studyQaPlayer = "stable"; });
      const curriculumTrigger = page.getByRole("button", { name: /Nội dung giáo trình/ });
      await curriculumTrigger.click();
      const curriculumDialog = page.locator('#lesson-curriculum-panel[role="dialog"][aria-modal="true"]');
      await curriculumDialog.waitFor({ state: "visible" });
      await page.waitForTimeout(100);
      const opened = await page.evaluate(() => {
        const dialog = document.querySelector("#lesson-curriculum-panel");
        const close = dialog?.querySelector(".curriculum-panel-close");
        const shell = document.querySelector(".study-mode");
        const sidebar = shell?.querySelector(":scope > .sidebar");
        const breadcrumb = document.querySelector(".lesson-breadcrumb");
        const viewer = document.querySelector(".study-viewer-column");
        const closeBox = close?.getBoundingClientRect();
        return {
          documentFocused: document.hasFocus(),
          activeElement: document.activeElement ? `${document.activeElement.tagName}.${document.activeElement.className}` : "",
          closeFocused: document.activeElement === close,
          focusInsideBeforeTrap: Boolean(dialog?.contains(document.activeElement)),
          dialogOpen: dialog?.classList.contains("mobile-open") ?? false,
          closeConnected: close?.isConnected ?? false,
          closeInert: close?.matches(":disabled") || close?.closest("[inert]") !== null,
          closeVisible: Boolean(closeBox && closeBox.width > 0 && closeBox.height > 0),
          mainInert: document.querySelector("#main-content")?.inert ?? false,
          bodyLocked: document.body.style.overflow === "hidden",
          backgroundInert: Boolean(sidebar?.inert && breadcrumb?.inert && viewer?.inert),
          playerStable: document.querySelector(".lesson-video")?.dataset.studyQaPlayer === "stable",
        };
      });
      await page.keyboard.press("Shift+Tab");
      const focusTrapped = await page.evaluate(() => document.querySelector("#lesson-curriculum-panel")?.contains(document.activeElement) ?? false);
      await page.screenshot({ path: join(outputDir, `student-curriculum-drawer-open-${width}.png`), fullPage: true });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      const closed = await page.evaluate(() => ({
        dialogClosed: !document.querySelector("#lesson-curriculum-panel")?.classList.contains("mobile-open"),
        triggerRestored: document.activeElement?.classList.contains("study-curriculum-trigger") ?? false,
        bodyUnlocked: document.body.style.overflow !== "hidden",
        backgroundInteractive: !document.querySelector(".study-viewer-column")?.inert,
        playerStable: document.querySelector(".lesson-video")?.dataset.studyQaPlayer === "stable",
      }));
      const drawerResult = { name: "student-study-curriculum-dialog", path: "/lessons/mock-lesson", width, ...opened, focusTrapped, ...closed };
      curriculumPresentation = drawerResult;
      report.push(drawerResult);
      if (!drawerResult.closeFocused || !drawerResult.bodyLocked || !drawerResult.backgroundInert || !drawerResult.playerStable || !drawerResult.focusTrapped
        || !drawerResult.dialogClosed || !drawerResult.triggerRestored || !drawerResult.bodyUnlocked || !drawerResult.backgroundInteractive) {
        throw new Error(`Study curriculum dialog failed: ${JSON.stringify(drawerResult)}`);
      }
    }

    if (width <= 1023) {
      const inlineState = await page.evaluate(() => {
        const root = document.documentElement;
        const panel = document.querySelector("#lesson-curriculum-panel");
        const layout = document.querySelector(".lesson-layout");
        const viewer = document.querySelector(".study-viewer-column");
        const trigger = document.querySelector(".study-curriculum-trigger");
        const shade = document.querySelector(".curriculum-sheet-shade");
        const close = document.querySelector(".curriculum-panel-close");
        const navigation = document.querySelector(".study-lesson-navigation");
        const curriculumList = panel?.querySelector(".lesson-curriculum-list");
        const sidebar = document.querySelector(".study-mode > .sidebar");
        const breadcrumb = document.querySelector(".lesson-breadcrumb");
        const panelBox = panel?.getBoundingClientRect();
        const layoutBox = layout?.getBoundingClientRect();
        const viewerBox = viewer?.getBoundingClientRect();
        const panelStyle = panel ? getComputedStyle(panel) : null;
        const isHidden = element => !element || getComputedStyle(element).display === "none";
        const background = [sidebar, breadcrumb, viewer].filter(Boolean);
        return {
          panelInline: panelStyle?.position === "static" && panelStyle.transform === "none" && panelStyle.visibility === "visible",
          panelVisible: Boolean(panelBox && panelBox.width > 0 && panelBox.height > 0 && panelStyle?.display !== "none"),
          panelFullWidth: Boolean(panelBox && layoutBox && Math.abs(panelBox.width - layoutBox.width) <= 1),
          panelFollowsViewer: Boolean(panel && viewer
            && (viewer.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING)
            && panelBox && viewerBox && panelBox.top >= viewerBox.bottom - 1),
          panelAccessible: panel?.getAttribute("aria-label") === "Nội dung giáo trình"
            && !panel.hasAttribute("role") && !panel.hasAttribute("aria-modal"),
          curriculumListVisible: Boolean(curriculumList && getComputedStyle(curriculumList).display !== "none"),
          triggerHidden: isHidden(trigger),
          shadeHidden: isHidden(shade),
          closeHidden: isHidden(close),
          previousNextHidden: isHidden(navigation),
          bodyUnlocked: document.body.style.overflow !== "hidden",
          backgroundInteractive: background.length === 3 && background.every(element => !element.inert)
            && !document.querySelector("#main-content")?.inert,
          horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
        };
      });
      const inlineResult = {
        name: "student-study-curriculum-inline",
        path: "/lessons/mock-lesson",
        width,
        resourceHeadingMatches: videoState.resourceHeading === mockLessonResources[0].title,
        lessonSubtitleMatches: videoState.lessonContext === `Bài ${mockLessonRows[0].sort_order + 1}: ${mockLessonRows[0].title}`,
        ...inlineState,
      };
      curriculumPresentation = inlineResult;
      report.push(inlineResult);
      if (!inlineResult.panelInline || !inlineResult.panelVisible || !inlineResult.panelFullWidth || !inlineResult.panelFollowsViewer
        || !inlineResult.panelAccessible || !inlineResult.curriculumListVisible || !inlineResult.triggerHidden || !inlineResult.shadeHidden
        || !inlineResult.closeHidden || !inlineResult.previousNextHidden || !inlineResult.bodyUnlocked || !inlineResult.backgroundInteractive
        || inlineResult.horizontalOverflow || !inlineResult.resourceHeadingMatches || !inlineResult.lessonSubtitleMatches) {
        throw new Error(`Study inline curriculum failed at ${width}px: ${JSON.stringify(inlineResult)}`);
      }
    }

    if (usesCurriculumDrawer) await page.getByRole("button", { name: /Nội dung giáo trình/ }).click();
    await page.getByRole("button", { name: /Tài liệu bài học HSA/ }).click();
    await page.locator('.lesson-document iframe[title="Tài liệu bài học HSA"]').waitFor({ state: "visible", timeout: 10_000 });
    const pdfVisible = await page.locator('.lesson-document iframe[title="Tài liệu bài học HSA"]').count() === 1;
    const resourceReplacedPlayer = !await page.locator('.lesson-video[title="Video bài giảng TSA"]').count();
    const pdfContext = await page.evaluate(() => ({
      resourceHeading: document.querySelector("#study-lesson-title")?.textContent?.trim() ?? "",
      lessonSubtitle: document.querySelector(".study-lesson-context p")?.textContent?.trim() ?? "",
    }));

    failNextVideoToken = true;
    expectedMockFailureMessages.push("status of 503");
    if (usesCurriculumDrawer) await page.getByRole("button", { name: /Nội dung giáo trình/ }).click();
    await page.getByRole("button", { name: /Video bài giảng TSA/ }).click();
    const playerError = page.locator(".lesson-viewer-surface .secure-viewer-state.error");
    await playerError.waitFor({ state: "visible", timeout: 10_000 });
    const retryVisible = await playerError.getByRole("button", { name: "Thử tải lại" }).count() === 1;
    await playerError.getByRole("button", { name: "Thử tải lại" }).click();
    await page.locator('.lesson-video[title="Video bài giảng TSA"]').waitFor({ state: "visible", timeout: 10_000 });
    const recoveredVideo = await page.locator('.lesson-video[title="Video bài giảng TSA"]').count() === 1;
    const recoveredContext = await page.evaluate(() => ({
      resourceHeading: document.querySelector("#study-lesson-title")?.textContent?.trim() ?? "",
      lessonSubtitle: document.querySelector(".study-lesson-context p")?.textContent?.trim() ?? "",
    }));
    let lessonEdges = null;
    if (width === 1440) {
      await page.locator('.lesson-video[title="Video bài giảng TSA"]').evaluate(element => { element.dataset.studyLessonEdge = "first"; });
      lessonEdges = await page.evaluate(() => ({
        firstPreviousDisabled: document.querySelector(".study-lesson-navigation > :first-child")?.getAttribute("aria-disabled") === "true",
        firstNextHref: document.querySelector(".study-lesson-navigation > a:last-child")?.getAttribute("href") ?? "",
      }));
      await page.locator(".study-lesson-navigation > a:last-child").click();
      await page.waitForURL(url => url.pathname === "/lessons/mock-lesson-middle", { timeout: 5_000 });
      await page.locator(".lesson-resource-picker .lesson-resource-choice").first().click();
      await page.locator('.lesson-video[title="Video khảo sát hàm số"]').waitFor({ state: "visible", timeout: 10_000 });
      Object.assign(lessonEdges, await page.evaluate(() => ({
        middlePreviousHref: document.querySelector(".study-lesson-navigation > a:first-child")?.getAttribute("href") ?? "",
        middleNextHref: document.querySelector(".study-lesson-navigation > a:last-child")?.getAttribute("href") ?? "",
        middleReplacedPlayer: document.querySelector(".lesson-video")?.dataset.studyLessonEdge !== "first",
      })));
      await page.locator('.lesson-video[title="Video khảo sát hàm số"]').evaluate(element => { element.dataset.studyLessonEdge = "middle"; });
      await page.locator(".study-lesson-navigation > a:last-child").click();
      await page.waitForURL(url => url.pathname === "/lessons/mock-lesson-last", { timeout: 5_000 });
      await page.locator(".lesson-resource-picker .lesson-resource-choice").first().click();
      await page.locator('.lesson-video[title="Video tích phân cuối khóa"]').waitFor({ state: "visible", timeout: 10_000 });
      Object.assign(lessonEdges, await page.evaluate(() => ({
        lastPreviousHref: document.querySelector(".study-lesson-navigation > a:first-child")?.getAttribute("href") ?? "",
        lastNextDisabled: document.querySelector(".study-lesson-navigation > :last-child")?.getAttribute("aria-disabled") === "true",
        lastReplacedPlayer: document.querySelector(".lesson-video")?.dataset.studyLessonEdge !== "middle",
      })));
      await page.goBack();
      await page.waitForURL(url => url.pathname === "/lessons/mock-lesson-middle", { timeout: 5_000 });
      await page.locator('.lesson-video[title="Video khảo sát hàm số"]').waitFor({ state: "visible", timeout: 10_000 });
      lessonEdges.backRestoredMiddle = true;
      await page.goBack();
      await page.waitForURL(url => url.pathname === "/lessons/mock-lesson", { timeout: 5_000 });
      await page.locator('.lesson-video[title="Video bài giảng TSA"]').waitFor({ state: "visible", timeout: 10_000 }).catch(async error => {
        const state = await page.evaluate(() => ({
          url: location.href,
          shell: document.querySelector(".ui-shell")?.className ?? "",
          heading: document.querySelector("#study-lesson-title")?.textContent ?? "",
          status: document.querySelector(".lesson-resource-status")?.textContent ?? "",
          viewer: document.querySelector(".lesson-viewer-surface")?.textContent ?? "",
          page: document.querySelector(".real-lesson-page")?.textContent?.slice(0, 500) ?? "",
        }));
        throw new Error(`Study back navigation did not restore the first player: ${JSON.stringify(state)}; ${error.message}`);
      });
      lessonEdges.backRestoredFirst = true;
      if (!lessonEdges.firstPreviousDisabled || lessonEdges.firstNextHref !== "/lessons/mock-lesson-middle"
        || lessonEdges.middlePreviousHref !== "/lessons/mock-lesson" || lessonEdges.middleNextHref !== "/lessons/mock-lesson-last"
        || !lessonEdges.middleReplacedPlayer || lessonEdges.lastPreviousHref !== "/lessons/mock-lesson-middle"
        || !lessonEdges.lastNextDisabled || !lessonEdges.lastReplacedPlayer || !lessonEdges.backRestoredMiddle || !lessonEdges.backRestoredFirst) {
        throw new Error(`Study lesson edge navigation is incomplete: ${JSON.stringify(lessonEdges)}`);
      }
    }
    await page.screenshot({ path: join(outputDir, `student-lesson-resources-${width}.png`), fullPage: true });
    page.off("request", recordStudyRequest);
    const expectedLessonLoads = width === 1440 ? 5 : 1;
    const result = { name: "student-lesson-resource-flow", path: "/lessons/mock-lesson", width, pickerState, ...videoState, presentationStability, curriculumPresentation, pdfVisible, resourceReplacedPlayer, pdfContext, retryVisible, recoveredVideo, recoveredContext, lessonEdges, studyRequests, expectedLessonLoads };
    report.push(result);
    if (videoState.lessonContext !== `Bài ${mockLessonRows[0].sort_order + 1}: ${mockLessonRows[0].title}` || videoState.resourceHeading !== mockLessonResources[0].title
      || !videoState.videoVisible || !videoState.curriculumVisible || videoState.horizontalOverflow || !pdfVisible || !resourceReplacedPlayer
      || pdfContext.resourceHeading !== mockLessonResources[1].title || pdfContext.lessonSubtitle !== videoState.lessonContext
      || !retryVisible || !recoveredVideo || recoveredContext.resourceHeading !== mockLessonResources[0].title || recoveredContext.lessonSubtitle !== videoState.lessonContext
      || studyRequests.lesson !== expectedLessonLoads || studyRequests.curriculum !== expectedLessonLoads) {
      throw new Error(`Lesson resource flow failed at ${width}px: ${JSON.stringify(result)}`);
    }
  }
}

async function inspectSecurityDialogs() {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseUrl}/admin/security`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(1_200);
  await page.locator(".security-user-grid > button").first().click();
  await page.locator(".security-detail-panel").waitFor({ state: "visible" });
  const selectedUserId = new URL(page.url()).searchParams.get("userId");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.locator(".security-detail-panel").waitFor({ state: "detached" });
  const backClosedDetail = !new URL(page.url()).searchParams.has("userId");
  await page.goForward({ waitUntil: "domcontentloaded" });
  await page.locator(".security-detail-panel").waitFor({ state: "visible" });
  const forwardRestoredDetail = new URL(page.url()).searchParams.get("userId") === selectedUserId;
  if (!selectedUserId || !backClosedDetail || !forwardRestoredDetail) {
    throw new Error(`Security drawer URL history failed: ${JSON.stringify({ selectedUserId, backClosedDetail, forwardRestoredDetail })}`);
  }
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
  report.push({ name: "admin-security-dialog-keyboard", path: "/admin/security", width: 1280, selectedUserId, backClosedDetail, forwardRestoredDetail, ...nested, ...escape });
}

async function inspectCollapsedAdminSidebar() {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/admin/enrollments`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(mockAuth ? 1_200 : 350);
  await page.locator(".header-sidebar-toggle").click();
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => {
    const shell = document.querySelector(".ui-shell");
    const sidebar = document.querySelector(".ui-shell.admin-app.product-shell > .sidebar");
    const sidebarRect = sidebar?.getBoundingClientRect();
    const visibleSidebarLogo = [...(sidebar?.querySelectorAll(".mobile-sidebar-logo-compact, .mobile-sidebar-logo-full") ?? [])]
      .find(candidate => {
        const style = getComputedStyle(candidate);
        const rect = candidate.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
      });
    const logoRect = visibleSidebarLogo?.getBoundingClientRect();
    const labels = [...document.querySelectorAll(".admin-sidebar-section-label")];
    const navLinks = [...document.querySelectorAll(".admin-sidebar-nav-item")];
    return {
      collapsed: !shell?.classList.contains("sidebar-expanded"),
      visibleSectionLabels: labels.filter(label => getComputedStyle(label).display !== "none").length,
      namedLinks: navLinks.filter(link => Boolean(link.getAttribute("aria-label"))).length,
      navLinks: navLinks.length,
      visibleSidebarLogo: visibleSidebarLogo?.className ?? null,
      visibleSidebarLogoSource: visibleSidebarLogo?.getAttribute("src") ?? null,
      visibleSidebarLogoRatio: visibleSidebarLogo instanceof HTMLImageElement && visibleSidebarLogo.naturalHeight
        ? Number((visibleSidebarLogo.naturalWidth / visibleSidebarLogo.naturalHeight).toFixed(2))
        : null,
      sidebarLogoCenterOffset: logoRect && sidebarRect
        ? Math.round(Math.abs((logoRect.left + logoRect.width / 2) - (sidebarRect.left + sidebarRect.width / 2)))
        : null,
    };
  });
  await page.screenshot({ path: join(outputDir, "admin-sidebar-collapsed-1440.png"), fullPage: true });
  report.push({ name: "admin-sidebar-collapsed", path: "/admin/enrollments", width: 1440, ...state });
  if (!state.collapsed || state.visibleSectionLabels !== 0 || state.namedLinks !== state.navLinks
    || state.visibleSidebarLogoSource !== "/logo_aeck_compact.svg" || state.visibleSidebarLogoRatio !== 1
    || state.sidebarLogoCenterOffset == null || state.sidebarLogoCenterOffset > 2) {
    throw new Error(`Admin collapsed sidebar alignment failed: ${JSON.stringify(state)}`);
  }
}

async function inspectCollapsedStudentSidebar() {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(mockAuth ? 1_200 : 350);
  await waitForRouteSurface();
  await page.locator(".header-sidebar-toggle").click();
  await page.waitForTimeout(300);
  const collapsed = await page.evaluate(() => {
    const shell = document.querySelector(".ui-shell.student-app.product-shell");
    const sidebar = shell?.querySelector(":scope > .sidebar");
    const sidebarRect = sidebar?.getBoundingClientRect();
    const visibleSidebarLogo = [...(sidebar?.querySelectorAll(".student-sidebar-logo-compact, .student-sidebar-logo-full, .mobile-sidebar-logo-compact, .mobile-sidebar-logo-full") ?? [])]
      .find(candidate => {
        const style = getComputedStyle(candidate);
        const rect = candidate.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
      });
    const logoRect = visibleSidebarLogo?.getBoundingClientRect();
    return {
      collapsed: !shell?.classList.contains("sidebar-expanded"),
      visibleSidebarLogo: visibleSidebarLogo?.className ?? null,
      visibleSidebarLogoSource: visibleSidebarLogo?.getAttribute("src") ?? null,
      visibleSidebarLogoRatio: visibleSidebarLogo instanceof HTMLImageElement && visibleSidebarLogo.naturalHeight
        ? Number((visibleSidebarLogo.naturalWidth / visibleSidebarLogo.naturalHeight).toFixed(2))
        : null,
      sidebarLogoCenterOffset: logoRect && sidebarRect
        ? Math.round(Math.abs((logoRect.left + logoRect.width / 2) - (sidebarRect.left + sidebarRect.width / 2)))
        : null,
    };
  });
  await page.screenshot({ path: join(outputDir, "student-sidebar-collapsed-1440.png"), fullPage: true });
  await page.locator(".header-sidebar-toggle").click();
  await page.waitForTimeout(300);
  const expanded = await page.evaluate(() => {
    const shell = document.querySelector(".ui-shell.student-app.product-shell");
    const logo = shell?.querySelector(":scope > .sidebar .student-sidebar-logo-full, :scope > .sidebar .mobile-sidebar-logo-full");
    const rect = logo?.getBoundingClientRect();
    return {
      expanded: Boolean(shell?.classList.contains("sidebar-expanded")),
      fullLogoVisible: Boolean(logo && getComputedStyle(logo).display !== "none" && rect && rect.width > 0 && rect.height > 0),
      fullLogoSource: logo?.getAttribute("src") ?? null,
    };
  });
  await page.screenshot({ path: join(outputDir, "student-sidebar-expanded-1440.png"), fullPage: true });
  const result = { name: "student-sidebar-logo-states", path: "/dashboard", width: 1440, ...collapsed, ...expanded };
  report.push(result);
  if (!result.collapsed || result.visibleSidebarLogoSource !== "/logo_aeck_compact.svg"
    || result.visibleSidebarLogoRatio !== 1 || result.sidebarLogoCenterOffset == null || result.sidebarLogoCenterOffset > 2
    || !result.expanded || !result.fullLogoVisible || result.fullLogoSource !== "/logo_aeck.svg") {
    throw new Error(`Student sidebar logo states failed: ${JSON.stringify(result)}`);
  }
}

async function inspectCourseReferenceStates() {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/courses`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForRouteSurface();
  await page.locator(".courses-page").waitFor({ state: "visible", timeout: 10_000 });
  const shell = page.locator(".ui-shell.student-app.product-shell");
  if (!await shell.evaluate(element => element.classList.contains("sidebar-expanded"))) {
    await page.locator(".header-sidebar-toggle").click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: join(outputDir, "student-courses-expanded-1440.png"), fullPage: true });
  await page.locator(".header-sidebar-toggle").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outputDir, "student-courses-collapsed-1440.png"), fullPage: true });

  await page.goto(`${baseUrl}/courses/mock-course`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForRouteSurface();
  const detail = page.locator(".course-study-page-reference");
  const sections = detail.locator(".course-curriculum-panel-reference details");
  await detail.waitFor({ state: "visible", timeout: 10_000 });
  await sections.first().waitFor({ state: "visible", timeout: 10_000 });
  const collapsedCount = await sections.evaluateAll(items => items.filter(item => item.open).length);
  await page.screenshot({ path: join(outputDir, "student-course-detail-collapsed-1440.png"), fullPage: true });
  await sections.first().locator("summary").click();
  const firstPartOpen = await sections.first().evaluate(item => item.open);
  const geometry = await detail.evaluate(root => {
    const frame = root.querySelector(".aspect-video");
    const curriculum = root.querySelector(".course-curriculum-panel-reference")?.parentElement;
    const frameBox = frame?.getBoundingClientRect();
    const curriculumBox = curriculum?.getBoundingClientRect();
    return {
      frameRatio: frameBox ? Number((frameBox.width / frameBox.height).toFixed(3)) : null,
      curriculumWidth: curriculumBox ? Math.round(curriculumBox.width) : null,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  await page.screenshot({ path: join(outputDir, "student-course-detail-part-1-open-1440.png"), fullPage: true });
  const result = { name: "student-course-reference-states", path: "/courses/mock-course", width: 1440, collapsedCount, firstPartOpen, ...geometry };
  report.push(result);
  if (collapsedCount !== 0 || !firstPartOpen || geometry.frameRatio == null || Math.abs(geometry.frameRatio - 16 / 9) > .01
    || geometry.curriculumWidth !== 400 || geometry.horizontalOverflow) {
    throw new Error(`Course reference states failed: ${JSON.stringify(result)}`);
  }
}

async function inspectDashboardDotAlignment() {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(mockAuth ? 1_200 : 350);
  await waitForRouteSurface();
  const state = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".alpha-dashboard-list-card li")];
    const offsets = rows.map(row => {
      const dot = row.querySelector(".alpha-list-dot")?.getBoundingClientRect();
      const link = row.querySelector("a")?.getBoundingClientRect();
      return dot && link ? Math.abs((dot.top + dot.height / 2) - (link.top + link.height / 2)) : null;
    }).filter(value => value != null);
    return {
      measuredRows: offsets.length,
      maxCenterOffset: offsets.length ? Math.max(...offsets) : null,
    };
  });
  await page.screenshot({ path: join(outputDir, "student-dashboard-dots-1440.png"), fullPage: true });
  report.push({ name: "student-dashboard-dot-alignment", path: "/dashboard", width: 1440, ...state });
  if (!state.measuredRows || state.maxCenterOffset == null || state.maxCenterOffset > 2) {
    throw new Error(`Student dashboard dot alignment failed: ${JSON.stringify(state)}`);
  }
}

async function inspectStudentSearch() {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto(`${baseUrl}/search?q=TSA&type=courses`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(mockAuth ? 1_200 : 350);
    const input = page.getByRole("searchbox", { name: "Từ khóa tra cứu" });
    await input.fill("TSA");
    await page.waitForTimeout(250);
    const courseFilter = page.getByRole("button", { name: "Khóa học", exact: true });
    await courseFilter.click();
    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const resultGroups = [...document.querySelectorAll(".reference-result-group")];
      const controls = [...document.querySelectorAll(".reference-search-page button, .reference-search-page a, .reference-search-page input")];
      return {
        url: `${location.pathname}${location.search}`,
        resultGroups: resultGroups.length,
        courseGroupVisible: Boolean(document.querySelector("#course-result-title")),
        roomGroupVisible: Boolean(document.querySelector("#room-result-title")),
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
        outsideControls: controls.filter(control => {
          const rect = control.getBoundingClientRect();
          return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
        }).length,
      };
    });
    await page.screenshot({ path: join(outputDir, `student-search-${width}.png`), fullPage: true });
    report.push({ name: "student-search-interaction", path: "/search", width, ...state });
    if (!state.url.includes("q=TSA") || !state.courseGroupVisible || state.roomGroupVisible || state.horizontalOverflow || state.outsideControls) {
      throw new Error(`Student search failed at ${width}px: ${JSON.stringify(state)}`);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(mockAuth ? 1_200 : 350);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.waitForURL(url => url.pathname === "/search", { timeout: 5_000 });
  report.push({ name: "student-search-shortcut", path: "/dashboard", width: 1440, destination: new URL(page.url()).pathname });
}

async function inspectStudentSchedule() {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto(`${baseUrl}/tkb`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(mockAuth ? 1_200 : 350);
    const initialLabel = await page.locator('[aria-label="Điều hướng tuần"] strong').textContent();
    await page.getByRole("button", { name: "Xem tuần sau" }).click();
    const nextLabel = await page.locator('[aria-label="Điều hướng tuần"] strong').textContent();
    await page.getByRole("button", { name: "Hôm nay" }).click();
    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const panel = document.querySelector(".student-timetable-page")?.getBoundingClientRect();
      const scroller = document.querySelector(".student-timetable-scroll");
      const events = [...document.querySelectorAll('.student-timetable-scroll a[href^="/exam-room/"]')];
      return {
        weekDays: document.querySelectorAll(".student-timetable-scroll .sticky > div").length - 1,
        scheduledEvents: events.length,
        panelInsideViewport: Boolean(panel && panel.left >= -1 && panel.right <= innerWidth + 1),
        timelineHeight: scroller?.querySelector('.relative > .flex')?.getBoundingClientRect().height ?? 0,
        hasInternalHorizontalScroll: Boolean(scroller && scroller.scrollWidth > scroller.clientWidth),
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      };
    });
    await page.screenshot({ path: join(outputDir, `student-schedule-${width}.png`), fullPage: true });
    report.push({ name: "student-schedule-interaction", path: "/tkb", width, initialLabel, nextLabel, ...state });
    if (!initialLabel || initialLabel === nextLabel || state.weekDays !== 7 || state.scheduledEvents < 1 || state.timelineHeight !== 1024 || !state.panelInsideViewport || state.horizontalOverflow || (width < 560 && !state.hasInternalHorizontalScroll)) {
      throw new Error(`Student schedule failed at ${width}px: ${JSON.stringify({ initialLabel, nextLabel, ...state })}`);
    }
  }
}

async function inspectStudentProgress() {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto(`${baseUrl}/progress`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(mockAuth ? 1_200 : 350);
    const typeSelect = page.locator(".student-progress-filters select").nth(1);
    await typeSelect.selectOption("TSA");
    await page.waitForTimeout(180);
    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const pageRect = document.querySelector(".student-progress-page")?.getBoundingClientRect();
      const monthItems = [...document.querySelectorAll(".student-progress-month-chart > li")];
      return {
        url: `${location.pathname}${location.search}`,
        kpis: document.querySelectorAll(".student-progress-kpis article").length,
        monthItems: monthItems.length,
        visibleMonthLabels: monthItems.filter(item => item.textContent?.includes("Tháng")).length,
        pageInsideViewport: Boolean(pageRect && pageRect.left >= -1 && pageRect.right <= innerWidth + 1),
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      };
    });
    await page.screenshot({ path: join(outputDir, `student-progress-filtered-${width}.png`), fullPage: false });
    report.push({ name: "student-progress", path: "/progress", width, ...state });
    if (!state.url.includes("type=TSA") || state.kpis !== 4 || state.monthItems !== 12 || state.visibleMonthLabels !== 12 || !state.pageInsideViewport || state.horizontalOverflow) {
      throw new Error(`Student progress failed at ${width}px: ${JSON.stringify(state)}`);
    }
  }
}

async function inspectAdminTimetable() {
  for (const width of [1440, 390, 320]) {
    const editableRoom = mockRooms.find(room => room.id === "mock-open-room");
    if (editableRoom) {
      editableRoom.exam_start = null;
      editableRoom.exam_end = null;
    }
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto(`${baseUrl}/admin/timetable`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_200);
    await page.getByRole("button", { name: /Thiết lập/ }).first().click();
    await page.getByLabel("Bắt đầu").fill("2026-08-28T09:00");
    await page.getByLabel("Kết thúc").fill("2026-08-28T11:00");
    const timetableResponsePromise = page.waitForResponse(response => {
      const request = response.request();
      return new URL(response.url()).pathname === "/api/admin/timetable" && request.method() === "PATCH";
    });
    await page.getByRole("button", { name: "Lưu lịch" }).click();
    const timetableResponse = await timetableResponsePromise;
    const timetableResponseBody = await timetableResponse.text();
    if (!timetableResponse.ok()) {
      const formError = await page.locator(".admin-timetable-form-error").textContent().catch(() => null);
      throw new Error(`Timetable PATCH failed (${timetableResponse.status()}): ${timetableResponseBody}; form error: ${formError ?? "none"}`);
    }
    const timetableNotice = page.locator(".admin-timetable-notice").filter({ hasText: "Đã lưu lịch vận hành." });
    const timetableFormError = page.locator(".admin-timetable-form-error");
    await timetableNotice.or(timetableFormError).waitFor({ state: "visible", timeout: 5_000 }).catch(() => null);
    if (!(await timetableNotice.isVisible())) {
      const formError = await timetableFormError.textContent().catch(() => null);
      throw new Error(`Timetable UI did not confirm save. PATCH ${timetableResponse.status()}: ${timetableResponseBody}; form error: ${formError ?? "none"}`);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const pageRect = document.querySelector(".admin-timetable-page")?.getBoundingClientRect();
      const skipLink = document.querySelector(".skip-link");
      const skipLinkRect = skipLink?.getBoundingClientRect();
      return {
        weekDays: document.querySelectorAll(".admin-timetable-week-grid > li").length,
        summaryItems: document.querySelectorAll(".admin-timetable-summary > div").length,
        editorVisible: Boolean(document.querySelector(".admin-timetable-editor input")),
        noticeVisible: Boolean(document.querySelector(".admin-timetable-notice")),
        activeElement: document.activeElement instanceof HTMLElement ? `${document.activeElement.tagName.toLowerCase()}.${document.activeElement.className}` : null,
        skipLinkFocused: document.activeElement === skipLink,
        skipLinkVisible: Boolean(skipLinkRect && skipLinkRect.bottom > 0 && skipLinkRect.top < innerHeight),
        skipLinkTransform: skipLink ? getComputedStyle(skipLink).transform : null,
        pageInsideViewport: Boolean(pageRect && pageRect.left >= -1 && pageRect.right <= innerWidth + 1),
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      };
    });
    await page.screenshot({ path: join(outputDir, `admin-timetable-saved-${width}.png`), fullPage: false });
    report.push({ name: "admin-timetable", path: "/admin/timetable", width, ...state });
    if (state.weekDays !== 7 || state.summaryItems !== 4 || !state.editorVisible || !state.noticeVisible || state.skipLinkFocused || state.skipLinkVisible || !state.pageInsideViewport || state.horizontalOverflow) {
      throw new Error(`Admin timetable failed at ${width}px: ${JSON.stringify(state)}`);
    }
  }
}

async function inspectAdminAudit() {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto(`${baseUrl}/admin/audit`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_200);
    await page.getByLabel("Nguồn").selectOption("account");
    const auditResponsePromise = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/admin/audit"
        && url.searchParams.get("source") === "account"
        && url.searchParams.get("q") === "Lê Gia Bảo";
    });
    await page.getByRole("searchbox", { name: "Từ khóa nhật ký" }).fill("Lê Gia Bảo");
    const auditResponse = await auditResponsePromise;
    if (!auditResponse.ok()) throw new Error(`Admin audit request failed (${auditResponse.status()}): ${await auditResponse.text()}`);
    const auditRow = page.locator(".admin-audit-row:not(.admin-audit-row-head)").first();
    await auditRow.waitFor({ state: "visible" });
    await auditRow.scrollIntoViewIfNeeded();
    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const pageRect = document.querySelector(".admin-audit-page")?.getBoundingClientRect();
      return {
        url: `${location.pathname}${location.search}`,
        summaryItems: document.querySelectorAll(".admin-audit-summary > div").length,
        auditRows: document.querySelectorAll(".admin-audit-row:not(.admin-audit-row-head)").length,
        accountResult: document.querySelector(".admin-audit-row:not(.admin-audit-row-head)")?.textContent?.includes("Lê Gia Bảo") ?? false,
        pageInsideViewport: Boolean(pageRect && pageRect.left >= -1 && pageRect.right <= innerWidth + 1),
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      };
    });
    await page.screenshot({ path: join(outputDir, `admin-audit-filtered-${width}.png`), fullPage: false });
    report.push({ name: "admin-audit", path: "/admin/audit", width, ...state });
    if (!state.url.includes("source=account") || state.summaryItems !== 4 || state.auditRows !== 1 || !state.accountResult || !state.pageInsideViewport || state.horizontalOverflow) {
      throw new Error(`Admin audit failed at ${width}px: ${JSON.stringify(state)}`);
    }
  }
}

async function inspectAdminQuickFinder() {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_200);
    const input = page.locator(".admin-reference-search-field input");
    await input.fill("Gia Bao");
    await page.waitForTimeout(150);
    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const finder = document.querySelector(".admin-reference-finder")?.getBoundingClientRect();
      const controls = [...document.querySelectorAll(".admin-reference-finder button, .admin-reference-finder input")];
      return {
        visibleResults: document.querySelectorAll(".admin-reference-results > button").length,
        learnerResult: [...document.querySelectorAll(".admin-reference-results > button")].some(element => element.textContent?.includes("Lê Gia Bảo")),
        finderInsideViewport: Boolean(finder && finder.left >= -1 && finder.right <= innerWidth + 1),
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
        outsideControls: controls.filter(control => {
          const rect = control.getBoundingClientRect();
          return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
        }).length,
      };
    });
    await page.screenshot({ path: join(outputDir, `admin-quick-finder-${width}.png`), fullPage: true });
    report.push({ name: "admin-quick-finder", path: "/admin", width, ...state });
    if (!state.learnerResult || state.visibleResults < 1 || !state.finderInsideViewport || state.horizontalOverflow || state.outsideControls) {
      throw new Error(`Admin quick finder failed at ${width}px: ${JSON.stringify(state)}`);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(1_200);
  await page.locator(".admin-reference-search-field input").fill("Gia Bao");
  await page.getByRole("button", { name: /Lê Gia Bảo/ }).click();
  await page.waitForURL(url => url.pathname === "/admin/students", { timeout: 5_000 });
  const learnerFiltered = await page.locator(".student-table .table-row").filter({ hasText: "Lê Gia Bảo" }).count();
  report.push({ name: "admin-quick-finder-navigation", path: "/admin", width: 1440, destination: new URL(page.url()).pathname, learnerFiltered });
  if (!learnerFiltered) throw new Error("Admin quick finder did not preserve the selected learner filter.");
}

async function inspectNewWorkflowActions() {
  if (mockRole === "student") {
    for (const width of [1440, 390, 360]) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(1_200);
      await page.locator('[data-testid="student-dashboard"]').waitFor({ state: "visible", timeout: 10_000 });
      const dashboardState = await page.evaluate(() => {
        const root = document.documentElement;
        const dashboard = document.querySelector('[data-testid="student-dashboard"]');
        const resourceLinks = [...(dashboard?.querySelectorAll(".alpha-dashboard-resource-grid a") ?? [])];
        return {
          nativeDashboard: Boolean(dashboard),
          hasHeading: Boolean(dashboard?.querySelector("#alpha-dashboard-title")),
          resourceCards: dashboard?.querySelectorAll(".alpha-dashboard-resource-grid > article").length ?? 0,
          attemptCards: dashboard?.querySelectorAll(".alpha-dashboard-attempt-grid > article").length ?? 0,
          hasActivity: Boolean(dashboard?.querySelector(".alpha-dashboard-activity")),
          resourceHrefs: resourceLinks.map(item => item.getAttribute("href")),
          horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
        };
      });
      if (!dashboardState.nativeDashboard || !dashboardState.hasHeading || dashboardState.resourceCards !== 2
        || dashboardState.attemptCards !== 2 || !dashboardState.hasActivity || dashboardState.horizontalOverflow
        || !dashboardState.resourceHrefs.includes("/courses") || !dashboardState.resourceHrefs.includes("/exam-room")) {
        throw new Error(`Native Alpha dashboard failed at ${width}px: ${JSON.stringify(dashboardState)}`);
      }

      await page.locator('[data-testid="student-dashboard"] .alpha-dashboard-resource-grid a[href="/courses"]').first().click();
      await page.waitForURL(url => url.pathname === "/courses", { timeout: 5_000 });
      await page.waitForTimeout(1_200);
      await page.getByRole("button", { name: "Danh sách" }).click();
      await page.waitForURL(url => url.pathname === "/courses" && url.searchParams.get("view") === "list", { timeout: 5_000 });
      const listMode = await page.locator(".course-list-view").count();
      await page.goBack();
      await page.waitForURL(url => url.pathname === "/courses" && !url.searchParams.has("view"), { timeout: 5_000 });
      await page.waitForTimeout(1_200);
      const gridModeAfterBack = await page.locator(".course-grid-view").count();
      const afterBackUrl = page.url();
      const afterBackClasses = await page.locator(".reference-course-grid").getAttribute("class").catch(() => null);
      await page.goForward();
      await page.waitForURL(url => url.pathname === "/courses" && url.searchParams.get("view") === "list", { timeout: 5_000 });
      await page.waitForTimeout(1_200);
      const gridModeAfterForward = await page.locator(".course-grid-view").count();
      const afterForwardUrl = page.url();
      const afterForwardClasses = await page.locator(".reference-course-grid").getAttribute("class").catch(() => null);
      const result = { name: "student-new-workflow-actions", path: "/dashboard", width, ...dashboardState, listMode, gridModeAfterBack, afterBackUrl, afterBackClasses, gridModeAfterForward, afterForwardUrl, afterForwardClasses };
      report.push(result);
      if (listMode !== 1 || gridModeAfterBack !== 1 || gridModeAfterForward !== 0) {
        throw new Error(`Student course view history failed at ${width}px: ${JSON.stringify(result)}`);
      }
    }
    return;
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForRouteSurface();
  await page.locator(".admin-quick-actions-grid").waitFor({ state: "visible", timeout: 10_000 });
  const quickActionCount = await page.locator(".admin-quick-actions-grid > *").count();
  await page.getByRole("button", { name: /Thêm học viên/ }).first().click();
  await page.getByRole("heading", { name: "Thêm học viên" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Đóng hộp thoại thêm học viên" }).click();
  await page.getByRole("button", { name: /Tạo khóa học/ }).first().click();
  await page.getByRole("heading", { name: "Tạo khóa học" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Đóng hộp thoại tạo khóa học" }).click();
  await page.getByRole("link", { name: /Tạo kíp thi/ }).first().click();
  await page.waitForURL(url => url.pathname === "/admin/sessions/new", { timeout: 5_000 });
  await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForRouteSurface();
  await page.locator(".admin-quick-actions-grid").waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("link", { name: /Mở kho ảnh/ }).first().click();
  await page.waitForURL(url => url.pathname === "/admin/upload", { timeout: 5_000 });
  const state = await page.evaluate(() => ({
    quickActionCount: document.querySelectorAll(".admin-quick-actions-grid > *").length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  const result = { name: "admin-new-workflow-actions", path: "/admin", width: 390, quickActionCount, finalPageQuickActionCount: state.quickActionCount, horizontalOverflow: state.horizontalOverflow };
  report.push(result);
  if (quickActionCount !== 4 || state.horizontalOverflow) throw new Error(`Admin quick actions failed: ${JSON.stringify(result)}`);
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
    await sourceOptions.nth(4).check();
    const uploadVisible = await page.getByText("File PDF (tối đa 50 MB)", { exact: true }).isVisible();
    await sourceOptions.nth(3).check();
    const linkVisible = await page.getByText("Link PDF", { exact: true }).last().isVisible();
    await sourceOptions.nth(0).check();
    const youtubeVisible = await page.getByText("Link YouTube", { exact: true }).isVisible();
    await sourceOptions.nth(1).check();
    const microsoftVisible = await page.getByText("Link chia sẻ OneDrive / SharePoint", { exact: true }).isVisible();
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
    await page.screenshot({ path: join(outputDir, `admin-course-resource-modal-${width}.png`), fullPage: true });
    if (optionCount !== 5 || !uploadVisible || !linkVisible || !youtubeVisible || !microsoftVisible || result.horizontalOverflow || !result.modalInsideViewport || result.unnamedControls) {
      throw new Error(`Course resource modal failed at ${width}px: ${JSON.stringify(result)}`);
    }
  }
}

async function inspectCourseCoverEditor() {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/admin/content/courses/mock-course`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(1_200);
  const preview = page.locator(".course-cover-editor-preview");
  await preview.waitFor({ state: "visible" });
  const emptyState = await page.getByText("Chưa có ảnh bìa", { exact: true }).isVisible();
  const initialRatio = await preview.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.height ? Number((rect.width / rect.height).toFixed(3)) : 0;
  });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await page.locator(".course-cover-picker").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png });
  await page.getByText("Đã tải ảnh bìa lên. Tỉ lệ hiển thị được tối ưu theo khung 16:9.", { exact: true }).waitFor({ state: "visible" });
  const uploaded = await page.locator(".course-cover-editor-preview img").isVisible();
  const deleteButton = page.getByRole("button", { name: "Xóa ảnh" });
  let dialogOpened = false;
  page.once("dialog", async dialog => { dialogOpened = true; await dialog.accept(); });
  await deleteButton.click();
  await page.getByText("Đã xóa ảnh bìa. Khóa học sẽ dùng nền màu đã chọn.", { exact: true }).waitFor({ state: "visible" });
  const deleted = await page.getByText("Chưa có ảnh bìa", { exact: true }).isVisible();
  const result = { name: "admin-course-cover-editor", path: "/admin/content/courses/mock-course", width: 390, emptyState, initialRatio, uploaded, deleted, dialogOpened };
  report.push(result);
  await page.screenshot({ path: join(outputDir, "admin-course-cover-editor-390.png"), fullPage: true });
  if (!emptyState || initialRatio < 1.7 || initialRatio > 1.79 || !uploaded || !deleted || !dialogOpened) {
    throw new Error(`Course cover editor failed: ${JSON.stringify(result)}`);
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
        gridColumns: getComputedStyle(document.querySelector(".exam-list-grid")).gridTemplateColumns,
        cardWidth: card ? Math.round(card.width) : null,
        gridWidth: grid ? Math.round(grid.width) : null,
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      };
    });

    await page.screenshot({ path: join(outputDir, `student-exam-history-${width}.png`), fullPage: true });
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
    if (width === 1440 && (result.cardWidth == null || result.gridColumns.split(" ").length !== 2 || result.dialogColumns.split(" ").length !== 2)) {
      throw new Error(`Exam package desktop layout failed: ${JSON.stringify(result)}`);
    }
    if (width === 390 && (result.cardWidth == null || result.gridWidth == null || Math.abs(result.cardWidth - result.gridWidth) > 1 || result.dialogColumns.split(" ").length !== 1)) {
      throw new Error(`Exam package mobile layout failed: ${JSON.stringify(result)}`);
    }
  }
}

async function inspectProfilePortalTabs() {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/profile?tab=courses`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForRouteSurface();
  await page.locator(".profile-portal-reference").waitFor({ state: "visible", timeout: 10_000 });
  const result = await page.evaluate(() => ({
    profileTab: new URLSearchParams(window.location.search).get("tab"),
    heading: document.querySelector(".profile-portal-section-title h1")?.textContent?.trim() ?? "",
    courseRows: document.querySelectorAll(".profile-course-row").length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  await page.screenshot({ path: join(outputDir, "student-profile-courses-1440.png"), fullPage: true });
  report.push({ name: "student-profile-tabs", path: "/profile?tab=courses", width: 1440, ...result });
  const profileTabReady = result.profileTab === "courses";
  if (!profileTabReady || result.heading !== "Khóa học của tôi" || result.courseRows !== 1 || result.horizontalOverflow) {
    throw new Error(`Profile portal tabs failed: ${JSON.stringify(result)}`);
  }
}

await installMockAuth();
await inspect(mockRole === "student" ? "student-login" : "admin-login", startPath, 390, true);
const authenticated = !(await page.locator("main.login-page").count());

if (authenticated) {
  for (const [name, path] of auditRoutes) {
    for (const [widthIndex, width] of auditWidths.entries()) await inspect(name, path, width, width === 1440 || width === 390 || requestedWidths.includes(width), "", widthIndex > 0);
    if (stressEnabled) await inspectStress(name, path, Math.min(...auditWidths));
  }
  if (extendedInteractions) {
    await inspectDrawer(mockRole === "admin" ? "/admin" : "/dashboard");
    if (mockRole === "admin" && (!focusedAudit || requestedRoutes.has("admin-dashboard") || requestedRoutes.has("admin-enrollments"))) {
      await inspectCollapsedAdminSidebar();
    }
    if (mockRole === "admin" && (!focusedAudit || requestedRoutes.has("admin-dashboard"))) await inspectAccountMenu();
    if (mockRole === "student" && (!focusedAudit || requestedRoutes.has("student-dashboard"))) {
      await inspectCollapsedStudentSidebar();
      await inspectDashboardDotAlignment();
      await inspectAccountMenu();
    }
    if (mockRole === "student" && (!focusedAudit || requestedRoutes.has("student-courses") || requestedRoutes.has("student-course-detail"))) await inspectCourseReferenceStates();
    if (mockRole === "student" && (!focusedAudit || requestedRoutes.has("student-lesson"))) await inspectLessonResources();
    if (mockRole === "student" && (!focusedAudit || requestedRoutes.has("student-profile"))) await inspectProfilePortalTabs();
    if (mockRole === "admin" && (!focusedAudit || requestedRoutes.has("admin-dashboard"))) await inspectAdminQuickFinder();
    if (!focusedAudit || requestedRoutes.has(mockRole === "admin" ? "admin-dashboard" : "student-dashboard")) await inspectNewWorkflowActions();
    if (!focusedAudit || requestedRoutes.has("student-search")) await inspectStudentSearch();
    if (!focusedAudit || requestedRoutes.has("student-schedule")) await inspectStudentSchedule();
    if (!focusedAudit || requestedRoutes.has("student-progress")) await inspectStudentProgress();
    if (mockRole === "admin" && (!focusedAudit || requestedRoutes.has("admin-timetable"))) await inspectAdminTimetable();
    if (mockRole === "admin" && (!focusedAudit || requestedRoutes.has("admin-audit"))) await inspectAdminAudit();
    if (mockRole === "admin" && auditRoutes.some(([name]) => name === "admin-security")) await inspectSecurityDialogs();
    if (!focusedAudit || requestedRoutes.has("student-exam-list")) await inspectExamHistoryDialog();
    if (protectedAuditRequested) {
      const catalogRoutes = [["student-exam-catalog-shell", "/exam-room"]];
      if (!focusedAudit || requestedRoutes.has("student-exam-catalog") || requestedRoutes.has("student-exam-list")) {
        for (const [name, path] of catalogRoutes) {
          await inspect(name, path, 1440, true);
          const latest = report.at(-1);
          if (!latest?.shell?.includes("product-shell") || latest.shell.includes("protected-exam-surface")) {
            throw new Error(`${name} did not expose the standardized product shell: ${latest?.shell}`);
          }
        }
      }
    }
  }
  if (resourceModalEnabled && mockRole === "admin") await inspectCourseResourceModal();
  if (courseCoverEnabled && mockRole === "admin") await inspectCourseCoverEditor();
}

if (authenticated && protectedAuditRequested) {
  const protectedRoutes = focusedAudit
    ? roleProtectedRoutes.filter(([name]) => requestedRoutes.has(name))
    : roleProtectedRoutes;
  for (const [name, path, expectedSurface] of protectedRoutes) {
    for (const [widthIndex, width] of protectedRegressionWidths.entries()) {
      await inspect(name, path, width, width === 1440 || width === 390, expectedSurface, widthIndex > 0);
      const latest = report.at(-1);
      if (name.includes("guest-exam") && !latest?.guestExam) throw new Error(`${name} did not render the protected guest entry surface.`);
      if (!await page.locator(expectedSurface).first().count()) throw new Error(`${name} did not render ${expectedSurface}.`);
      if (latest?.shell && !latest.shell.includes("protected-exam-surface") && !latest.shell.includes("exam-shell")) throw new Error(`${name} did not expose the protected shell boundary: ${latest.shell}`);
      if (latest?.shell?.includes("ui-optimized-surface")) throw new Error(`${name} incorrectly opted into optimized content.`);
    }
  }
}

const layoutIssues = report.filter(item => item.horizontalOverflow || item.controlsOutsideViewport || item.unnamedControls);
const protectedFindings = layoutIssues.filter(item => item.name?.startsWith("protected-"));
const blockingLayoutIssues = layoutIssues.filter(item => !item.name?.startsWith("protected-"));
const result = { baseUrl, mockAuth, mockRole, authenticated, runtimeIssues, protectedFindings, report };
if (reportFile) await writeFile(reportFile, JSON.stringify(result, null, 2), "utf8");
if (quietOutput) console.log(JSON.stringify({ baseUrl, mockRole, authenticated, runtimeIssues: runtimeIssues.length, protectedFindings: protectedFindings.length, checks: report.length, reportFile }));
else console.log(JSON.stringify(result, null, 2));
await browser.close();
if (expectedMockFailureMessages.length) throw new Error(`Expected mock failure console messages were not observed: ${JSON.stringify(expectedMockFailureMessages)}`);
if (runtimeIssues.length) throw new Error(`Browser runtime issues: ${JSON.stringify(runtimeIssues)}`);
if (blockingLayoutIssues.length) {
  throw new Error(`Layout/accessibility issues: ${JSON.stringify(blockingLayoutIssues.map(item => ({ name: item.name, path: item.path, width: item.width, horizontalOverflow: item.horizontalOverflow, controlsOutsideViewport: item.controlsOutsideViewport, unnamedControls: item.unnamedControls })))}`);
}
