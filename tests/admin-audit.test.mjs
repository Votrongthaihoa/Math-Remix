import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin audit ignores stale responses after filters change", async () => {
  const page = await source("app/admin-audit-log.tsx");

  assert.match(page, /const controller = new AbortController\(\);\s*let active = true;/);
  assert.match(page, /if \(!active \|\| controller\.signal\.aborted\) return;\s*setPayload\(result \?\? \{\}\);/);
  assert.match(page, /return \(\) => \{\s*active = false;\s*controller\.abort\(\);\s*\};/);
});

test("admin audit cells retain their column context when mobile headers are hidden", async () => {
  const [page, styles] = await Promise.all([
    source("app/admin-audit-log.tsx"),
    source("app/admin-reference-suite.css"),
  ]);

  for (const label of ["Thao tác", "Nguồn", "Người thực hiện", "Đối tượng", "Thời gian", "Trạng thái"]) {
    assert.match(page, new RegExp(`admin-audit-cell-label">${label}`));
  }
  assert.match(styles, /\.admin-audit-cell-label\s*\{\s*display: none;/);
  assert.match(styles, /@media \(max-width: 840px\)[\s\S]*?\.admin-audit-cell-label\s*\{[\s\S]*?position: absolute;/);
});

test("admin audit uses native table semantics without hiding mobile audit details", async () => {
  const [page, styles] = await Promise.all([
    source("app/admin-audit-log.tsx"),
    source("app/admin-reference-suite.css"),
  ]);

  assert.match(page, /<table className="admin-audit-table">/);
  assert.match(page, /<caption className="admin-audit-visually-hidden">Nhật ký thao tác quản trị<\/caption>/);
  assert.match(page, /<thead><tr className="admin-audit-row admin-audit-row-head">/);
  assert.match(page, /<th scope="col">Thao tác<\/th>/);
  assert.match(page, /<tbody>\s*\{items\.map\(item => <tr/);
  assert.doesNotMatch(page, /role="table"|role="row"|role="columnheader"|role="cell"/);
  assert.match(styles, /\.admin-audit-table\s+thead\s*\{[\s\S]*?position:\s*absolute;/);
  assert.match(styles, /\.admin-audit-row\s*>\s*:is\(td, th\)\s*\{[\s\S]*?display:\s*block;/);
  assert.match(styles, /\.admin-audit-row > td:nth-child\(4\)\s*\{[\s\S]*?display:\s*block;/);
  assert.doesNotMatch(styles, /\.admin-audit-row > span\s*\{\s*display:\s*none;/);
});

test("exam admin audit migration is constrained, indexed, and RLS protected", async () => {
  const migration = await source("supabase/migrations/022_exam_admin_audit_logs.sql");
  assert.match(migration, /create table if not exists public\.exam_admin_audit_logs/i);
  assert.match(migration, /id bigint generated always as identity primary key/i);
  assert.match(migration, /admin_id uuid references auth\.users\(id\) on delete set null/i);
  assert.match(migration, /exam_id uuid references public\.exams\(id\) on delete set null/i);
  assert.match(migration, /room_id uuid references public\.exam_rooms\(id\) on delete set null/i);
  assert.match(migration, /slot_id uuid references public\.exam_access_slots\(id\) on delete set null/i);
  for (const action of [
    "save_exam_access_config",
    "create_exam_access_slot",
    "update_exam_access_slot",
    "rotate_exam_access_slot",
    "release_exam_results",
    "export_exam_results",
  ]) assert.match(migration, new RegExp(`'${action}'`));
  assert.match(migration, /status in \('started', 'succeeded', 'failed'\)/i);
  assert.match(migration, /jsonb_typeof\(metadata\) = 'object'/i);
  assert.match(migration, /alter table public\.exam_admin_audit_logs enable row level security/i);
  assert.match(migration, /for select to authenticated\s+using \(\(select public\.is_admin\(\)\)\)/i);
  assert.match(migration, /grant select on table public\.exam_admin_audit_logs to authenticated/i);
  assert.match(migration, /grant select, insert, update on table public\.exam_admin_audit_logs to service_role/i);
  assert.match(migration, /exam_admin_audit_logs_(exam|room|slot|admin)_date_idx/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test("audit metadata accepts only bounded non-sensitive scalar fields", async () => {
  const { sanitizeAuditMetadata } = await import("../lib/admin-audit-server.ts");
  const metadata = sanitizeAuditMetadata({
    changed_fields: "settings,enabled",
    count: 3,
    enabled: true,
    empty: null,
    password: "do-not-store",
    token: "do-not-store",
    identity: { name: "do-not-store" },
    answer: ["A"],
    long_value: "x".repeat(500),
  });
  assert.deepEqual(metadata, {
    changed_fields: "settings,enabled",
    count: 3,
    enabled: true,
    empty: null,
    long_value: "x".repeat(256),
  });
});

test("admin exam-access mutations preflight audit and export no longer uses account-security actions", async () => {
  const [adminRoute, exportRoute] = await Promise.all([
    source("app/api/admin/exam-access/route.ts"),
    source("app/api/admin/exam-access/export/route.ts"),
  ]);
  assert.match(adminRoute, /startExamAdminAudit/);
  assert.match(adminRoute, /finishExamAdminAudit/);
  for (const action of [
    "save_exam_access_config",
    "create_exam_access_slot",
    "update_exam_access_slot",
    "rotate_exam_access_slot",
    "release_exam_results",
  ]) assert.match(adminRoute, new RegExp(`action: "${action}"`));
  assert.match(exportRoute, /action: "export_exam_results"/);
  assert.match(exportRoute, /answer_row_count/);
  assert.doesNotMatch(exportRoute, /admin_actions/);
});

test("closed exam slots can be deleted with audited cascading data cleanup", async () => {
  const [adminRoute, accessUi, accessCss, schema] = await Promise.all([
    source("app/api/admin/exam-access/route.ts"),
    source("app/admin-exam-access.tsx"),
    source("app/admin-exam-access.css"),
    source("supabase/schema.sql"),
  ]);

  assert.match(adminRoute, /"delete_slot"/);
  assert.match(adminRoute, /currentSlot\.enabled && now >= startsAt && now <= closesAt/);
  assert.match(adminRoute, /Hãy đóng kíp thi trước khi xóa/);
  for (const table of ["guest_exam_attempts", "exam_slot_candidates", "exam_attempt_adjustments", "exam_attempt_grants"]) {
    assert.match(adminRoute, new RegExp(`from\\("${table}"\\)[\\s\\S]*?head: true`));
    assert.match(schema, new RegExp(`create table if not exists public\\.${table}[\\s\\S]*?slot_id uuid(?: not null)? references public\\.exam_access_slots\\(id\\) on delete cascade`, "i"));
  }
  assert.doesNotMatch(adminRoute, /if \(relatedCount > 0\)/);
  assert.match(adminRoute, /changed_fields: "deleted_with_related_data"/);
  assert.match(adminRoute, /related_row_count: relatedCount/);
  assert.match(adminRoute, /deletedRelatedRows: relatedCount/);
  assert.match(adminRoute, /\.delete\(\)[\s\S]*?\.eq\("id", slotId\)[\s\S]*?\.eq\("exam_id", examId\)/);
  assert.match(accessUi, /Xóa vĩnh viễn kíp/);
  assert.match(accessUi, /toàn bộ bài làm, kết quả, danh sách thí sinh và dữ liệu vận hành liên quan/);
  assert.match(accessUi, /action: "delete_slot"/);
  assert.match(accessUi, /aria-label=\{`Xóa kíp \$\{slot\.name\}`\}/);
  assert.match(accessUi, /Đang xóa…/);
  assert.match(accessCss, /\.slot-delete-button/);
});

test("new exam creation is draft-first and cannot publish before preflight", async () => {
  const [workspace, policyRoute, auditServer, publishMigration] = await Promise.all([
    source("app/admin-exam-workspace.tsx"),
    source("app/api/admin/exam-policy/route.ts"),
    source("lib/admin-audit-server.ts"),
    source("supabase/migrations/031_exam_publish_preflight.sql"),
  ]);
  assert.match(workspace, /const requestedPublish = form\.published/);
  assert.match(workspace, /\.insert\(\{ \.\.\.form, published: false/);
  assert.match(workspace, /body: JSON\.stringify\(\{ action: "preflight", examId: examResult\.data\.id \}\)/);
  assert.match(workspace, /body: JSON\.stringify\(\{ action: "publish_exam", examId: examResult\.data\.id \}\)/);
  assert.match(policyRoute, /body\.action === "publish_exam"/);
  assert.match(policyRoute, /runExamPreflight/);
  assert.match(policyRoute, /action: "publish_exam"/);
  assert.match(auditServer, /"publish_exam"/);
  assert.match(publishMigration, /'publish_exam'/);
});

test("data API hardening keeps server-owned exam operations out of browser roles", async () => {
  const migration = await source("supabase/migrations/032_exam_data_api_hardening.sql");
  assert.match(migration, /attempts self read/);
  assert.match(migration, /student_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /active account exam attempts/);
  assert.match(migration, /revoke all on table[\s\S]*exam_access_slots[\s\S]*guest_exam_attempts[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table[\s\S]*exam_attempt_adjustments[\s\S]*to service_role/i);
  assert.match(migration, /revoke all on function public\.consume_request_budget/i);
  assert.match(migration, /revoke all on function public\.consume_exam_attempt_grant/i);
});

test("guest exam image access is rate-limited after attempt authorization", async () => {
  const imageRoute = await source("app/api/guest-exams/images/[sectionId]/[asset]/route.ts");
  assert.match(imageRoute, /requestClientHash/);
  assert.match(imageRoute, /consumeRequestBudget/);
  assert.match(imageRoute, /"guest_image"/);
  assert.match(imageRoute, /status: 503/);
  assert.match(imageRoute, /status: 429/);
  const authorizationCall = imageRoute.indexOf("const admin = await guestImageAccess");
  const rateLimitCall = imageRoute.indexOf("const budget = await consumeRequestBudget");
  const r2Call = imageRoute.indexOf("loadR2Object(examImageKey");
  assert.ok(authorizationCall >= 0 && authorizationCall < rateLimitCall);
  assert.ok(rateLimitCall < r2Call);
});

test("admin image preview skips only the student visibility waterfall", async () => {
  const imageRoute = await source("app/api/exam-images/[sectionId]/[asset]/route.ts");
  const authentication = imageRoute.indexOf("const authentication = await requireActiveExamUser");
  const adminFastPath = imageRoute.indexOf('authentication.user.role !== "admin"');
  const studentAccess = imageRoute.indexOf("loadExamSectionAccess", adminFastPath);
  const r2Call = imageRoute.indexOf("loadR2Object(examImageKey");
  assert.ok(authentication >= 0 && authentication < adminFastPath);
  assert.ok(adminFastPath < studentAccess && studentAccess < r2Call);
});
