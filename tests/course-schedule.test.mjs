import assert from "node:assert/strict";
import test from "node:test";

import { generateLessonSchedule } from "../lib/course-schedule.ts";

test("generates one lesson per selected weekday in lesson order using Vietnam time", () => {
  const events = generateLessonSchedule([
    { id: "lesson-2", title: "Bài 2", chapterSortOrder: 1, sortOrder: 2 },
    { id: "lesson-1", title: "Bài 1", chapterSortOrder: 1, sortOrder: 1 },
    { id: "lesson-3", title: "Bài 3", chapterSortOrder: 2, sortOrder: 1 },
  ], {
    startDate: "2026-09-07",
    weekdays: [1, 3],
    startTime: "19:00",
    durationMinutes: 90,
  });

  assert.deepEqual(events.map(event => event.lessonId), ["lesson-1", "lesson-2", "lesson-3"]);
  assert.equal(events[0].startAt, "2026-09-07T12:00:00.000Z");
  assert.equal(events[0].endAt, "2026-09-07T13:30:00.000Z");
  assert.equal(events[1].startAt, "2026-09-09T12:00:00.000Z");
  assert.equal(events[2].startAt, "2026-09-14T12:00:00.000Z");
});

test("rejects an invalid generation rule before creating events", () => {
  assert.throws(() => generateLessonSchedule([
    { id: "lesson-1", title: "Bài 1", chapterSortOrder: 1, sortOrder: 1 },
  ], {
    startDate: "2026-09-07",
    weekdays: [],
    startTime: "19:00",
    durationMinutes: 90,
  }), /ít nhất một ngày học/);
});

test("rejects selected lesson identifiers that do not belong to the course", () => {
  assert.throws(() => generateLessonSchedule([
    { id: "lesson-1", title: "Bài 1", chapterSortOrder: 1, sortOrder: 1 },
  ], {
    startDate: "2026-09-07",
    weekdays: [1],
    startTime: "19:00",
    durationMinutes: 90,
    lessonIds: ["lesson-1", "lesson-missing"],
  }), /không thuộc khóa học/);
});
