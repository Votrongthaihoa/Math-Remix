import assert from "node:assert/strict";
import test from "node:test";

import { generateLessonSchedule, normalizeWeekdays } from "../lib/course-schedule.ts";

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

test("normalizes duplicate and out-of-range weekdays before generating dates", () => {
  assert.deepEqual(normalizeWeekdays([7, 7, 0, 8, 1, "1"]), [1, 7]);
  const events = generateLessonSchedule([
    { id: "lesson-1", title: "Bài 1", chapterSortOrder: 1, sortOrder: 1 },
    { id: "lesson-2", title: "Bài 2", chapterSortOrder: 1, sortOrder: 2 },
    { id: "lesson-3", title: "Bài 3", chapterSortOrder: 1, sortOrder: 3 },
  ], {
    startDate: "2026-09-06",
    weekdays: [7, 7, 0, 8, 1],
    startTime: "09:00",
    durationMinutes: 60,
  });

  assert.deepEqual(events.map(event => event.startAt), [
    "2026-09-06T02:00:00.000Z",
    "2026-09-07T02:00:00.000Z",
    "2026-09-13T02:00:00.000Z",
  ]);
});

test("caps generated lesson duration at one day", () => {
  const lesson = [{ id: "lesson-1", title: "Bài 1", chapterSortOrder: 1, sortOrder: 1 }];
  const event = generateLessonSchedule(lesson, {
    startDate: "2026-09-07",
    weekdays: [1],
    startTime: "09:00",
    durationMinutes: 24 * 60,
  })[0];
  assert.equal(event.endAt, "2026-09-08T02:00:00.000Z");
  assert.throws(() => generateLessonSchedule(lesson, {
    startDate: "2026-09-07",
    weekdays: [1],
    startTime: "09:00",
    durationMinutes: 24 * 60 + 1,
  }), /1\.440 phút/);
});
