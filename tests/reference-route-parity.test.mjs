import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { adminPrototypeRedirectPath, legacyAdminRedirectPath } from "../app/admin-route-map.ts";
import { canAccessAdminRoute } from "../lib/admin-permissions.ts";

test("prototype admin URLs redirect only to supported canonical admin screens", () => {
  const aliases = [
    [["admin", "dashboard"], "/admin"],
    [["admin", "courses"], "/admin/content"],
    [["admin", "tkb-management"], "/admin/timetable"],
    [["admin", "schedule"], "/admin/timetable"],
    [["admin", "admin-log"], "/admin/audit"],
    [["admin", "watermark-trace"], "/admin/capabilities?module=watermark"],
  ];
  for (const [slug, destination] of aliases) {
    assert.equal(adminPrototypeRedirectPath(slug), destination);
  }
  assert.equal(adminPrototypeRedirectPath(["admin", "courses", "A/B"]), "/admin/content/courses/A%2FB");
  assert.equal(adminPrototypeRedirectPath(["admin", "courses", "khóa học/1"]), "/admin/content/courses/kh%C3%B3a%20h%E1%BB%8Dc%2F1");
  assert.equal(adminPrototypeRedirectPath(["admin", "courses", "A%2FB"], { q: "luyện thi & học", tag: ["a", "b"] }), "/admin/content/courses/A%252FB?q=luy%E1%BB%87n+thi+%26+h%E1%BB%8Dc&tag=a&tag=b");
  assert.equal(adminPrototypeRedirectPath(["admin", "watermark-trace"], { module: "other", q: "file" }), "/admin/capabilities?module=watermark&q=file");

  for (const unsupported of [
    ["admin", "courses", "new", "edit"],
    ["admin", "courses", ""],
    ["admin", "courses", ".."],
    ["admin", "dashboard", "extra"],
    ["admin", "exam-management"],
    ["admin", "__proto__"],
    ["courses"],
  ]) assert.equal(adminPrototypeRedirectPath(unsupported), null);
});

test("prototype admin aliases reach canonical permission gates before rendering", async () => {
  const catchAll = await readFile(new URL("../app/[...slug]/page.tsx", import.meta.url), "utf8");
  assert.ok(catchAll.indexOf("adminPrototypeRedirectPath(slug, queryValues)") < catchAll.indexOf("const validAdminRoute ="));
  assert.equal(canAccessAdminRoute({ adminPermissions: ["courses"] }, "/admin/content/courses/course-1"), true);
  assert.equal(canAccessAdminRoute({ adminPermissions: ["courses"] }, "/admin/audit"), false);
  assert.equal(canAccessAdminRoute({ adminPermissions: ["system-admin"] }, "/admin/capabilities?module=watermark"), true);
});

test("legacy admin reference routes land on native capability or supported flows", () => {
  assert.equal(legacyAdminRedirectPath("/exam-management"), "/admin/exams");
  assert.equal(legacyAdminRedirectPath("/admin-session-wizard"), "/admin/sessions/new");
  assert.equal(legacyAdminRedirectPath("/user-management"), "/admin/students");
  assert.equal(legacyAdminRedirectPath("/course-management/abc"), "/admin/content/courses/abc");
  assert.equal(legacyAdminRedirectPath("/ilearn-management"), "/admin/capabilities?module=ilearn");
  assert.equal(legacyAdminRedirectPath("/admin/all"), "/admin/capabilities");
  assert.equal(
    legacyAdminRedirectPath("/exam-result-management/result-01/stats"),
    "/admin/sessions/result-01/results?examId=result-01&mode=account",
  );
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
