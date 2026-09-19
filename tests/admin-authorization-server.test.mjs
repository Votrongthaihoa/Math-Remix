import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  adminPermissionUserFromAppMetadata,
  ensureAdminPermission,
} from "../lib/admin-authorization-server.ts";

const baseProfile = {
  id: "admin-1",
  role: "admin",
  status: "active",
  account_status: "active",
  violation_count: 0,
  banned_at: null,
  banned_until: null,
  ban_reason: null,
  ban_event_id: null,
};

function requestWithToken() {
  return new Request("https://synthetic.test/api/admin/resource", {
    headers: { authorization: "Bearer verified-token" },
  });
}

function fakeAdmin({
  appMetadata = {},
  userMetadata = {},
  profile = baseProfile,
} = {}) {
  const calls = [];
  const user = {
    id: "admin-1",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  };

  return {
    calls,
    auth: {
      async getUser(token) {
        calls.push(["getUser", token]);
        return { data: { user }, error: null };
      },
    },
    from(table) {
      calls.push(["from", table]);
      assert.equal(table, "profiles");
      const chain = {
        select(fields) {
          calls.push(["select", fields]);
          return chain;
        },
        eq(field, value) {
          calls.push(["eq", field, value]);
          return chain;
        },
        async single() {
          calls.push(["single"]);
          return { data: profile, error: null };
        },
      };
      return chain;
    },
  };
}

test("canonical app metadata claims override stale aliases so revocations fail closed", () => {
  assert.deepEqual(adminPermissionUserFromAppMetadata({
    is_super_admin: false,
    isSuperAdmin: true,
    admin_permissions: ["question_bank", "unknown"],
    adminPermissions: ["users"],
  }), {
    isSuperAdmin: false,
    adminPermissions: ["question_bank", "unknown"],
  });
  assert.deepEqual(adminPermissionUserFromAppMetadata(null), {
    isSuperAdmin: false,
    adminPermissions: [],
  });
  assert.deepEqual(adminPermissionUserFromAppMetadata({
    is_super_admin: "true",
    admin_permissions: "users",
  }), {
    isSuperAdmin: false,
    adminPermissions: [],
  });
});

test("camelCase app metadata remains compatible when canonical claims are absent", () => {
  assert.deepEqual(adminPermissionUserFromAppMetadata({
    isSuperAdmin: true,
    adminPermissions: ["users"],
  }), {
    isSuperAdmin: true,
    adminPermissions: ["users"],
  });
});

test("permission authorization uses the Auth-verified snake_case app metadata", async () => {
  const admin = fakeAdmin({ appMetadata: { admin_permissions: ["question_bank"] } });
  const result = await ensureAdminPermission(requestWithToken(), "question-bank", admin);

  assert.equal(result.ok, true);
  assert.equal(result.user.id, "admin-1");
  assert.equal(result.permission, "question-bank");
  assert.deepEqual(admin.calls[0], ["getUser", "verified-token"]);
});

test("camelCase app metadata and verified super-admin status are accepted", async () => {
  const camelCase = await ensureAdminPermission(
    requestWithToken(),
    "users",
    fakeAdmin({ appMetadata: { adminPermissions: ["users"] } }),
  );
  assert.equal(camelCase.ok, true);

  const superAdmin = await ensureAdminPermission(
    requestWithToken(),
    "finance",
    fakeAdmin({ appMetadata: { is_super_admin: true, admin_permissions: [] } }),
  );
  assert.equal(superAdmin.ok, true);
});

test("user-editable metadata cannot grant admin permissions", async () => {
  const result = await ensureAdminPermission(
    requestWithToken(),
    "system-admin",
    fakeAdmin({
      appMetadata: {},
      userMetadata: {
        is_super_admin: true,
        isSuperAdmin: true,
        admin_permissions: ["system-admin"],
        adminPermissions: ["system-admin"],
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
  assert.equal(result.response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(result.response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await result.response.json(), {
    error: "Bạn chưa được cấp quyền quản trị chức năng này.",
    code: "ADMIN_PERMISSION_REQUIRED",
    requiredPermission: "system-admin",
  });
});

test("an active non-admin profile is denied even with verified super-admin metadata", async () => {
  const result = await ensureAdminPermission(
    requestWithToken(),
    "users",
    fakeAdmin({
      appMetadata: { isSuperAdmin: true },
      profile: { ...baseProfile, role: "student" },
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
  assert.equal(result.response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.deepEqual(await result.response.json(), {
    error: "Bạn không có quyền quản trị.",
    code: "ADMIN_ROLE_REQUIRED",
  });
});

test("authentication failures from the active-account guard pass through unchanged", async () => {
  const admin = fakeAdmin({ appMetadata: { is_super_admin: true } });
  const result = await ensureAdminPermission(
    new Request("https://synthetic.test/api/admin/resource"),
    "users",
    admin,
  );

  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
  assert.equal(result.response.headers.get("www-authenticate"), "Bearer");
  assert.equal((await result.response.json()).code, "AUTH_REQUIRED");
  assert.deepEqual(admin.calls, []);
});

test("all scoped admin routes enforce their assigned runtime permission", async () => {
  const routes = [
    ["app/api/admin/question-banks/route.ts", "question-bank"],
    ["app/api/admin/question-banks/dedup/route.ts", "question-bank"],
    ["app/api/admin/audit/route.ts", "system-admin"],
    ["app/api/admin/watermark-trace/route.ts", "system-admin"],
    ["app/api/admin/server-health/route.ts", "server-health"],
    ["app/api/admin/security/route.ts", "system-admin"],
    ["app/api/admin/users/route.ts", "users"],
    ["app/api/admin/sessions/route.ts", "exam-rooms"],
    ["app/api/admin/session-catalog/route.ts", "exam-rooms"],
    ["app/api/admin/timetable/route.ts", "tkb"],
    ["app/api/admin/course-timetable/route.ts", "tkb"],
    ["app/api/admin/course-timetable/[id]/route.ts", "tkb"],
    ["app/api/admin/course-timetable/generate/route.ts", "tkb"],
    ["app/api/admin/course-covers/route.ts", "courses"],
    ["app/api/admin/lesson-files/route.ts", "courses"],
    ["app/api/admin/lesson-hls/route.ts", "courses"],
    ["app/api/admin/lesson-videos/route.ts", "courses"],
    ["app/api/admin/hls-vault/upload/route.ts", "courses"],
    ["app/api/admin/hls-vault/key/route.ts", "courses"],
    ["app/api/admin/microsoft/connect/route.ts", "courses"],
    ["app/api/admin/exam-access/route.ts", "exams"],
    ["app/api/admin/exam-access/export/route.ts", "exams"],
    ["app/api/admin/exam-candidates/route.ts", "exams"],
    ["app/api/admin/exam-content/route.ts", "exams"],
    ["app/api/admin/exam-export/route.ts", "exams"],
    ["app/api/admin/exam-policy/route.ts", "exams"],
    ["app/api/admin/exam-history/route.ts", "exam-results"],
    ["app/api/admin/exam-operations/route.ts", "exam-results"],
    ["app/api/admin/exam-regrade/route.ts", "exam-results"],
  ];

  assert.equal(routes.length, 29);
  await Promise.all(routes.map(async ([path, permission]) => {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, new RegExp(`ensureAdminPermission\\(request, "${permission}"`), path);
    assert.doesNotMatch(source, /ensureActiveAccount/, path);
    assert.doesNotMatch(source, /profile\.role\s*!==\s*["']admin["']/, path);
  }));
});

test("R2 admin image routes use scoped permissions instead of an admin-role-only helper", async () => {
  const [examImages, publicImages, imageHelper] = await Promise.all([
    readFile(new URL("../app/api/admin/exam-images/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/images/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/exam-images-server.ts", import.meta.url), "utf8"),
  ]);

  assert.match(examImages, /requireExamImageAdmin\(request, "exams"\)/);
  assert.match(publicImages, /requireExamImageAdmin\(request, "courses"\)/);
  assert.match(imageHelper, /ensureAdminPermission\(request, permission/);
  assert.doesNotMatch(imageHelper, /authentication\.user\.role !== "admin"/);
});
