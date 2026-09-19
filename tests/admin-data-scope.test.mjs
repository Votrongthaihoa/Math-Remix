import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { adminDataScopeForTab } from "../lib/admin-data-scope.ts";

test("granular admin data scopes do not preload unrelated domains", () => {
  assert.deepEqual(adminDataScopeForTab("dashboard", false), []);
  assert.deepEqual(adminDataScopeForTab("students", false), ["profiles", "course-enrollments", "user-emails"]);
  assert.deepEqual(adminDataScopeForTab("content", false), ["courses", "lessons"]);
  assert.deepEqual(adminDataScopeForTab("question-bank", false), []);
  assert.deepEqual(adminDataScopeForTab("exams", false), []);
});

test("only super admins receive the aggregate dashboard scope", () => {
  assert.deepEqual(adminDataScopeForTab("dashboard", true), [
    "profiles",
    "courses",
    "lessons",
    "course-enrollments",
    "exam-rooms",
    "exam-room-enrollments",
    "user-emails",
  ]);
});

test("platform routes restricted admins before mounting aggregate admin data", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");
  assert.match(platform, /canOpenAdminNavigationItem\(item, adminPermissionUser\)/);
  assert.match(platform, /restrictedAdminAtRoot[\s\S]*?router\.replace\(restrictedAdminLandingPath\)/);
  assert.match(platform, /if \(administrator && window\.location\.pathname\.startsWith\("\/admin"\)\)[\s\S]*?setAssignedCourses\(\[\]\)/);
  assert.match(platform, /<RealAdminDashboard pathname=\{pathname\} permissionUser=\{adminPermissionUser\}/);
  assert.match(platform, /adminDataScopeForTab\(tab, permissionUser\.isSuperAdmin === true\)/);
  assert.match(platform, /dataScope\.has\("profiles"\)[\s\S]*?supabase\.from\("profiles"\)/);
  assert.match(platform, /dataScope\.has\("courses"\)[\s\S]*?supabase\.from\("courses"\)/);
});
