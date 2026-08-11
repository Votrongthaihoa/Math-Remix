import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin security actions use an accessible in-app reason dialog", async () => {
  const page = await readFile(new URL("../app/admin-security.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(page, /window\.prompt/);
  assert.match(page, /pendingAction/);
  assert.match(page, /useAdminDialogFocus<HTMLDivElement>\(Boolean\(pendingAction\)/);
  assert.match(page, /role="dialog" aria-modal="true" aria-labelledby="security-action-title"/);
  assert.match(page, /id="security-action-reason"/);
  assert.match(page, /<button type="submit"/);
});

test("admin security state is safe for empty, busy, and malformed date states", async () => {
  const page = await readFile(new URL("../app/admin-security.tsx", import.meta.url), "utf8");

  assert.match(page, /Array\.isArray\(payload\.users\)/);
  assert.match(page, /className="security-empty"/);
  assert.match(page, /aria-busy=\{loading \|\| detailLoading \|\| busy\}/);
  assert.match(page, /Number\.isNaN\(parsed\.getTime\(\)\)/);
  assert.match(page, /type="button"[^>]*onClick=\{\(\) => requestAction/);
});

test("admin security API restricts actions to student targets", async () => {
  const route = await readFile(new URL("../app/api/admin/security/route.ts", import.meta.url), "utf8");

  assert.match(route, /select\("id,role"\)/);
  assert.match(route, /targetProfile\.role !== "student"/);
  assert.match(route, /targetProfile\.id === user\.id/);
});

test("admin security binds requests and actions to the selected student", async () => {
  const page = await readFile(new URL("../app/admin-security.tsx", import.meta.url), "utf8");

  assert.match(page, /detailRequestId/);
  assert.match(page, /detailAbortController\.current\?\.abort\(\)/);
  assert.match(page, /payload\.profile\.id !== userId/);
  assert.match(page, /selectedId !== targetUserId \|\| detail\?\.profile\.id !== targetUserId/);
  assert.match(page, /Boolean\(detail\) && !pendingAction/);
  assert.match(page, /aria-modal=\{pendingAction \? undefined : "true"\}/);
  assert.match(page, /Thiết bị đã ghi nhận/);
});
