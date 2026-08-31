import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the safe AECK session-checking shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>AECK<\/title>/i);
  assert.match(html, /class="remix-loading full-page" role="status"/);
  assert.match(html, /Đang xác thực tài khoản/);
  assert.doesNotMatch(html, /placeholder="hocvien@example\.com"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Building your site/i);
});

test("returns the animated AECK 404 page for unknown routes", async () => {
  const response = await render("/duong-dan-khong-ton-tai");
  assert.equal(response.status, 404);
  const html = await response.text();
  assert.match(html, /404 · NOT FOUND/);
  assert.match(html, /Bạn không nên ở đây/);
  assert.match(html, /Quay về trang chính/);
  assert.match(html, /404-eyes\.html/);
});

test("keeps dashboard routes, Supabase data, and responsive reference styling", async () => {
  const [platform, css, studyCss, lessonFilesRoute, lessonResourcesRoute, videoTokenRoute, resourceContentRoute, pdfDownloadRoute, videoPlayer, contentToken, vidstackHtml, pdfViewerHtml, examRoom, examCss, examsRoute, examMigration, adminExams, adminExamsCss, adminWorkspace, adminWorkspaceCss, adminWorkspaceLayoutCss, adminUsersRoute, r2Server] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/study.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/lesson-files/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/lesson-resources/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/video-token/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/resource-content/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/lesson-pdf-download/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/video-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/content-token.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/yt-embed-player.html", import.meta.url), "utf8"),
    readFile(new URL("../public/pdf-viewer.html", import.meta.url), "utf8"),
    readFile(new URL("../app/exam-room.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/exam-room.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/exams/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/006_exam_room_module.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-exams.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-exams.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-exam-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-exam-latex-import.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-exam-workspace.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/users/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/r2-server.ts", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /"\/dashboard"/);
  assert.match(platform, /"\/courses"/);
  assert.doesNotMatch(platform, /demo-course|demo-lesson/);
  assert.match(platform, /const href = `\/courses\/\$\{encodeURIComponent\(String\(course\.id\)\)\}`/);
  assert.match(platform, /"\/exam-history"/);
  assert.match(platform, /supabase\.from\("profiles"\)/);
  assert.match(platform, /authenticatedFetch\("\/api\/exams\?scope=rooms"/);
  assert.match(platform, /setAttempts\(examRoomsPayload\?\.attempts \?\? \[\]\)/);
  assert.doesNotMatch(platform, /supabase\.from\("exam_attempts"\)/);
  assert.match(platform, /<Profile profile=\{activeProfile\} attempts=\{attempts\}/);
  assert.match(platform, /supabase\.from\("profiles"\)\.update\(\{ full_name: nextName/);
  assert.doesNotMatch(platform, /Minh Hoàng|minhhoang@example\.com/);
  assert.match(platform, /function RealAdminDashboard/);
  assert.match(platform, /const adminRouteRequested = pathname\.startsWith\("\/admin"\)/);
  assert.match(platform, /function AdminLoginPage/);
  assert.match(platform, /adminRouteRequested && \(!signedIn \|\| !isAdmin\)/);
  assert.match(platform, /loginContext === "admin" && profile\.role !== "admin"/);
  assert.match(platform, /adminRouteRequested \? adminNav\.map/);
  assert.match(platform, /admin-sidebar-nav-item/);
  assert.match(platform, /next === "admin" && !isAdmin/);
  assert.match(platform, /currentView === "admin" && isAdmin && <RealAdminDashboard/);
  assert.match(platform, /aria-controls="main-sidebar"/);
  assert.match(platform, /mobile-sidebar-close/);
  assert.match(platform, /document\.body\.style\.overflow = "hidden"/);
  assert.match(platform, /profile\?\.role === "admin" && profile\.status === "active"/);
  assert.doesNotMatch(platform, /profileData \?\?/);
  assert.match(platform, /supabase\.from\("profiles"\)\.select\("id,full_name,student_code,role,status,created_at"\)/);
  assert.match(platform, /supabase\.from\("courses"\)\.select\("id,title,description,cover_url,cover_color,published,sort_order,created_at"\)/);
  assert.match(platform, /type="color"/);
  assert.match(platform, /cover_color: courseColor/);
  assert.match(platform, /supabase\.from\("courses"\)\.insert\(/);
  assert.match(platform, /function AdminCourseBuilder/);
  assert.match(platform, /Khóa học → Phần → Bài → Bài giảng \/ tài liệu/);
  assert.match(platform, /function formatPartTitle/);
  assert.match(platform, /function formatLessonTitle/);
  assert.match(platform, /Thêm nội dung bài/);
  assert.match(platform, /function openRenameModal/);
  assert.doesNotMatch(platform, /window\.prompt|prompt\(/);
  assert.match(platform, /supabase\.from\("chapters"\)\.insert\(/);
  assert.match(platform, /supabase\.from\("lessons"\)\.insert\(/);
  assert.match(platform, /supabase\.from\("lesson_resources"\)\.insert\(/);
  assert.match(platform, /administrator\s*\?\s*await supabase\.from\("courses"\)/);
  assert.match(platform, /Danh sách khóa học/);
  assert.match(platform, /storage_pdf/);
  assert.match(platform, /authenticatedFetch\("\/api\/admin\/lesson-files"/);
  assert.doesNotMatch(platform, /supabase\.storage\.from\("lesson-files"\)\.upload/);
  assert.match(platform, /supabase\.from\("course_enrollments"\)\.upsert\(/);
  assert.match(platform, /Tạo khóa học/);
  assert.doesNotMatch(platform, /Nền tảng Toán học|Nâng cao: Toán|Đọc hiểu – Khoa học/);
  assert.doesNotMatch(platform, /localPreview|previewQuery|preview=1/);
  assert.match(platform, /lesson_resources/);
  assert.match(platform, /api\/lesson-resources\?lessonId=/);
  assert.doesNotMatch(platform, /from\("lesson_resources"\)\.select\("id,lesson_id,title,resource_type,resource_url,sort_order"\)\.eq\("lesson_id", lessonId\)/);
  assert.doesNotMatch(platform, /Trần Minh Hoàng|Nguyễn Thu Hà|Lê Gia Bảo|REMIX000128|REMIX000127/);
  assert.match(platform, /resetPasswordForEmail/);
  assert.match(platform, /"\/forgot-password"/);
  assert.match(platform, /"\/reset-password"/);
  assert.match(platform, /PASSWORD_RECOVERY/);
  assert.match(platform, /supabase\.auth\.updateUser\(\{ password: newPassword \}\)/);
  assert.match(platform, /className="page-stack dashboard-page"/);
  assert.match(platform, /Thống kê làm bài/);
  assert.match(platform, /className="lesson-breadcrumb"/);
  assert.match(platform, /className="course-curriculum-panel"/);
  assert.match(platform, /function CourseCoverVisual/);
  assert.match(platform, /course-study-cover-fallback/);
  assert.match(platform, /currentView === "lesson" \? "lesson-main-content"/);

  assert.match(css, /font-family:Lato/);
  assert.match(css, /\.dashboard-page\{[^}]*max-width:1048px/);
  assert.match(css, /\.sidebar-expanded \.sidebar\{width:288px\}/);
  assert.match(css, /\.hierarchy-guide\{/);
  assert.match(css, /\.hierarchy-index\{/);
  assert.match(css, /@media\(max-width:767px\)/);
  assert.match(css, /@media\(max-width:575px\)/);
  assert.match(css, /Mobile navigation drawer/);
  assert.match(css, /\.mobile-sidebar-account/);
  assert.match(css, /overscroll-behavior:contain/);
  assert.match(studyCss, /\.curriculum-panel\{width:400px/);
  assert.match(studyCss, /@media\(max-width:1023px\)/);
  assert.match(studyCss, /@media\(max-width:767px\)/);
  assert.match(studyCss, /repeat\(auto-fill,minmax\(280px,1fr\)\)/);
  assert.match(studyCss, /curriculum-lesson:not\(\.current\) \.curriculum-resource\{display:none\}/);
  assert.match(studyCss, /scroll|overflow-y:auto/);

  assert.match(lessonFilesRoute, /ensureActiveAccount\(request\)/);
  assert.match(lessonFilesRoute, /profile\.role !== "admin"/);
  assert.match(lessonFilesRoute, /createPdfUpload\(path\)/);
  assert.match(lessonFilesRoute, /verifyPdfObject\(path, size, MAX_PDF_SIZE\)/);
  assert.match(r2Server, /function signedR2Request/);
  assert.match(r2Server, /function createPresignedR2Url/);
  assert.match(r2Server, /crypto\.subtle/);
  assert.match(r2Server, /expiresIn: 120/);
  assert.match(r2Server, /listR2Objects/);
  assert.match(lessonResourcesRoute, /signContentToken/);
  assert.match(lessonResourcesRoute, /course_enrollments/);
  assert.match(lessonResourcesRoute, /curriculum/);
  assert.match(lessonResourcesRoute, /allow_download/);
  assert.doesNotMatch(lessonResourcesRoute, /resource_url/);
  assert.match(videoTokenRoute, /verifyContentToken/);
  assert.match(videoTokenRoute, /payload\.sub !== auth\.user\.id/);
  assert.match(videoTokenRoute, /resource_url/);
  assert.match(videoTokenRoute, /protectedContent: "pdf"/);
  assert.doesNotMatch(videoTokenRoute, /contentPath|set-cookie/);
  assert.doesNotMatch(videoTokenRoute, /url: resource\.resource_url/);
  assert.match(resourceContentRoute, /export async function POST/);
  assert.match(resourceContentRoute, /ensureActiveAccount\(request, admin\)/);
  assert.match(resourceContentRoute, /body\.videoToken/);
  assert.match(resourceContentRoute, /payload\.sub !== auth\.user\.id/);
  assert.match(resourceContentRoute, /export async function HEAD/);
  assert.match(resourceContentRoute, /Nội dung PDF không thể mở trực tiếp/);
  assert.match(resourceContentRoute, /loadPdfBytes\(resource\.resource_url, MAX_PDF_BYTES\)/);
  assert.match(resourceContentRoute, /arrayBufferToBase64/);
  assert.match(resourceContentRoute, /encoding: "base64"/);
  assert.match(resourceContentRoute, /resource\.resource_url/);
  assert.match(pdfDownloadRoute, /PDFDocument\.load/);
  assert.match(pdfDownloadRoute, /drawText\(mark/);
  assert.match(pdfDownloadRoute, /Asia\/Ho_Chi_Minh/);
  assert.match(pdfDownloadRoute, /auth\.user\.email/);
  // allow_download, enrollment and published now live in lib/resource-access.ts
  // and are unit tested in resource-access.test.mjs. What matters here is that
  // every content route delegates to that policy with the correct mode.
  const guardCall = mode => new RegExp(`guardResourceAccess\\(admin, security\\.user\\.id, security\\.profile, payload\\.rid, "${mode}"\\)`);
  assert.match(pdfDownloadRoute, guardCall("download"));
  assert.match(resourceContentRoute, guardCall("view"));
  assert.match(videoTokenRoute, guardCall("view"));
  assert.match(videoPlayer, /authenticatedFetch\("\/api\/video-token"/);
  assert.match(videoPlayer, /\/yt-embed-player\.html\?v=/);
  assert.match(videoPlayer, /\/yt-embed-player\.html\?mode=native/);
  assert.match(videoPlayer, /remix:set-video-source/);
  assert.match(videoPlayer, /\/pdf-viewer\.html\?file=/);
  assert.match(videoPlayer, /protectedContent/);
  assert.match(videoPlayer, /authenticatedFetch\("\/api\/resource-content"/);
  assert.match(videoPlayer, /atob\(payload\.data\)/);
  assert.match(videoPlayer, /URL\.createObjectURL/);
  assert.doesNotMatch(videoPlayer, /x-remix-content-viewer/);
  assert.doesNotMatch(videoPlayer, /content\.url/);
  assert.match(contentToken, /AES-GCM/);
  assert.match(contentToken, /crypto\.subtle\.encrypt/);
  assert.doesNotMatch(videoPlayer, /Mở tài liệu gốc/);
  assert.match(vidstackHtml, /import "https:\/\/cdn\.vidstack\.io\/player"/);
  assert.match(vidstackHtml, /media-video-layout/);
  assert.match(vidstackHtml, /remix:video-player-ready/);
  assert.match(vidstackHtml, /event\.origin !== location\.origin/);
  assert.match(vidstackHtml, /allowedMicrosoftHostSuffixes/);
  assert.match(vidstackHtml, /html,body\{[^}]*overflow:hidden/);
  assert.match(vidstackHtml, /media-player\{[^}]*max-width:100%/);
  assert.match(vidstackHtml, /media-video-layout\{position:absolute;inset:0/);
  assert.match(pdfViewerHtml, /pdfjs-dist@5\.4\.624\/build\/pdf\.mjs/);
  assert.match(pdfViewerHtml, /getDocument\(\{ url: file, disableRange: true, disableStream: true \}\)/);
  assert.match(pdfViewerHtml, /for \(let number = 1; number <= documentRef\.numPages; number \+= 1\)/);
  assert.match(pdfViewerHtml, /id="download"/);
  assert.match(videoPlayer, /\/api\/lesson-pdf-download/);
  assert.match(videoPlayer, /resource\.allow_download/);
  assert.match(pdfViewerHtml, /remix:pdf-download-request/);
  assert.match(platform, /lazy\(\(\) => import\("\.\/exam-room"\)\)/);
  assert.match(examRoom, /katex\.renderToString/);
  assert.match(examRoom, /trust: false/);
  assert.match(examRoom, /QuestionPalette/);
  assert.match(examRoom, /\/api\/exams\?scope=/);
  assert.match(examCss, /@media\(max-width:767px\)/);
  assert.match(examCss, /\.exam-question-actions\{position:fixed/);
  assert.match(examsRoute, /exam_question_keys/);
  assert.match(examsRoute, /status: "in_progress"/);
  assert.match(examMigration, /create table if not exists public\.exam_rooms/);
  assert.match(examMigration, /create table if not exists public\.exam_question_keys/);
  assert.match(platform, /lazy\(\(\) => import\("\.\/admin-exam-workspace"\)\)/);
  assert.match(platform, /id: "exams" as const,[^\n]+label: "Đề thi"/);
  assert.match(adminExams, /from\("exam_rooms"\)\.insert/);
  assert.match(adminExams, /from\("exams"\)\.insert/);
  assert.match(adminExams, /dashboard_title: dashboardTitle/);
  assert.match(adminExams, /from\("exam_sections"\)\.insert/);
  assert.match(adminExams, /from\("exam_questions"\)\.insert/);
  assert.match(adminExams, /from\("exam_question_keys"\)\.insert/);
  assert.match(adminExamsCss, /@media\(max-width:767px\)/);
  assert.match(adminWorkspace, /splitLatexQuestions/);
  assert.match(adminWorkspace, /accept="\.tex,text\/plain"/);
  assert.match(adminWorkspace, /LearnerExamPreview/);
  assert.doesNotMatch(adminWorkspace, /latex-preview-column/);
  assert.match(adminWorkspace, /reference-exam-card admin-reference-exam-card/);
  assert.match(adminWorkspace, /Nhập file/);
  assert.match(adminWorkspace, /Soạn đề/);
  assert.match(adminWorkspace, /function ExamPreviewPage/);
  assert.match(adminWorkspace, /dashboard_title: dashboardTitle/);
  assert.doesNotMatch(adminWorkspace, /dashboard_title: isThptqg[^\n]+: null/);
  assert.match(adminWorkspace, /openExamPreviewTab/);
  assert.match(adminWorkspace, /Giao diện bài làm/);
  assert.match(adminWorkspace, /Giao diện đáp án/);
  assert.doesNotMatch(adminWorkspace, /preview-correct/);
  assert.match(adminWorkspaceCss, /latex-file-import/);
  assert.match(adminWorkspaceLayoutCss, /admin-reference-exam-card/);
  assert.match(adminWorkspaceLayoutCss, /exam-preview-page/);
  assert.match(platform, /initialAdminRoute/);
  assert.match(platform, /initialStandaloneAdminPreview/);
  assert.match(platform, /admin-exam-preview-host/);
  assert.match(platform, /id: "enrollments" as const,[^\n]+label: "Phân quyền"/);
  assert.match(platform, /supabase\.from\("exam_room_enrollments"\)\.upsert/);
  assert.match(platform, /student\.email/);
  assert.match(platform, /Tìm theo tên, mã học viên hoặc email/);
  assert.match(platform, /student-name-email/);
  assert.match(adminUsersRoute, /export async function GET/);
  assert.match(adminUsersRoute, /admin\.auth\.admin\.listUsers/);
  assert.doesNotMatch(adminExams, /Phân quyền học viên/);
  assert.doesNotMatch(pdfViewerHtml, /Mở file gốc|Mở tài liệu trong tab mới/);
});
