import assert from "node:assert/strict";
import test from "node:test";

import { buildActivityCalendar, summarizeDashboardAttempts } from "../lib/student-dashboard.ts";

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
