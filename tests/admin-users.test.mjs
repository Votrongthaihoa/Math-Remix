import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parseAdminUserCreateInput,
  parseAdminUserPasswordInput,
} from "../lib/admin-user-input.ts";
import { authPaginationHasMoreAtLimit } from "../lib/admin-user-pagination.ts";

const studentId = "00000000-0000-4000-8000-000000000123";

test("admin user input accepts normalized Unicode names and preserves passwords", () => {
  const result = parseAdminUserCreateInput({
    email: "  HocVien@example.com ",
    fullName: "  Nguyễn   Văn   An  ",
    password: "  mật-khẩu-123  ",
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      email: "HocVien@example.com",
      fullName: "Nguyễn Văn An",
      password: "  mật-khẩu-123  ",
    },
  });
});

test("admin user creation rejects malformed fields before Auth work", () => {
  const invalid = [
    [{ email: "", fullName: "Nguyễn An", password: "12345678" }, "INVALID_EMAIL"],
    [{ email: "not-an-email", fullName: "Nguyễn An", password: "12345678" }, "INVALID_EMAIL"],
    [{ email: "student@example.com", fullName: " ", password: "12345678" }, "INVALID_FULL_NAME"],
    [{ email: "student@example.com", fullName: "Nguyễn An", password: 12345678 }, "INVALID_PASSWORD"],
    [{ email: "student@example.com", fullName: "Nguyễn An", password: "1234567" }, "PASSWORD_TOO_SHORT"],
    [{ email: "student@example.com", fullName: "Nguyễn An", password: "x".repeat(73) }, "PASSWORD_TOO_LONG"],
    [{ email: "student@example.com", fullName: "Nguyễn An", password: "12345678", extra: "ignored" }, null],
  ];

  for (const [body, code] of invalid) {
    const result = parseAdminUserCreateInput(body);
    if (code) assert.equal(result.ok ? null : result.code, code);
    else assert.equal(result.ok, true);
  }
  assert.equal(parseAdminUserCreateInput({}).ok, false);
  assert.equal(parseAdminUserCreateInput(null).ok, false);
});

test("admin password reset validates UUID and the Auth password byte limit", () => {
  assert.deepEqual(parseAdminUserPasswordInput({ userId: studentId, password: "12345678" }), {
    ok: true,
    value: { userId: studentId, password: "12345678" },
  });
  assert.equal(parseAdminUserPasswordInput({ userId: "not-a-uuid", password: "12345678" }).code, "INVALID_USER_ID");
  assert.equal(parseAdminUserPasswordInput({ userId: studentId, password: "1234567" }).code, "PASSWORD_TOO_SHORT");
  assert.equal(parseAdminUserPasswordInput({ userId: studentId, password: "x".repeat(73) }).code, "PASSWORD_TOO_LONG");
});

test("admin Auth pagination distinguishes an exact page cap from truncation", () => {
  const base = { page: 20, pageSize: 1000, userCount: 1000 };
  assert.equal(authPaginationHasMoreAtLimit({ ...base, usersSeen: 20_000, total: 20_000, nextPage: null }), false);
  assert.equal(authPaginationHasMoreAtLimit({ ...base, usersSeen: 20_000, total: 20_001, nextPage: 21 }), true);
  assert.equal(authPaginationHasMoreAtLimit({ ...base, usersSeen: 20_000, total: undefined, nextPage: undefined }), true);
  assert.equal(authPaginationHasMoreAtLimit({ ...base, usersSeen: 20_000, total: null, nextPage: null }), true);
  assert.equal(authPaginationHasMoreAtLimit({ ...base, usersSeen: 20_000, total: 0, nextPage: null }), true);
  assert.equal(authPaginationHasMoreAtLimit({ ...base, userCount: 999, usersSeen: 19_999, total: 20_000, nextPage: 21 }), false);
});

test("admin users route bounds Auth pagination and request bodies", async () => {
  const route = await readFile(new URL("../app/api/admin/users/route.ts", import.meta.url), "utf8");
  const inputHelper = await readFile(new URL("../lib/admin-user-input.ts", import.meta.url), "utf8");

  assert.match(route, /const authPageSize = 1000/);
  assert.match(route, /const authMaxPages = 20/);
  assert.match(route, /hasMore/);
  assert.match(route, /scannedPages/);
  assert.match(route, /data\.total/);
  assert.match(route, /data\.nextPage/);
  assert.match(route, /authPaginationHasMoreAtLimit/);
  assert.match(route, /readJsonBody<unknown>\(request, 16 \* 1024\)/);
  assert.match(route, /readJsonBody<unknown>\(request, 4 \* 1024\)/);
  assert.match(route, /parseAdminUserCreateInput/);
  assert.match(route, /parseAdminUserPasswordInput/);
  assert.match(route, /AUTH_USER_LIST_FAILED/);
  assert.match(route, /x-content-type-options/);
  assert.match(inputHelper, /PASSWORD_TOO_LONG/);
  assert.match(inputHelper, /isAdminUserUuid/);
});

test("admin student sorting keeps state updaters pure", async () => {
  const page = await readFile(new URL("../app/admin-students.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(page, /setSortKey\(prev => \{[\s\S]*?setSortDir/);
  assert.match(page, /setSortKey\(key\);[\s\S]*?setSortDir\(sortKey === key/);
});
