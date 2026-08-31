import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { legacyAdminRedirectPath } from "../app/admin-route-map.ts";

test("legacy admin reference routes land on native capability or supported flows", () => {
  assert.equal(legacyAdminRedirectPath("/exam-management"), "/admin/exams");
  assert.equal(legacyAdminRedirectPath("/user-management"), "/admin/students");
  assert.equal(legacyAdminRedirectPath("/course-management/abc"), "/admin/content/courses/abc");
  assert.equal(legacyAdminRedirectPath("/ilearn-management"), "/admin/capabilities?module=ilearn");
  assert.equal(legacyAdminRedirectPath("/admin/all"), "/admin/capabilities");
});

test("admin content state follows pathname changes from the shared shell", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /const syncAdminRoute = \(\) => \{[\s\S]*?setTab\(adminTabFromPath\(adminPathname\)\)[\s\S]*?setAdminLocation\(`\$\{adminPathname\}\$\{window\.location\.search\}`\)[\s\S]*?\};[\s\S]*?syncAdminRoute\(\);[\s\S]*?window\.addEventListener\("popstate", syncAdminRoute\)/);
});

test("legacy exam result links are accepted by the catch-all route", async () => {
  const catchAll = await readFile(new URL("../app/[...slug]/page.tsx", import.meta.url), "utf8");

  assert.match(catchAll, /exam-result/);
  assert.match(catchAll, /validLegacyExamResultRoute/);
});

test("legacy admin capability suffixes resolve to the canonical capability center", async () => {
  const routeMap = await readFile(new URL("../app/admin-route-map.ts", import.meta.url), "utf8");

  assert.match(routeMap, /matchesPrefix\(pathname, "\/admin\/all"\)/);
  assert.match(routeMap, /return "\/admin\/capabilities"/);
});
