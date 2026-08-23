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

  assert.match(page, /Array\.isArray\(payload\.items\)/);
  assert.match(page, /className="security-empty"/);
  assert.match(page, /aria-busy=\{loading \|\| refreshing \|\| detailLoading \|\| busy\}/);
  assert.match(page, /Number\.isNaN\(parsed\.getTime\(\)\)/);
  assert.match(page, /setListServerTime\(typeof payload\.serverTime === "string"/);
  assert.match(page, /effectiveAccountStatus\(user, listServerTime\)/);
  assert.match(page, /statusLabel\(detail\.profile, detail\.serverTime\)/);
  assert.doesNotMatch(page, /aria-label=\{`Mở chi tiết bảo mật/);
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
  assert.match(page, /Boolean\(selectedId\) && !pendingAction/);
  assert.match(page, /aria-modal=\{pendingAction \? undefined : "true"\}/);
  assert.match(page, /Thiết bị đã ghi nhận/);
});

test("admin security list API paginates and filters on the server with a stable order", async () => {
  const route = await readFile(new URL("../app/api/admin/security/route.ts", import.meta.url), "utf8");

  assert.match(route, /searchParams\.get\("q"\)/);
  assert.match(route, /searchParams\.get\("status"\)/);
  assert.match(route, /searchParams\.get\("page"\)/);
  assert.match(route, /searchParams\.get\("limit"\)/);
  assert.match(route, /select\([^\n]+\{ count: "exact" \}\)/);
  assert.match(route, /\.order\("banned_at", \{ ascending: false, nullsFirst: false \}\)/);
  assert.match(route, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(route, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(route, /\.range\(targetOffset, targetOffset \+ limit - 1\)/);
  assert.match(route, /auth\.admin\.getUserById/);
  assert.match(route, /authLookupConcurrency = 5/);
  assert.match(route, /authEmailCacheTtlMs = 60_000/);
  assert.match(route, /if \(page > pageCount\)/);
  assert.match(route, /items: rows, total, page, limit, hasNextPage/);
});

test("admin security email search stays inside the server-side Auth admin boundary", async () => {
  const [route, page] = await Promise.all([
    readFile(new URL("../app/api/admin/security/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-security.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /admin\.auth\.admin\.listUsers\(\{ page: authPage, perPage: authPageSize \}\)/);
  assert.match(route, /email\.toLocaleLowerCase\("vi"\)\.includes\(emailQuery\)/);
  assert.match(route, /uuid\.test\(id\)/);
  assert.match(route, /filters\.push\(`id\.in\.\(\$\{emailMatchIds\.join\(","\)\}\)`\)/);
  assert.doesNotMatch(page, /auth\.admin|service_role|SUPABASE_SERVICE_ROLE/);
});

test("admin security list state is URL-synced and cancels stale requests", async () => {
  const page = await readFile(new URL("../app/admin-security.tsx", import.meta.url), "utf8");

  assert.match(page, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(page, /window\.history\.replaceState/);
  assert.match(page, /SECURITY_DRAWER_STATE_KEY/);
  assert.match(page, /readSelectedUserId\(\)/);
  assert.match(page, /window\.history\.pushState\(\{ \.\.\.window\.history\.state/);
  assert.match(page, /if \(drawerHistoryOwned\) window\.history\.back\(\)/);
  assert.match(page, /window\.addEventListener\("popstate"/);
  assert.match(page, /listAbortController\.current\?\.abort\(\)/);
  assert.match(page, /const controller = new AbortController\(\)/);
  assert.match(page, /api<SecurityListResponse>\(`\/api\/admin\/security\?\$\{params\.toString\(\)\}`/);
  assert.match(page, /Array\.isArray\(payload\.items\)/);
  assert.match(page, /id="security-status-filter"/);
  assert.match(page, /className="security-pagination"/);
  assert.match(page, /name="securityPageSize"/);
  assert.match(page, /payload\.page !== state\.page/);
});

test("admin security violations filter maps to a positive violation count", async () => {
  const [route, page] = await Promise.all([
    readFile(new URL("../app/api/admin/security/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-security.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /"violations"/);
  assert.match(route, /if \(requestedStatus === "violations"\) query = query\.gt\("violation_count", 0\)/);
  assert.match(route, /requestedStatus === "active"[\s\S]*?banned_until\.lte/);
  assert.match(route, /requestedStatus === "temporarily_banned"[\s\S]*?banned_until\.gt/);
  assert.doesNotMatch(route, /eq\("account_status", "violations"\)/);
  assert.match(page, /type SecurityStatus = [^;]+"violations"/);
  assert.match(page, /<option value="violations">Có vi phạm<\/option>/);
});

test("admin security opens the detail drawer immediately with local loading and retry states", async () => {
  const page = await readFile(new URL("../app/admin-security.tsx", import.meta.url), "utf8");

  assert.match(page, /useAdminDialogFocus<HTMLElement>\(Boolean\(selectedId\) && !pendingAction/);
  assert.match(page, /const selectedUser = users\.find\(user => user\.id === selectedId\)/);
  assert.match(page, /\{selectedId && <div className="security-detail-shade"/);
  assert.match(page, /detailLoading && !detail/);
  assert.match(page, /detailError && <div className="security-detail-error" role="alert"/);
  assert.match(page, /onClick=\{\(\) => void loadDetail\(selectedId\)\}/);
  assert.match(page, /setDetailError\(""\)/);
});

test("admin security overlays isolate background content and explain empty sessions", async () => {
  const page = await readFile(new URL("../app/admin-security.tsx", import.meta.url), "utf8");

  assert.match(page, /pageContentRef\.current/);
  assert.match(page, /content\.inert = true/);
  assert.match(page, /document\.body\.style\.overflow = "hidden"/);
  assert.match(page, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(page, /detailContentRef\.current/);
  assert.match(page, /detailContent\.inert = Boolean\(pendingAction\)/);
  assert.match(page, /detail\.sessions\.length \?/);
  assert.match(page, /Chưa có phiên học được ghi nhận\./);
});

test("admin security CSS keeps controls readable, responsive, and text-safe", async () => {
  const css = await readFile(new URL("../app/admin-security.css", import.meta.url), "utf8");

  assert.match(css, /\.admin-security-page \.security-list-toolbar/);
  assert.match(css, /\.admin-security-page \.security-detail-content > section/);
  assert.match(css, /\.admin-security-page \.security-user-grid > button\.selected/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /min-width: 0/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 700px\)/);
});

test("admin security reason field keeps a visible focus indicator in forced colors", async () => {
  const css = await readFile(new URL("../app/admin-security.css", import.meta.url), "utf8");

  assert.match(css, /\.security-action-dialog textarea:focus-visible/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*?textarea:focus-visible[\s\S]*?CanvasText/);
});
