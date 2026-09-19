import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { eventPayload } from "../lib/course-timetable-server.ts";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("student timetable API filters events by enrolled courses without exposing meeting URLs", async () => {
  const route = await source("app/api/timetable/route.ts");
  assert.match(route, /ensureActiveAccount\(request\)/);
  assert.match(route, /course_enrollments/);
  assert.match(route, /course_schedule_events/);
  assert.doesNotMatch(route, /select\([^)]*meeting_url/);
});

test("admin can create live events and generate ordered lesson events for an existing course", async () => {
  const [route, generator] = await Promise.all([
    source("app/api/admin/course-timetable/route.ts"),
    source("app/api/admin/course-timetable/generate/route.ts"),
  ]);
  assert.match(route, /eventKind: "live"/);
  assert.match(route, /course_schedule_events/);
  assert.match(generator, /generateLessonSchedule/);
  assert.match(generator, /course_schedule_rules/);
  assert.match(generator, /eq\("published", true\)/);
  assert.match(generator, /normalizeWeekdays\(body\.weekdays\)/);
  assert.match(generator, /weekdays,\s*\r?\n\s*startTime/);
  assert.match(generator, /weekdays,\s*\r?\n\s*start_time/);
  assert.doesNotMatch(generator, /weekdays: \[\.\.\.new Set\(body\.weekdays/);
});

test("admin timetable keeps exam-room scheduling and adds course live and generated lesson workflows", async () => {
  const [wrapper, courseUi] = await Promise.all([
    source("app/admin-timetable.tsx"),
    source("app/admin-course-timetable.tsx"),
  ]);
  assert.match(wrapper, /Lịch khóa học/);
  assert.match(wrapper, /Lịch phòng thi/);
  assert.match(courseUi, /Tạo buổi live/);
  assert.match(courseUi, /Sinh lịch bài học/);
  assert.match(courseUi, /\/api\/admin\/course-timetable\/generate/);
});

test("offline live events never expose a join action", () => {
  const payload = eventPayload({
    id: "event-1",
    course_id: "course-1",
    event_kind: "live",
    delivery_mode: "offline",
  }, "Khóa học");

  assert.equal(payload.canJoin, false);
  assert.equal(payload.joinPath, null);
});

test("admin timetable update and delete mutations are rate limited", async () => {
  const route = await source("app/api/admin/course-timetable/[id]/route.ts");
  const patchHandler = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
  const deleteHandler = route.slice(route.indexOf("export async function DELETE"));

  assert.match(route, /consumeRequestBudget/);
  assert.match(route, /hashedRequestIp/);
  assert.match(patchHandler, /mutationBudget\(request, security, "update"\)/);
  assert.match(patchHandler, /end\.getTime\(\) - start\.getTime\(\) > 24 \* 60 \* 60 \* 1000/);
  assert.match(patchHandler, /không thể kéo dài quá 24 giờ/);
  assert.match(deleteHandler, /mutationBudget\(request, security, "delete"\)/);
});

test("admin timetable supports a bounded date window and complete event management", async () => {
  const courseUi = await source("app/admin-course-timetable.tsx");

  assert.match(courseUi, /method: "PATCH"/);
  assert.match(courseUi, /startEdit/);
  assert.match(courseUi, /togglePublished/);
  assert.match(courseUi, /toggleStatus/);
  assert.match(courseUi, /range\.from/);
  assert.match(courseUi, /range\.to/);
  assert.doesNotMatch(courseUi, /setMonth\(to\.getMonth\(\) \+ 6\)/);
});

test("clearing the optional timetable start date cannot crash the date-range controls", async () => {
  const courseUi = await source("app/admin-course-timetable.tsx");

  assert.match(courseUi, /const date = new Date\(`\$\{value\}T12:00:00`\);\s*if \(!Number\.isFinite\(date\.getTime\(\)\)\) return "";/);
  assert.match(courseUi, /min=\{range\.from \|\| undefined\} max=\{latestRangeEnd \|\| undefined\}/);
});

test("deleting a course timetable event requires the accessible product confirmation", async () => {
  const courseUi = await source("app/admin-course-timetable.tsx");

  assert.doesNotMatch(courseUi, /window\.confirm/);
  assert.match(courseUi, /import AeckConfirmDialog from "\.\.\/components\/aeck\/AeckConfirmDialog";/);
  assert.match(courseUi, /const \[pendingEventDeletion, setPendingEventDeletion\] = useState<CourseEvent \| null>\(null\);/);
  assert.match(courseUi, /pendingEventDeletion \? <AeckConfirmDialog/);
  assert.match(courseUi, /onClick=\{\(\) => setPendingEventDeletion\(item\)\}/);
  assert.match(courseUi, /onClick: \(\) => void removeEvent\(pendingEventDeletion\)/);
});

test("course timetable filters collapse before the tablet admin shell clips date controls", async () => {
  const theme = await source("app/red-white-theme.css");

  const compactStart = theme.indexOf("@media (max-width: 920px)");
  const phoneStart = theme.indexOf("@media (max-width: 480px)", compactStart);
  const compactCss = theme.slice(compactStart, phoneStart);

  assert.ok(compactStart >= 0, "missing the compact admin timetable breakpoint");
  assert.match(compactCss, /\.admin-course-timetable-filters\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.match(compactCss, /\.admin-course-timetable-form\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.match(compactCss, /\.admin-course-timetable-head\s*\{[\s\S]*?flex-direction:\s*column;/);
});

test("course timetable events use a single reading column on narrow mobile screens", async () => {
  const theme = await source("app/red-white-theme.css");
  const phoneStart = theme.indexOf("@media (max-width: 480px)");
  const phoneCss = theme.slice(phoneStart);

  assert.ok(phoneStart >= 0, "missing the phone timetable breakpoint");
  assert.match(phoneCss, /\.admin-course-timetable-list article\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(phoneCss, /\.admin-course-timetable-state\s*\{[\s\S]*?grid-column:\s*auto;/);
  assert.match(phoneCss, /\.admin-course-timetable-row-actions\s*\{[\s\S]*?grid-column:\s*auto;/);
});

test("timetable tabs connect to their panels and support standard keyboard navigation", async () => {
  const timetable = await source("app/admin-timetable.tsx");

  assert.match(timetable, /function handleTimetableTabKeyDown/);
  assert.match(timetable, /event\.key === "ArrowRight"/);
  assert.match(timetable, /event\.key === "ArrowLeft"/);
  assert.match(timetable, /event\.key === "Home"/);
  assert.match(timetable, /event\.key === "End"/);
  assert.match(timetable, /id="admin-timetable-course-tab"[\s\S]*?aria-controls="admin-timetable-course-panel"/);
  assert.match(timetable, /id="admin-timetable-exam-tab"[\s\S]*?aria-controls="admin-timetable-exam-panel"/);
  assert.match(timetable, /role="tabpanel"[\s\S]*?aria-labelledby=\{activeView === "courses" \? "admin-timetable-course-tab" : "admin-timetable-exam-tab"\}/);
});

test("exam-room weekly controls are exposed as a named navigation landmark", async () => {
  const timetable = await source("app/admin-timetable.tsx");

  assert.match(timetable, /<nav className="admin-timetable-week-controls" aria-label="Điều hướng tuần">/);
  assert.match(timetable, /aria-label="Tuần trước"[\s\S]*?className="admin-timetable-current-week"[\s\S]*?aria-label="Tuần sau"/);
});

test("timetable view is deep-linkable and follows browser history", async () => {
  const timetable = await source("app/admin-timetable.tsx");

  assert.match(timetable, /function timetableViewFromUrl/);
  assert.match(timetable, /url\.searchParams\.get\("view"\) === "exams"/);
  assert.match(timetable, /window\.addEventListener\("popstate", syncViewFromUrl\)/);
  assert.match(timetable, /window\.history\.pushState/);
  assert.match(timetable, /url\.searchParams\.set\("view", view\)/);
  assert.match(timetable, /url\.searchParams\.delete\("view"\)/);
});

test("admin timetable smoke enters the exam-room tab before exercising its schedule editor", async () => {
  const smoke = await source("scripts/product-shell-ui-smoke.mjs");
  const inspection = smoke.slice(smoke.indexOf("async function inspectAdminTimetable"), smoke.indexOf("async function inspectAdminAudit"));

  assert.match(inspection, /for \(const width of \[1440, 768, 390, 320\]\)/);
  assert.match(inspection, /getByRole\("tab", \{ name: "Lịch phòng thi" \}\)\.click\(\)/);
  assert.match(inspection, /getByRole\("button", \{ name: \/Thiết lập\/ \}\)\.first\(\)\.click\(\)/);
});

test("admin capability center documents both course and exam schedules", async () => {
  const capability = await source("app/admin-capability-center.tsx");

  assert.match(capability, /course_schedule_events/);
  assert.match(capability, /exam_rooms\.exam_start/);
});
