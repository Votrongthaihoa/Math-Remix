import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("learner reference fidelity layer uses one red-white theme without touching protected exam UI", async () => {
  const [platform, styles, finalTheme, redWordmark, redCompact] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/student-reference-fidelity.css", import.meta.url), "utf8"),
    readFile(new URL("../app/red-white-theme.css", import.meta.url), "utf8"),
    readFile(new URL("../public/logo_aeck_red.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/logo_aeck_compact_red.svg", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /import "\.\/student-reference-fidelity\.css";/);
  assert.match(platform, /import "\.\/red-white-theme\.css";/);
  assert.doesNotMatch(platform, /learner-green-theme/);
  assert.match(platform, /\/logo_aeck_red\.svg/);
  assert.match(platform, /\/logo_aeck_compact_red\.svg/);
  assert.match(styles, /\.ui-shell\.student-app\.product-shell:not\(\.protected-exam-surface\)/);
  assert.match(styles, /--learner-accent:\s*#cd1627;/i);
  assert.doesNotMatch(styles, /\.learner-green-theme/);
  assert.match(finalTheme, /--brand-red:\s*#cd1627;/i);
  assert.match(redWordmark, /#cd1627/i);
  assert.match(redCompact, /#cd1627/i);
  assert.doesNotMatch(redWordmark, /#158a39/i);
  assert.doesNotMatch(redCompact, /#158a39/i);
  assert.doesNotMatch(styles, /(?:exam-shell|question-|answer-|exam-result|review-|solution-)/i);
  assert.doesNotMatch(finalTheme, /(?:exam-shell|question-|answer-|exam-result|review-|solution-)/i);
});

test("profile renders the supplied portal structure, recoverable data states, and a keyboard skip link", async () => {
  const [platform, styles] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/student-reference-fidelity.css", import.meta.url), "utf8"),
  ]);
  const profileSource = platform.slice(platform.indexOf("function Profile"), platform.indexOf("function Detail"));
  const profileMounts = [...platform.matchAll(/<Profile\b[\s\S]*?\/>/g)].map(match => match[0]);
  const historyIssueStart = profileSource.indexOf("Chưa tải được lịch sử làm bài. Hãy thử lại.");
  const historyIssue = historyIssueStart >= 0 ? profileSource.slice(Math.max(0, historyIssueStart - 400), historyIssueStart + 500) : "";
  const skipLinkStart = profileSource.indexOf("profile-portal-skip-link");
  const skipLink = skipLinkStart >= 0 ? profileSource.slice(Math.max(0, skipLinkStart - 100), skipLinkStart + 600) : "";

  assert.ok(profileMounts.length > 0, "profile state should be forwarded by the product shell");
  for (const profileMount of profileMounts) {
    assert.match(profileMount, /\bcoursesLoading\s*=\s*\{\s*coursesLoading\s*\}/);
    assert.match(profileMount, /\bcoursesError\s*=\s*\{\s*coursesError\s*\}/);
    assert.match(profileMount, /\bonRetryCourses\s*=\s*\{[^}]+\}/);
    assert.match(profileMount, /\boverviewLoading\s*=\s*\{\s*overviewLoading\s*\}/);
    assert.match(profileMount, /\battemptsError\s*=\s*\{\s*overviewAttemptsError\s*\}/);
    assert.match(profileMount, /\bonRetryOverview\s*=\s*\{[^}]+\}/);
  }
  assert.match(profileSource, /className="profile-portal-reference ui-shell student-app product-shell learner-red-theme"/);
  assert.match(profileSource, /const activeTab = searchParams\.get\("tab"\) === "courses" \? "courses" : "info"/);
  assert.match(profileSource, /className="profile-portal-sidebar lg:w-72 lg:shrink-0"/);
  assert.match(profileSource, /className="profile-portal-content min-w-0 flex-1"/);
  assert.match(profileSource, /Khóa học của tôi/);
  assert.ok(skipLinkStart >= 0, "profile should expose a skip link before its repeated navigation");
  assert.match(skipLink, /<a\b/);
  assert.match(skipLink, /href\s*=\s*["']#profile-main["']/);
  assert.match(skipLink, /Bỏ qua đến nội dung chính/);
  assert.match(profileSource, /<main\b[^>]*\bid\s*=\s*["']profile-main["']/);
  assert.match(profileSource, /<main\b[^>]*\btabIndex\s*=\s*\{\s*-1\s*\}/);
  assert.match(profileSource, /\bcoursesLoading\b/);
  assert.match(profileSource, /\bcoursesError\b/);
  assert.match(profileSource, /\battemptsError\b/);
  assert.match(profileSource, /\boverviewLoading\b/);
  assert.match(profileSource, /Chưa tải được lịch sử làm bài\. Hãy thử lại\./);
  assert.match(historyIssue, /role="alert"/);
  assert.match(historyIssue, /onClick\s*=\s*\{\s*(?:onRetryOverview|\(\s*\)\s*=>\s*onRetryOverview\(\s*\))\s*\}/);
  assert.match(profileSource, /Tải lại thống kê/);
  assert.match(styles, /\.profile-portal-reference[^{]{0,80}\.profile-portal-skip-link\s*\{/);
  assert.match(styles, /\.profile-portal-reference[^{]{0,80}\.profile-portal-skip-link:focus-visible\s*\{/);
  assert.match(styles, /\.profile-portal-reference[^{]{0,80}#profile-main\s*\{[^}]*scroll-margin-(?:top|block-start)\s*:/s);
});

test("exam history follows the supplied date-grouped table structure", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");
  const historySource = platform.slice(platform.indexOf("function ExamHistory"), platform.indexOf("function HistoryLoading"));

  assert.match(historySource, /const groupedAttempts = \(\(\) =>/);
  assert.match(historySource, /new Intl\.DateTimeFormat\("vi-VN"/);
  assert.match(historySource, /className="history-date-groups"/);
  assert.match(historySource, /className="history-date-group"/);
  assert.match(historySource, /className="history-date-frame"/);
});

test("timetable keeps the supplied geometry and uses the approved learner accent", async () => {
  const discovery = await readFile(new URL("../app/student-discovery.tsx", import.meta.url), "utf8");
  const timetableSource = discovery.slice(discovery.indexOf("const timetableStartHour"), discovery.indexOf("export type AdminFinderItem"));

  assert.match(timetableSource, /const timetableAccent = "#cd1627"/);
  assert.match(timetableSource, /student-timetable-scroll overflow-y-auto overflow-x-auto/);
  assert.doesNotMatch(timetableSource, /#778CF7|119,\s*140,\s*247/i);
});

test("legacy portal alias preserves the requested profile tab", async () => {
  const route = await readFile(new URL("../app/[...slug]/page.tsx", import.meta.url), "utf8");

  assert.match(route, /searchParams: Promise<Record<string, string \| string\[\] \| undefined>>/);
  assert.match(route, /targetAlias === "\/profile" && query\.get\("tab"\) === "courses"/);
  assert.match(route, /redirect\("\/profile\?tab=courses"\)/);
});

test("learner shell preserves the fixed 288/80 rail and sticky reference header contracts", async () => {
  const styles = await readFile(new URL("../app/student-reference-fidelity.css", import.meta.url), "utf8");

  assert.match(styles, /--reference-sidebar-expanded:\s*288px/);
  assert.match(styles, /--reference-sidebar-collapsed:\s*80px/);
  assert.match(styles, /> \.sidebar\s*\{[^}]*position:\s*fixed;[^}]*height:\s*100dvh;[^}]*z-index:\s*40;/s);
  assert.match(styles, /> \.topbar\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*height:\s*81px;[^}]*z-index:\s*50;/s);
  assert.match(styles, /\.study-mode:not\(\.protected-exam-surface\) \.student-sidebar-brand\s*\{[^}]*position:\s*fixed;[^}]*width:\s*80px;[^}]*height:\s*72px;[^}]*z-index:\s*100;/s);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?> \.sidebar\.mobile-open\s*\{[^}]*width:\s*288px(?:\s*!important)?;/);
});

test("learner content uses the supplied 48px desktop and 16px narrow insets", async () => {
  const styles = await readFile(new URL("../app/student-reference-fidelity.css", import.meta.url), "utf8");

  assert.match(styles, /:not\(\.study-mode\)[^\{]*> \.main-content\.product-view-content\s*\{[^}]*padding:\s*48px;/s);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?:not\(\.study-mode\)[^\{]*> \.main-content\.product-view-content\s*\{[^}]*padding:\s*16px;/s);
  assert.match(styles, /\.course-study-mode[^\{]*> \.main-content\s*\{[^}]*padding:\s*0 24px 56px;/s);
});

test("course detail and lesson share the supplied compact study shell", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /currentView === "schedule" \? false : currentView === "course" \? false : currentView === "lesson" \? studySidebarOpen : productSidebarOpen/);
  assert.match(platform, /currentView === "course" \? "study-mode course-study-mode" : currentView === "lesson" \? "study-mode" : currentView === "schedule" \? "schedule-mode" : ""/);
  assert.match(platform, /currentView === "lesson" \? "lesson-main-content" : currentView === "course" \? "lesson-main-content" : ""/);
});

test("study browser QA expects the supplied compact navigation inset", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /directNavigation\.paddingTop === "4px"/);
});

test("browser QA expects the shared red product logo in both learner and admin drawers", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /expectedDrawerLogo = "\/logo_aeck_red\.svg"/);
  assert.match(smoke, /opened\.drawerFullLogoSource !== expectedDrawerLogo/);
  assert.match(smoke, /result\.visibleSidebarLogoSource !== "\/logo_aeck_compact_red\.svg"/);
  assert.match(smoke, /result\.fullLogoSource !== "\/logo_aeck_red\.svg"/);
});

test("browser QA expects the red compact mark after the admin rail collapses", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");
  const adminRailCheck = smoke.slice(smoke.indexOf("async function inspectCollapsedAdminSidebar"), smoke.indexOf("async function inspectCollapsedStudentSidebar"));

  assert.match(adminRailCheck, /state\.visibleSidebarLogoSource !== "\/logo_aeck_compact_red\.svg"/);
});

test("browser QA locks the supplied learner theme, shell geometry, padding and exam action color", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /referenceSidebarWidth/);
  assert.match(smoke, /referenceTopbarHeight/);
  assert.match(smoke, /referenceMainPaddingInlineStart/);
  assert.match(smoke, /referenceVisibleLogoSources/);
  assert.match(smoke, /referencePrimaryActionBackground/);
  assert.match(smoke, /\.reference-room-start, \.reference-exam-start/);
  assert.match(smoke, /Learner reference contract failed/);
  assert.match(smoke, /!state\.shell\.includes\("profile-portal-reference"\)/);
  assert.match(smoke, /rgb\(205, 22, 39\)/);
});

test("course catalog keeps the supplied grid while allowing the 280px source card to shrink at narrow widths", async () => {
  const [platform, styles] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/aeck-reference-ui.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /className=\{`grid reference-course-grid grid-cols-\[repeat\(auto-fill,minmax\(280px,1fr\)\)\]/);
  assert.match(styles, /\.course-grid\.reference-course-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill, minmax\(min\(100%, 280px\), 1fr\)\);/s);
});

test("browser QA verifies both supplied profile portal tabs", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /async function inspectProfilePortalTabs\(\)/);
  assert.match(smoke, /student-profile-courses-1440\.png/);
  assert.match(smoke, /profileTab === "courses"/);
});

test("browser QA treats the supplied history table as an intentional internal scroll region", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /\.history-date-frame/);
  assert.match(smoke, /"history-date-frame"/);
});

test("browser QA follows the visible supplied course card instead of the hidden legacy view toggle", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /locator\("a\.course-card-action"\)\.first\(\)\.click\(\)/);
  assert.doesNotMatch(smoke, /getByRole\("button", \{ name: "Danh s/);
});

test("learner sidebar uses direct routes and the original filled reference icons", async () => {
  const [platform, styles] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/student-reference-fidelity.css", import.meta.url), "utf8"),
  ]);
  const learnerNavigation = platform.slice(platform.indexOf('<Link key="overview"'), platform.indexOf("{isAdmin &&"));

  assert.match(platform, /function ReferenceSidebarIcon/);
  assert.match(platform, /viewBox="64 64 896 896"/);
  assert.match(platform, /M928 161H699\.2c-49\.1 0-97\.1 14\.1-138\.4 40\.7/);
  assert.match(platform, /M442\.3 677\.6l199\.4-156\.7/);
  assert.match(learnerNavigation, /href="\/exam-room"[\s\S]*?<ReferenceSidebarIcon name="read"/);
  assert.match(learnerNavigation, /href="\/courses"[\s\S]*?<ReferenceSidebarIcon name="play-square"/);
  assert.doesNotMatch(learnerNavigation, /student-nav-disclosure|student-nav-children|availableExamTypes\.map|visibleCourses\.map/);
  assert.match(styles, /nav\.student-sidebar-nav\s*\{[^}]*padding:\s*12px 0 16px !important;/s);
});

test("learner shell expands small visual controls without changing reference geometry", async () => {
  const [platform, styles] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/student-reference-fidelity.css", import.meta.url), "utf8"),
  ]);
  const courseDetailSource = platform.slice(platform.indexOf("function CourseDetail"), platform.indexOf("function LessonViewer"));

  assert.match(styles, /\.ui-shell\.student-app\.product-shell:not\(\.protected-exam-surface\) \.mobile-sidebar-close\s*\{[^}]*position:\s*relative;/s);
  assert.match(styles, /\.ui-shell\.student-app\.product-shell:not\(\.protected-exam-surface\) \.mobile-sidebar-close::after\s*\{[^}]*content:\s*"";[^}]*position:\s*absolute;[^}]*inset:\s*-10px;/s);
  assert.match(styles, /\.ui-shell\.student-app\.product-shell\.course-study-mode:not\(\.protected-exam-surface\) \.course-detail-breadcrumb a\[href="\/courses"\]\s*\{[^}]*position:\s*relative;/s);
  assert.match(styles, /\.ui-shell\.student-app\.product-shell\.course-study-mode:not\(\.protected-exam-surface\) \.course-detail-breadcrumb a\[href="\/courses"\]::after\s*\{[^}]*content:\s*"";[^}]*position:\s*absolute;[^}]*inset:\s*-10px;/s);
  assert.match(courseDetailSource, /href="\/courses"\s+aria-label="Quay lại khóa học"/);
});

test("course detail exposes one full semantic title that can grow beyond the compact breadcrumb", async () => {
  const [platform, styles] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/student-reference-fidelity.css", import.meta.url), "utf8"),
  ]);
  const courseDetailSource = platform.slice(platform.indexOf("function CourseDetail"), platform.indexOf("function LessonViewer"));

  assert.match(courseDetailSource, /<h1\b[^>]*\bclassName="[^"]*\bcourse-detail-title\b[^"]*"[^>]*>\{course\.title\}<\/h1>/);
  assert.equal((courseDetailSource.match(/<h1\b/g) ?? []).length, 1);
  assert.doesNotMatch(courseDetailSource, /truncate max-w-\[200px\]/);
  assert.match(styles, /\.ui-shell\.student-app\.product-shell\.course-study-mode:not\(\.protected-exam-surface\) \.course-detail-breadcrumb\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*72px;/s);
  assert.match(styles, /\.ui-shell\.student-app\.product-shell\.course-study-mode:not\(\.protected-exam-surface\) \.course-detail-breadcrumb-inner\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s);
  assert.match(styles, /\.ui-shell\.student-app\.product-shell\.course-study-mode:not\(\.protected-exam-surface\) \.course-detail-title\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s);
});
