import assert from "node:assert/strict";
import test from "node:test";
import { checkResourceAccess } from "../lib/resource-access.ts";

// A legitimate enrolled student reading a published lesson. Each case below
// states only what it changes, so the intent of the case is the diff.
const student = {
  isAdmin: false,
  accountActive: true,
  enrolled: true,
  lessonPublished: true,
  allowDownload: true,
  mode: "view",
};

const context = overrides => ({ ...student, ...overrides });

test("enrolled student may view a published lesson", () => {
  assert.deepEqual(checkResourceAccess(context({})), { allowed: true });
});

test("student removed from the course loses access", () => {
  const decision = checkResourceAccess(context({ enrolled: false }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "NOT_ENROLLED");
  assert.equal(decision.status, 403);
});

test("unpublished lesson is hidden from students", () => {
  const decision = checkResourceAccess(context({ lessonPublished: false }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "LESSON_UNPUBLISHED");
});

test("admin reads drafts of courses they are not enrolled in", () => {
  const decision = checkResourceAccess(context({ isAdmin: true, lessonPublished: false, enrolled: false }));
  assert.deepEqual(decision, { allowed: true });
});

test("allow_download false blocks downloading but never viewing", () => {
  assert.deepEqual(checkResourceAccess(context({ allowDownload: false, mode: "view" })), { allowed: true });

  const decision = checkResourceAccess(context({ allowDownload: false, mode: "download" }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "DOWNLOAD_NOT_ALLOWED");
});

test("enrolled student may download when the resource permits it", () => {
  assert.deepEqual(checkResourceAccess(context({ allowDownload: true, mode: "download" })), { allowed: true });
});

test("a banned account is refused even when it is an admin", () => {
  const decision = checkResourceAccess(context({ isAdmin: true, accountActive: false }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "ACCOUNT_INACTIVE");
  assert.equal(decision.status, 423);
});

test("admin downloads a resource that is closed to students", () => {
  assert.deepEqual(checkResourceAccess(context({ isAdmin: true, allowDownload: false, mode: "download" })), { allowed: true });
});

test("an unpublished lesson is reported before a missing enrollment", () => {
  const decision = checkResourceAccess(context({ lessonPublished: false, enrolled: false }));
  assert.equal(decision.reason, "LESSON_UNPUBLISHED");
});
