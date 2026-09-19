import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_PERMISSION_KEYS,
  adminPermissionUserFromMetadata,
  canAccessAdminRoute,
  canAccessAdminPermission,
  canAccessAllAdminPermissions,
  permissionsForUser,
  permissionForRoute,
  requiredPermissionsForAdminRoute,
} from "../lib/admin-permissions.ts";

test("admin permissions keep super admins unrestricted and map reference routes", () => {
  assert.ok(ADMIN_PERMISSION_KEYS.includes("question-bank"));
  assert.equal(canAccessAdminPermission({ isSuperAdmin: true, adminPermissions: [] }, "finance"), true);
  assert.equal(canAccessAdminPermission({ isSuperAdmin: false, adminPermissions: ["courses"] }, "courses"), true);
  assert.equal(canAccessAdminPermission({ isSuperAdmin: false, adminPermissions: ["courses"] }, "users"), false);
  assert.equal(permissionForRoute("/question-bank/dedup"), "question-bank");
  assert.equal(permissionForRoute("/admin-log"), "system-admin");
  assert.equal(permissionForRoute("/admin/question-bank/dedup"), "question-bank");
  assert.equal(permissionForRoute("/admin/sessions/session-1"), "exam-rooms");
  assert.equal(permissionForRoute("/admin/capabilities?module=watermark"), "system-admin");
  assert.equal(permissionForRoute("/admin/server-health"), "server-health");
});

test("compound session workflows require every permission used by their APIs", () => {
  assert.deepEqual(requiredPermissionsForAdminRoute("/admin/sessions"), ["exam-rooms"]);
  assert.deepEqual(requiredPermissionsForAdminRoute("/admin/sessions/new?roomId=room-1"), ["exam-rooms", "exams"]);
  assert.deepEqual(requiredPermissionsForAdminRoute("/admin/sessions/slot-1/results?examId=exam-1"), ["exam-rooms", "exam-results", "exams"]);

  const roomOperator = { adminPermissions: ["exam-rooms"] };
  const sessionCreator = { adminPermissions: ["exam-rooms", "exams"] };
  const resultOperator = { adminPermissions: ["exam-rooms", "exam-results", "exams"] };
  assert.equal(canAccessAdminRoute(roomOperator, "/admin/sessions"), true);
  assert.equal(canAccessAdminRoute(roomOperator, "/admin/sessions/new"), false);
  assert.equal(canAccessAdminRoute(sessionCreator, "/admin/sessions/new"), true);
  assert.equal(canAccessAdminRoute(sessionCreator, "/admin/sessions/slot-1/results"), false);
  assert.equal(canAccessAdminRoute(resultOperator, "/admin/sessions/slot-1/results"), true);
  assert.equal(canAccessAllAdminPermissions(resultOperator, ["exam-results", "exams"]), true);
});

test("permissionsForUser normalizes aliases and never trusts arbitrary values", () => {
  assert.deepEqual(permissionsForUser({ adminPermissions: ["courses", "courses", "unknown", "system-admin"] }), ["courses", "system-admin"]);
});

test("metadata claims fail closed when permissions are missing or explicitly empty", () => {
  const unprovisionedAdmin = adminPermissionUserFromMetadata("admin", {});
  const restrictedAdmin = adminPermissionUserFromMetadata("admin", { admin_permissions: ["question_bank"] });
  const explicitlyEmptyAdmin = adminPermissionUserFromMetadata("admin", { admin_permissions: [] });

  assert.equal(canAccessAdminPermission(unprovisionedAdmin, "finance"), false);
  assert.equal(canAccessAdminPermission(restrictedAdmin, "question-bank"), true);
  assert.equal(canAccessAdminPermission(restrictedAdmin, "finance"), false);
  assert.equal(canAccessAdminPermission(explicitlyEmptyAdmin, "question-bank"), false);
  assert.equal(adminPermissionUserFromMetadata("admin", { is_super_admin: "true" }).isSuperAdmin, false);
});

test("canonical revocations cannot be undone by stale camelCase aliases", () => {
  const revoked = adminPermissionUserFromMetadata("admin", {
    is_super_admin: false,
    isSuperAdmin: true,
    admin_permissions: [],
    adminPermissions: ["users"],
  });

  assert.equal(revoked.isSuperAdmin, false);
  assert.deepEqual(permissionsForUser(revoked), []);
  assert.equal(canAccessAdminPermission(revoked, "users"), false);
});
