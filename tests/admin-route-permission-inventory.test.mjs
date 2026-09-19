import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = new URL("../", import.meta.url);
const adminApiRoot = new URL("../app/api/admin/", import.meta.url);

async function routeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const target = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) return routeFiles(target);
    return entry.isFile() && entry.name === "route.ts" ? [target] : [];
  }));
  return nested.flat();
}

test("every admin API route has a scoped permission boundary or the audited OAuth callback", async () => {
  const routes = await routeFiles(adminApiRoot);
  const inventory = await Promise.all(routes.map(async file => {
    const source = await readFile(file, "utf8");
    const relative = path.relative(fileURLToPath(repositoryRoot), fileURLToPath(file)).replaceAll("\\", "/");
    const direct = source.match(/ensureAdminPermission\(request,\s*"([^"]+)"/);
    const image = source.match(/requireExamImageAdmin\(request,\s*"([^"]+)"/);
    if (direct) return { relative, kind: "direct", permission: direct[1] };
    if (image) return { relative, kind: "image", permission: image[1] };
    if (relative === "app/api/admin/microsoft/callback/route.ts" && source.includes("completeMicrosoftAuthorization")) {
      return { relative, kind: "oauth-callback", permission: "courses" };
    }
    return { relative, kind: "unscoped", permission: null };
  }));

  assert.equal(inventory.length, 32);
  assert.deepEqual(inventory.filter(item => item.kind === "unscoped"), []);
  assert.equal(inventory.filter(item => item.kind === "direct").length, 29);
  assert.equal(inventory.filter(item => item.kind === "image").length, 2);
  assert.equal(inventory.filter(item => item.kind === "oauth-callback").length, 1);
  assert.equal(inventory.find(item => item.relative === "app/api/admin/server-health/route.ts")?.permission, "server-health");

  const microsoftGraph = await readFile(new URL("../lib/microsoft-graph-server.ts", import.meta.url), "utf8");
  assert.match(microsoftGraph, /auth\.admin\.getUserById\(connectedBy\)/);
  assert.match(microsoftGraph, /canAccessAdminPermission\(permissionUser, "courses"\)/);
  assert.equal(microsoftGraph.match(/assertMicrosoftConnectionPermission\(admin, state\.connectedBy\)/g)?.length, 2);
});

test("session UI hides actions whose API permission set is unavailable", async () => {
  const [platform, sessions, examAccess] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-sessions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-exam-access.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /requiredPermissionsForAdminRoute\(pathname\)/);
  assert.match(platform, /canManageExams=\{canAccessAdminPermission\(permissionUser, "exams"\)\}/);
  assert.match(platform, /canOpenResults=\{canAccessAllAdminPermissions\(permissionUser, \["exam-rooms", "exam-results", "exams"\]\)\}/);
  assert.match(sessions, /canManageExams \? <Link className="admin-session-primary"/);
  assert.match(sessions, /canOpenResults \? <Link className="admin-session-action"/);
  assert.match(sessions, /canManageExams && session\.kind !== "account"/);
  assert.match(examAccess, /canAccessAdminRoute\(authUser, "\/admin\/sessions\/new"\)/);
  assert.match(examAccess, /canViewExamResults && selectedSlotId/);
});

test("session catalog precomputes slot ownership before account-row expansion", async () => {
  const sessionsRoute = await readFile(new URL("../app/api/admin/sessions/route.ts", import.meta.url), "utf8");

  assert.match(sessionsRoute, /const examIdsWithSlots = new Set\(slotRows\.map\(slot => slot\.exam_id\)\);/);
  assert.match(sessionsRoute, /scheduled\.policy\.access\.audience === "both" && examIdsWithSlots\.has\(exam\.id\)/);
  assert.doesNotMatch(sessionsRoute, /slotRows\.some\(slot => slot\.exam_id === exam\.id\)/);
});
