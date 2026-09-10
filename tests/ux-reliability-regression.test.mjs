import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AECK confirmation can keep a destructive confirmation open and announce its request error", async () => {
  const [component, css] = await Promise.all([
    source("components/aeck/AeckConfirmDialog.tsx"),
    source("components/aeck/aeck-confirm-dialog.css"),
  ]);

  assert.match(component, /errorMessage\?: string/);
  assert.match(component, /const errorId = useId\(\)/);
  assert.match(component, /aria-describedby=\{errorMessage \? `\$\{descriptionId\} \$\{errorId\}` : descriptionId\}/);
  assert.match(component, /className="aeck-confirm-dialog__error" role="alert"/);
  assert.match(css, /\.aeck-confirm-dialog__error/);
});

test("destructive admin dialogs retain their context and show request errors in place", async () => {
  const [sessions, upload, courseTimetable, timetable] = await Promise.all([
    source("app/admin-sessions.tsx"),
    source("app/admin-upload.tsx"),
    source("app/admin-course-timetable.tsx"),
    source("app/admin-timetable.tsx"),
  ]);

  assert.match(sessions, /const \[deleteError, setDeleteError\] = useState\(""\);/);
  assert.doesNotMatch(sessions, /catch \(value\) \{\s*setPendingDelete\(null\);/);
  assert.match(sessions, /errorMessage=\{deleteError\}/);
  assert.match(upload, /const \[imageDeletionError, setImageDeletionError\] = useState\(""\);/);
  assert.match(upload, /const \[examImageDeletionError, setExamImageDeletionError\] = useState\(""\);/);
  assert.match(upload, /errorMessage=\{imageDeletionError\}/);
  assert.match(upload, /errorMessage=\{examImageDeletionError\}/);
  assert.match(courseTimetable, /const \[eventDeletionError, setEventDeletionError\] = useState\(""\);/);
  assert.match(courseTimetable, /errorMessage=\{eventDeletionError\}/);
  assert.match(timetable, /const \[scheduleRemovalError, setScheduleRemovalError\] = useState\(""\);/);
  assert.match(timetable, /updateSchedule\(null, null, "remove"\)/);
  assert.match(timetable, /errorMessage=\{scheduleRemovalError\}/);
});

test("HLS native-agent probing is cancellable and the MP4 field supports drag and drop", async () => {
  const [component, css] = await Promise.all([
    source("app/admin-hls-vault.tsx"),
    source("app/admin-hls-vault.css"),
  ]);

  assert.match(component, /const NATIVE_AGENT_CHECK_TIMEOUT_MS = 5_000;/);
  assert.match(component, /nativeAgentProbeControllerRef\.current\?\.abort\(\)/);
  assert.match(component, /nativeAgentProbeIdRef\.current \+= 1/);
  assert.match(component, /signal: controller\.signal/);
  assert.match(component, /const agentReady = await checkNativeAgent\(\);/);
  assert.match(component, /function applySelectedFile\(next: File \| null\)/);
  assert.match(component, /onDragOver=\{handleFileDragOver\}/);
  assert.match(component, /onDragLeave=\{handleFileDragLeave\}/);
  assert.match(component, /onDrop=\{handleFileDrop\}/);
  assert.match(component, /Dùng FFmpeg trong trình duyệt/);
  assert.match(css, /\.admin-hls-vault-dropzone\.is-dragging/);
});

test("student and admin navigation remain reachable on narrow screens", async () => {
  const [courseTabs, adminMacos, securityCss, profileCss] = await Promise.all([
    source("app/course-exam-tabs.css"),
    source("app/admin-product-shell.css"),
    source("app/admin-security.css"),
    source("app/student-reference-fidelity.css"),
  ]);

  const mobileTabs = courseTabs.slice(courseTabs.indexOf("@media (max-width: 575px)"));
  assert.match(mobileTabs, /flex: 1 1 0;/);
  assert.match(mobileTabs, /min-width: 0;/);
  assert.doesNotMatch(mobileTabs, /flex: 1 0 auto;/);
  assert.match(adminMacos, /:not\(\.protected-exam-surface\):not\(\.sidebar-expanded\) > \.sidebar:not\(\.mobile-open\) \.admin-sidebar-section-label/);
  assert.match(adminMacos, /> \.sidebar\.mobile-open \.admin-sidebar-section-label/);
  assert.match(adminMacos, /@media \(max-width: 767px\)[\s\S]*?> \.sidebar:not\(\.mobile-open\) \.admin-sidebar-section-label[\s\S]*?display: none !important;/);
  assert.match(securityCss, /security-admin-head > div:first-child[\s\S]*?flex: 0 1 auto;/);
  assert.match(profileCss, /\.ui-shell\.student-app\.product-shell:not\(\.protected-exam-surface\) \.profile-portal-contact[\s\S]*?display: none;/);
});

test("student discovery controls group filters and explain the mobile timetable scroll region", async () => {
  const [discovery, timetableCss] = await Promise.all([
    source("app/student-discovery.tsx"),
    source("app/student-timetable-reference.css"),
  ]);

  assert.match(discovery, /className="reference-search-filters" role="group" aria-label="Lọc loại nội dung"/);
  assert.match(discovery, /id="student-timetable-scroll-hint"/);
  assert.match(discovery, /role="region" aria-label="Lịch học theo tuần" aria-describedby="student-timetable-scroll-hint" tabIndex=\{0\}/);
  assert.match(timetableCss, /\.student-timetable-scroll-hint/);
  assert.match(timetableCss, /\.student-timetable-scroll:focus-visible/);
});

test("public course status text and Zalo action meet readable contrast", async () => {
  const css = await source("app/aeck-public-site.module.css");
  assert.match(css, /\.courseCardBody small\s*\{[\s\S]*?color:\s*#667085;/);
  assert.match(css, /\.zaloContact\s*\{[\s\S]*?background:\s*#0868d7;/);
});

test("shared Lato faces use compressed WOFF2 files", async () => {
  const [globals, system] = await Promise.all([
    source("app/globals.css"),
    source("app/ui-system.css"),
  ]);

  for (const css of [globals, system]) {
    assert.match(css, /Lato-Regular\.woff2/);
    assert.match(css, /Lato-Medium\.woff2/);
    assert.match(css, /Lato-Bold\.woff2/);
    assert.doesNotMatch(css, /Lato-(?:Regular|Medium|Bold)\.ttf/);
  }
});

test("the production framework includes the audited Next.js security patch", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  assert.equal(packageJson.dependencies.next, "16.3.4");
  assert.equal(packageJson.overrides?.["baseline-browser-mapping"], "2.11.0");
});

test("public home preloads only its first above-the-fold teacher image", async () => {
  const publicSite = await source("app/aeck-public-site.tsx");
  assert.match(publicSite, /function TeacherCard\(\{ teacher, onOpen, compact = false, priority = false \}/);
  assert.match(publicSite, /priority=\{priority\}/);
  assert.match(publicSite, /featuredTeachers\.map\(\(teacher, index\) => \([\s\S]*?priority=\{index === 0\}/);
});

test("the unreferenced legacy admin exam editor is removed", async () => {
  await assert.rejects(access(new URL("../app/admin-exams.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../app/admin-exams.css", import.meta.url)));
});

test("worker applies baseline browser security headers without breaking HLS isolation", async () => {
  const worker = await source("worker/index.ts");
  assert.match(worker, /const BASE_SECURITY_HEADERS = \{/);
  assert.match(worker, /"x-content-type-options": "nosniff"/);
  assert.match(worker, /"referrer-policy": "strict-origin-when-cross-origin"/);
  assert.match(worker, /"permissions-policy": "camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\)"/);
  assert.match(worker, /"x-frame-options": "SAMEORIGIN"/);
  assert.match(worker, /withHeaders\(response, \{ \.\.\.BASE_SECURITY_HEADERS, \.\.\.HLS_ENCODER_HEADERS \}\)/);
});
