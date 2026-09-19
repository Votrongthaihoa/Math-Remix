import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("alpha student dashboard is a native product-surface component", async () => {
  const [component, platform] = await Promise.all([
    readFile(new URL("../app/student-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(component, /data-testid="student-dashboard"/);
  assert.match(component, /className="alpha-dashboard-summary"/);
  assert.match(component, /className="alpha-dashboard-resource-grid"/);
  assert.match(component, /className="alpha-dashboard-activity"/);
  assert.match(component, /className="alpha-dashboard-continue"/);
  assert.match(component, /Tiếp tục học/);
  assert.match(component, /href={`\/exam\/result\/\$\{encodeURIComponent\(item\.id\)\}`}/);
  assert.doesNotMatch(component, /fetchDashboardWidgets|\/api\/(?:dashboard\/user-info|student-dashboard|courses|exams)/);
  assert.match(platform, /<StudentDashboard/);
  assert.match(platform, /\/api\/exams\?scope=history/);
  assert.match(platform, /\/api\/exams\?scope=rooms/);
});

test("student dashboard exposes a recoverable loading failure state", async () => {
  const component = await readFile(new URL("../app/student-dashboard.tsx", import.meta.url), "utf8");

  assert.match(component, /aria-busy=\{loading\}/);
  assert.match(component, /role="alert"/);
  assert.match(component, /onRetry/);
});

test("student dashboard reserves overview empty states for resolved data", async () => {
  const component = await readFile(new URL("../app/student-dashboard.tsx", import.meta.url), "utf8");

  assert.match(component, /const initialPracticeRoomsLoading = loading && practiceRooms\.length === 0 && !practiceRoomsError;/);
  assert.match(component, /const initialAttemptsLoading = loading && attempts\.length === 0 && !attemptsError;/);
  assert.match(component, /practiceRoomsError \? <DashboardDataIssue message=\{practiceRoomsError\} \/> : initialPracticeRoomsLoading \? <p[^>]+role="status"[^>]*>Đang tải phòng luyện…<\/p> : <p className="alpha-dashboard-empty">Chưa có phòng luyện nào\.<\/p>/);
  const attemptLoadingStates = component.match(/attemptsError \? <DashboardDataIssue message=\{attemptsError\} \/> : initialAttemptsLoading \? <p[^>]+role="status"[^>]*>Đang tải lịch sử làm bài…<\/p> : <p className="alpha-dashboard-empty">Chưa có (?:bài thi nào được thực hiện|dữ liệu xếp hạng)\.<\/p>/g) ?? [];
  assert.equal(attemptLoadingStates.length, 2, "both attempt cards must avoid resolved empty copy while their first overview request is loading");
});
