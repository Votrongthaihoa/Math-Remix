import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("admin operations timetable is a real routed module backed by the current exam-room schedule", async () => {
  const [platform, routeMode, catchAll, timetable, api, styles] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui-route-mode.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/[...slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-timetable.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/timetable/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-reference-suite.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /path: "\/admin\/timetable"/);
  assert.match(platform, /<AdminTimetable/);
  assert.match(routeMode, /"\/admin\/timetable"/);
  assert.match(catchAll, /"timetable"/);
  assert.match(timetable, /authenticatedFetch\("\/api\/admin\/timetable"/);
  assert.match(timetable, /startOfWeek/);
  assert.match(timetable, /Lưu lịch/);
  assert.match(timetable, /Gỡ lịch/);
  assert.match(timetable, /serverTime\?: string/);
  assert.match(timetable, /setReferenceNow\(serverNow\)/);
  assert.match(api, /export async function GET/);
  assert.match(api, /export async function PATCH/);
  assert.match(api, /exam_start/);
  assert.match(api, /exam_end/);
  assert.match(styles, /\.ui-shell\.admin-app\.product-shell:not\(\.protected-exam-surface\) \.admin-timetable-page/);
  assert.doesNotMatch(styles, /(^|\n)\s*(?:button|input|textarea|select|svg|body|h1)\s*[{,]/m);
});

test("removing an exam-room schedule requires the accessible product confirmation", async () => {
  const timetable = await readFile(new URL("../app/admin-timetable.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(timetable, /window\.confirm/);
  assert.match(timetable, /import AeckConfirmDialog from "\.\.\/components\/aeck\/AeckConfirmDialog";/);
  assert.match(timetable, /const \[pendingScheduleRemoval, setPendingScheduleRemoval\] = useState\(false\);/);
  assert.match(timetable, /pendingScheduleRemoval \? <AeckConfirmDialog/);
  assert.match(timetable, /onClick=\{\(\) => setPendingScheduleRemoval\(true\)\}/);
  assert.match(timetable, /errorMessage=\{scheduleRemovalError\}/);
  assert.match(timetable, /onClick: \(\) => void updateSchedule\(null, null, "remove"\)/);
});

test("unscheduled exam rooms retain native table semantics through responsive reflow", async () => {
  const [timetable, styles] = await Promise.all([
    readFile(new URL("../app/admin-timetable.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-reference-suite.css", import.meta.url), "utf8"),
  ]);

  assert.match(timetable, /<table className="admin-timetable-room-table">/);
  assert.match(timetable, /<caption className="admin-timetable-visually-hidden">Phòng chưa xếp lịch<\/caption>/);
  assert.match(timetable, /<thead><tr className="admin-timetable-room-row admin-timetable-room-row-head">/);
  assert.match(timetable, /<tbody>\s*\{visibleUnscheduledRooms\.map\(room => <tr/);
  assert.doesNotMatch(timetable, /role="table"|role="row"|role="columnheader"|role="cell"/);
  assert.match(styles, /\.admin-timetable-room-table\s+thead,\s*[\s\S]*?\.admin-timetable-room-table\s+tbody\s*\{\s*display: contents;/);
});

test("unscheduled room cells keep their header context when the mobile header is hidden", async () => {
  const [timetable, styles] = await Promise.all([
    readFile(new URL("../app/admin-timetable.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-reference-suite.css", import.meta.url), "utf8"),
  ]);

  for (const label of ["Phòng thi", "Loại", "Số đề", "Trạng thái", "Thao tác"]) {
    assert.match(timetable, new RegExp(`admin-timetable-cell-label">${label}`));
  }
  assert.match(styles, /\.admin-timetable-cell-label\s*\{\s*display: none;/);
  assert.match(styles, /@media \(max-width: 840px\)[\s\S]*?\.admin-timetable-cell-label\s*\{[\s\S]*?position: absolute;/);
});

test("admin audit explorer consolidates existing exam and account security logs", async () => {
  const [platform, routeMode, catchAll, auditPage, api, styles] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui-route-mode.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/[...slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-audit-log.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/audit/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-reference-suite.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /path: "\/admin\/audit"/);
  assert.match(platform, /<AdminAuditLog/);
  assert.match(routeMode, /"\/admin\/audit"/);
  assert.match(catchAll, /"audit"/);
  assert.match(auditPage, /authenticatedFetch\(`\/api\/admin\/audit\?/);
  assert.match(auditPage, /URLSearchParams/);
  assert.match(auditPage, /aria-live="polite"/);
  assert.match(auditPage, /\}, \[query, source, status\]\);/);
  assert.match(auditPage, /\}, \[deferredQuery, page, reloadKey, source, status\]\);/);
  assert.match(api, /exam_admin_audit_logs/);
  assert.match(api, /admin_actions/);
  assert.match(api, /Promise\.all/);
  assert.match(api, /normalizeAuditLimit/);
  assert.match(styles, /\.ui-shell\.admin-app\.product-shell:not\(\.protected-exam-surface\) \.admin-audit-page/);
});

test("student progress route derives useful insights without entering protected result review", async () => {
  const [platform, routeMode, catchAll, progress, styles] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui-route-mode.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/[...slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/student-progress.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-reference-suite.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /"progress"/);
  assert.match(platform, /<StudentProgress/);
  assert.match(platform, /href="\/progress"/);
  assert.match(routeMode, /"\/progress"/);
  assert.match(catchAll, /"progress"/);
  assert.match(progress, /useMemo/);
  assert.match(progress, /monthlyActivity/);
  assert.match(progress, /fontVariantNumeric/);
  assert.doesNotMatch(progress, /\/exam\/result\//);
  assert.doesNotMatch(progress, /answer|solution|question/i);
  assert.match(styles, /\.ui-shell\.student-app\.product-shell:not\(\.protected-exam-surface\) \.student-progress-page/);
});

test("dashboard attempt links expose a reliable pointer and keyboard hit area", async () => {
  const styles = await readFile(new URL("../app/text-overflow-polish.css", import.meta.url), "utf8");
  assert.match(styles, /\.dashboard-page \.attempt-list-link \{[\s\S]*?min-height: 40px;[\s\S]*?padding-block: 9px;/);
});

test("reference-suite caption colors keep normal text at AA contrast", async () => {
  const styles = await readFile(new URL("../app/admin-reference-suite.css", import.meta.url), "utf8");
  assert.doesNotMatch(styles, /color:\s*#(?:777b84|8b8e96|92959d|969097|9c969c|a0a3ab)\b/i);
  assert.equal((styles.match(/animation:\s*none;/g) ?? []).length, 2);
});

test("visual smoke exercises the new student and admin reference-suite routes", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");
  assert.match(smoke, /\["student-progress", "\/progress"\]/);
  assert.match(smoke, /\["admin-timetable", "\/admin\/timetable"\]/);
  assert.match(smoke, /\["admin-audit", "\/admin\/audit"\]/);
  assert.match(smoke, /inspectStudentProgress/);
  assert.match(smoke, /inspectAdminTimetable/);
  assert.match(smoke, /inspectAdminAudit/);
});
