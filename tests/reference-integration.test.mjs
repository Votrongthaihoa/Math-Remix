import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("reference-derived student discovery routes are wired into the deployed product shell", async () => {
  const [platform, routeMode, catchAll, styles] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui-route-mode.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/[...slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reference-integration.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /type View = [^;]*"search"[^;]*"schedule"/);
  assert.match(platform, /<StudentSearchPage/);
  assert.match(platform, /<StudentSchedulePage/);
  assert.match(routeMode, /"\/search"/);
  assert.match(routeMode, /"\/tkb"/);
  assert.match(catchAll, /"search"/);
  assert.match(catchAll, /"tkb"/);
  assert.match(styles, /\.ui-shell\.student-app\.product-shell:not\(\.protected-exam-surface\)/);
  assert.doesNotMatch(styles, /(^|\n)\s*(?:button|input|textarea|select|svg|body|h1)\s*[{,]/m);
});

test("admin dashboard quick finder searches existing operational data", async () => {
  const [platform, finder] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/student-discovery.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /const adminFinderItems = useMemo<AdminFinderItem\[]>/);
  assert.match(platform, /<AdminQuickFinder items=\{adminFinderItems\}/);
  assert.match(platform, /kind: "student"/);
  assert.match(platform, /kind: "course"/);
  assert.match(platform, /kind: "room"/);
  assert.match(finder, /useDeferredValue\(query\)/);
  assert.match(finder, /aria-live="polite"/);
});

test("visual smoke includes the new student discovery routes", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /\["student-search", "\/search"\]/);
  assert.match(smoke, /\["student-schedule", "\/tkb"\]/);
  assert.match(smoke, /inspectStudentSearch/);
  assert.match(smoke, /inspectStudentSchedule/);
  assert.match(smoke, /runtimeIssues/);
  assert.match(smoke, /page\.on\("pageerror"/);
  assert.match(smoke, /page\.on\("console"/);
});

test("product-shell overflow audit understands the intentionally scrollable student timetable", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /control\.closest\("\.student-timetable-scroll, \.admin-timetable-week-grid/);
  assert.match(smoke, /scrollRegionControl.*student-timetable-scroll|classList\.contains\("student-timetable-scroll"\)/);
});

test("student timetable uses the supplied scrollable hourly calendar markup", async () => {
  const finder = await readFile(new URL("../app/student-discovery.tsx", import.meta.url), "utf8");

  assert.match(finder, /bg-white rounded-xl shadow-sm border border-gray-100 select-none overflow-hidden/);
  assert.match(finder, /px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2/);
  assert.match(finder, /overflow-y-auto overflow-x-auto/);
  assert.match(finder, /minWidth: 560/);
  assert.match(finder, /const timetableHeight = \(timetableEndHour - timetableStartHour\) \* timetableHourHeight/);
  assert.match(finder, /height: timetableHeight/);
  assert.match(finder, /flex border-b border-gray-200 bg-white sticky top-0 z-10/);
  assert.match(finder, /absolute overflow-hidden transition-opacity hover:opacity-80/);
});

test("room bootstrap returns attempt titles for history and search summaries", async () => {
  const route = await readFile(new URL("../app/api/exams/route.ts", import.meta.url), "utf8");

  assert.match(route, /scope === "rooms"[\s\S]*?select\("id,exam_id,section_id,title,status,score/);
});
