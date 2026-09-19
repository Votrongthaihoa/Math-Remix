import assert from "node:assert/strict";
import test from "node:test";

import { buildActivityCalendar, dashboardActivityLevel, summarizeDashboardAttempts } from "../lib/student-dashboard.ts";

test("dashboard summary keeps completed attempts and ranks scores", () => {
  const summary = summarizeDashboardAttempts([
    {
      id: "attempt-1",
      title: "Bài thi tháng 8",
      score: 14,
      status: "completed",
      submitted_at: "2026-08-09T09:00:00.000Z",
    },
    {
      id: "attempt-2",
      title: "Bài thi đang làm",
      score: 18,
      status: "in_progress",
      submitted_at: "2026-08-10T09:00:00.000Z",
    },
    {
      id: "attempt-3",
      title: "Bài thi điểm cao",
      score: 18,
      status: "completed",
      submitted_at: "2025-12-30T09:00:00.000Z",
    },
  ], new Date("2026-08-31T12:00:00.000Z"));

  assert.equal(summary.completed.length, 2);
  assert.deepEqual(summary.top.map(item => item.id), ["attempt-3", "attempt-1"]);
  assert.equal(summary.currentYear.length, 1);
  assert.equal(summary.monthly[7], 1);
});

test("top scores keep only the best attempt for each exam", () => {
  const summary = summarizeDashboardAttempts([
    { id: "a-old", exam_id: "exam-a", score: 6, status: "completed", submitted_at: "2026-01-01T08:00:00Z" },
    { id: "a-best", exam_id: "exam-a", score: 9, status: "completed", submitted_at: "2026-01-02T08:00:00Z" },
    { id: "a-later-lower", exam_id: "exam-a", score: 8, status: "completed", submitted_at: "2026-01-03T08:00:00Z" },
    { id: "b", exam_id: "exam-b", score: 7, status: "completed", submitted_at: "2026-01-04T08:00:00Z" },
  ]);

  assert.deepEqual(summary.top.map(item => item.id), ["a-best", "b"]);
});

test("activity levels use the blueprint count buckets", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7, 99].map(dashboardActivityLevel),
    [0, 1, 1, 2, 2, 3, 3, 4, 4],
  );
});

test("activity calendar creates complete Sunday-based weeks without leaking adjacent years", () => {
  const calendar = buildActivityCalendar(2026, [
    { id: "attempt-1", submitted_at: "2026-01-01T09:00:00.000Z", status: "completed" },
    { id: "attempt-2", submitted_at: "2026-01-01T10:00:00.000Z", status: "completed" },
  ]);

  assert.equal(calendar.length, 371);
  assert.deepEqual(calendar.find(day => day.dateKey === "2026-01-01"), {
    dateKey: "2026-01-01",
    count: 2,
    inYear: true,
  });
  assert.equal(calendar.filter(day => !day.inYear).length, 6);
});
