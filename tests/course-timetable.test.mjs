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

test("admin capability center documents both course and exam schedules", async () => {
  const capability = await source("app/admin-capability-center.tsx");

  assert.match(capability, /course_schedule_events/);
  assert.match(capability, /exam_rooms\.exam_start/);
});
