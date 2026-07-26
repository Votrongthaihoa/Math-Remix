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

test("server-renders the REMIX sign-in page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>REMIX Education<\/title>/i);
  assert.match(html, /CHÀO MỪNG TRỞ LẠI/);
  assert.match(html, /Tài khoản học tập được cấp bởi quản trị viên/);
  assert.match(html, /placeholder="hocvien@example\.com"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Building your site/i);
});

test("returns the animated REMIX 404 page for unknown routes", async () => {
  const response = await render("/duong-dan-khong-ton-tai");
  assert.equal(response.status, 404);
  const html = await response.text();
  assert.match(html, /404 · NOT FOUND/);
  assert.match(html, /Bạn không nên ở đây/);
  assert.match(html, /Quay về trang chính/);
  assert.match(html, /404-eyes\.html/);
});

test("keeps dashboard routes, Supabase data, and responsive reference styling", async () => {
  const [platform, css, studyCss, lessonFilesRoute, lessonResourcesRoute, videoTokenRoute, resourceContentRoute, pdfDownloadRoute, videoPlayer, contentToken, vidstackHtml, pdfViewerHtml, examRoom, examCss, examsRoute, examMigration, adminExams, adminExamsCss, adminUsersRoute] = await Promise.all([
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
    readFile(new URL("../app/api/admin/users/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /"\/dashboard"/);
  assert.match(platform, /"\/courses"/);
  assert.doesNotMatch(platform, /demo-course|demo-lesson/);
  assert.match(platform, /`\/courses\/\$\{encodeURIComponent\(String\(courseId\)\)\}`/);
  assert.match(platform, /"\/exam-history"/);
  assert.match(platform, /supabase\.from\("profiles"\)/);
  assert.match(platform, /supabase\.from\("exam_attempts"\)/);
  assert.match(platform, /<Profile profile=\{activeProfile\} attempts=\{attempts\}/);
  assert.match(platform, /supabase\.from\("profiles"\)\.update\(\{ full_name: nextName/);
  assert.doesNotMatch(platform, /Minh Hoàng|minhhoang@example\.com/);
  assert.match(platform, /function RealAdminDashboard/);
  assert.match(platform, /view === "admin" && !isAdmin \? "overview" : view/);
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
  assert.match(platform, /fetch\("\/api\/admin\/lesson-files"/);
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
  assert.match(platform, /course-cover-fallback course-study-cover-fallback/);
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

  assert.match(lessonFilesRoute, /admin\.auth\.getUser\(token\)/);
  assert.match(lessonFilesRoute, /profile\?\.role !== "admin"/);
  assert.match(lessonFilesRoute, /createBucket\(BUCKET/);
  assert.match(lessonFilesRoute, /\.storage\.from\(BUCKET\)\.upload/);
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
  assert.match(resourceContentRoute, /upstream\.status === 204 \|\| !upstream\.body/);
  assert.match(resourceContentRoute, /await upstream\.arrayBuffer\(\)/);
  assert.match(resourceContentRoute, /pdfBytes\.byteLength/);
  assert.match(resourceContentRoute, /arrayBufferToBase64/);
  assert.match(resourceContentRoute, /encoding: "base64"/);
  assert.match(resourceContentRoute, /resource\.resource_url/);
  assert.match(pdfDownloadRoute, /PDFDocument\.load/);
  assert.match(pdfDownloadRoute, /drawText\(mark/);
  assert.match(pdfDownloadRoute, /Asia\/Ho_Chi_Minh/);
  assert.match(pdfDownloadRoute, /auth\.user\.email/);
  assert.match(pdfDownloadRoute, /resource\.allow_download/);
  assert.match(videoPlayer, /fetch\("\/api\/video-token"/);
  assert.match(videoPlayer, /\/yt-embed-player\.html\?v=/);
  assert.match(videoPlayer, /\/pdf-viewer\.html\?file=/);
  assert.match(videoPlayer, /protectedContent/);
  assert.match(videoPlayer, /fetch\("\/api\/resource-content"/);
  assert.match(videoPlayer, /atob\(payload\.data\)/);
  assert.match(videoPlayer, /URL\.createObjectURL/);
  assert.doesNotMatch(videoPlayer, /x-remix-content-viewer/);
  assert.doesNotMatch(videoPlayer, /content\.url/);
  assert.match(contentToken, /AES-GCM/);
  assert.match(contentToken, /crypto\.subtle\.encrypt/);
  assert.doesNotMatch(videoPlayer, /Mở tài liệu gốc/);
  assert.match(vidstackHtml, /import "https:\/\/cdn\.vidstack\.io\/player"/);
  assert.match(vidstackHtml, /media-video-layout/);
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
  assert.match(platform, /lazy\(\(\) => import\("\.\/admin-exams"\)\)/);
  assert.match(platform, /\["exams","Khảo thí"\]/);
  assert.match(adminExams, /from\("exam_rooms"\)\.insert/);
  assert.match(adminExams, /from\("exams"\)\.insert/);
  assert.match(adminExams, /from\("exam_sections"\)\.insert/);
  assert.match(adminExams, /from\("exam_questions"\)\.insert/);
  assert.match(adminExams, /from\("exam_question_keys"\)\.insert/);
  assert.match(adminExamsCss, /@media\(max-width:767px\)/);
  assert.match(platform, /\["enrollments","Phân quyền"\]/);
  assert.match(platform, /supabase\.from\("exam_room_enrollments"\)\.upsert/);
  assert.match(platform, /student\.email/);
  assert.match(platform, /Tìm theo tên, mã học viên hoặc email/);
  assert.match(platform, /student-name-email/);
  assert.match(adminUsersRoute, /export async function GET/);
  assert.match(adminUsersRoute, /admin\.auth\.admin\.listUsers/);
  assert.doesNotMatch(adminExams, /Phân quyền học viên/);
  assert.doesNotMatch(pdfViewerHtml, /Mở file gốc|Mở tài liệu trong tab mới/);
});
