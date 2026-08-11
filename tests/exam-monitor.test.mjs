import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  analyzeExamMonitorEvents,
  examMonitorEventDuration,
  formatExamMonitorDuration,
  safeExamMonitorEvents,
} from "../lib/exam-monitor.ts";

const event = (type, milliseconds) => ({ type, at: new Date(Date.UTC(2026, 7, 11, 12, 0, 0, milliseconds)).toISOString() });

test("advanced monitoring correlates tab, focus, and fullscreen signals without double-counting away time", () => {
  const events = [
    event("window_blur", 0),
    event("fullscreen_exit", 100),
    event("visibility_hidden", 200),
    event("visibility_visible", 5_000),
    event("window_focus", 5_200),
    event("fullscreen_enter", 6_000),
  ];
  const analysis = analyzeExamMonitorEvents(events);
  assert.equal(analysis.eventCount, 6);
  assert.equal(analysis.tabExits, 1);
  assert.equal(analysis.focusLosses, 1);
  assert.equal(analysis.fullscreenExits, 1);
  assert.equal(analysis.suspectedAppSwitches, 1);
  assert.equal(analysis.attentionAwayMs, 5_200);
  assert.equal(analysis.longestAttentionAwayMs, 5_200);
  assert.equal(analysis.fullscreenAwayMs, 5_900);
  assert.equal(examMonitorEventDuration(events, 2), 4_800);
  assert.equal(formatExamMonitorDuration(65_000), "1 phút 5 giây");
});

test("monitor event input accepts only bounded known browser signals", () => {
  assert.deepEqual(
    safeExamMonitorEvents(["window_blur", "visibility_hidden", "process_list", { type: "fullscreen_exit" }]),
    ["window_blur", "visibility_hidden"],
  );
  assert.deepEqual(safeExamMonitorEvents("fullscreen_exit"), ["fullscreen_exit"]);
});

test("exam clients batch monitoring signals and admin UI describes app switching as a suspicion", async () => {
  const [accountClient, guestClient, accountApi, guestApi, results, operations, resultsCss, operationsCss, accessCss] = await Promise.all([
    readFile(new URL("../app/exam-room.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/guest-exam.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/exams/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/guest-exams/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-session-results.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-exam-operations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-session-results.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-exam-operations.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-exam-access.css", import.meta.url), "utf8"),
  ]);
  assert.match(accountClient, /const monitorEvents = monitorEvent \? \[\.\.\.pendingMonitorEvents, monitorEvent\]\.slice\(-20\) : pendingMonitorEvents/);
  assert.match(accountClient, /monitorEvents: snapshot\.monitorEvents/);
  assert.match(guestClient, /pendingMonitorEventsRef\.current = \[\.\.\.pendingMonitorEventsRef\.current, monitorEvent\]\.slice\(-20\)/);
  assert.match(guestClient, /progressWriteQueueRef\.current = progressWriteQueueRef\.current\.then\(write, write\)/);
  assert.match(guestClient, /\.\.\.\(monitorEvents\.length \? \{ monitorEvents \} : \{\}\)/);
  for (const api of [accountApi, guestApi]) {
    assert.match(api, /safeExamMonitorEvents\(body\.monitorEvents \?\? body\.monitorEvent\)/);
    assert.match(api, /for \(const monitorEvent of monitorEvents\) events\.push/);
  }
  assert.match(results, /nghi chuyển tab\/ứng dụng/);
  assert.match(results, /có thể do đổi tab, Alt\+Tab hoặc Win\+Tab/);
  assert.match(results, /không phải kết luận vi phạm/);
  assert.match(operations, /Nghi chuyển tab\/app/);
  for (const css of [resultsCss, operationsCss, accessCss]) assert.match(css, /overflow-wrap:\s*anywhere/);
});
