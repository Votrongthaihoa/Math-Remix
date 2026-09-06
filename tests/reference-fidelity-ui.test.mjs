import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("learner reference fidelity layer owns the approved accent without touching protected exam UI", async () => {
  const [platform, styles] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/student-reference-fidelity.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /import "\.\/student-reference-fidelity\.css";/);
  assert.match(styles, /\.ui-shell\.student-app\.product-shell:not\(\.protected-exam-surface\)/);
  assert.match(styles, /--learner-accent:\s*#778cf7;/i);
  assert.doesNotMatch(styles, /(?:exam-shell|question-|answer-|exam-result|review-|solution-)/i);
});

test("profile renders the supplied portal structure with URL-backed information and course tabs", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");
  const profileSource = platform.slice(platform.indexOf("function Profile"), platform.indexOf("function Detail"));

  assert.match(platform, /<Profile profile=\{activeProfile\} courses=\{visibleCourses\} attempts=\{attempts\}/);
  assert.match(profileSource, /className="profile-portal-reference ui-shell student-app product-shell"/);
  assert.match(profileSource, /const activeTab = searchParams\.get\("tab"\) === "courses" \? "courses" : "info"/);
  assert.match(profileSource, /className="profile-portal-sidebar lg:w-72 lg:shrink-0"/);
  assert.match(profileSource, /className="profile-portal-content min-w-0 flex-1"/);
  assert.match(profileSource, /Khóa học của tôi/);
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

  assert.match(timetableSource, /const timetableAccent = "#778CF7"/);
  assert.match(timetableSource, /student-timetable-scroll overflow-y-auto overflow-x-auto/);
  assert.doesNotMatch(timetableSource, /#cd1627|205,\s*22,\s*39/i);
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

test("course detail and lesson share the supplied compact study shell", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /currentView === "schedule" \? false : currentView === "course" \? false : currentView === "lesson" \? studySidebarOpen : productSidebarOpen/);
  assert.match(platform, /currentView === "course" \? "study-mode course-study-mode" : currentView === "lesson" \? "study-mode" : currentView === "schedule" \? "schedule-mode" : ""/);
  assert.match(platform, /currentView === "lesson" \? "lesson-main-content" : currentView === "course" \? "lesson-main-content" : ""/);
});

test("browser QA verifies both supplied profile portal tabs", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /async function inspectProfilePortalTabs\(\)/);
  assert.match(smoke, /student-profile-courses-1440\.png/);
  assert.match(smoke, /profileTab === "courses"/);
});
