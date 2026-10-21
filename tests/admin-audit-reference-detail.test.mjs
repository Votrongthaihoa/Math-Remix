import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("reference audit detail is mounted in the live audit table using the current API fields", async () => {
  const page = await source("app/admin-audit-log.tsx");
  assert.match(page, /<AuditRecordDetails item=\{item\} \/>/);
  assert.match(page, /<AdminReferenceDialog title="Chi tiết nhật ký"/);
  const detail = page.slice(page.indexOf("function AuditRecordDetails"), page.indexOf("export default function AdminAuditLog"));
  for (const field of ["id", "source", "action", "admin_id", "admin_name", "target_id", "target_name", "target_code", "status", "context", "reason", "created_at", "completed_at"]) {
    assert.ok(detail.includes(`item.${field}`), field);
  }
  assert.match(detail, /\{item\.admin_id \|\| "Không có ID"\}/);
  assert.match(detail, /\{item\.completed_at \? dateTime\(item\.completed_at\) : "Chưa ghi nhận"\}/);
  assert.match(detail, /event\.currentTarget\.focus\(\);\s*setOpen\(true\)/);
  assert.doesNotMatch(detail, /fetch\(|localStorage|DEMO_LOGS|dangerouslySetInnerHTML|requestData|ipAddress/);
});

test("audit detail styles use existing tokens and stay outside protected surfaces", async () => {
  const css = await source("app/admin-audit-reference-detail.css");
  assert.match(css, /\.ui-shell\.admin-app\.product-shell:not\(\.protected-exam-surface\) \.admin-audit-page \.admin-audit-reference-detail/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /white-space: pre-wrap/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /var\(--brand-red\)/);
  assert.doesNotMatch(css, /overflow:\s*hidden|text-overflow|line-clamp|#[0-9a-f]{3,8}\b/i);
});
