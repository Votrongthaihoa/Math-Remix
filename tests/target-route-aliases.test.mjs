import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { targetRouteRedirect } from "../app/target-route-aliases.ts";

test("authenticated target route names resolve to equivalent local product surfaces", () => {
  assert.equal(targetRouteRedirect(["history"]), "/exam-history");
  assert.equal(targetRouteRedirect(["history", "result"]), "/exam-history");
  assert.equal(targetRouteRedirect(["history", "result"], { attemptId: "attempt-01" }), "/exam/result/attempt-01");
  assert.equal(targetRouteRedirect(["portal"]), "/profile");
  assert.equal(targetRouteRedirect(["course", "study", "course-01"]), "/courses/course-01");
  assert.equal(
    targetRouteRedirect(["course", "study", "course-01"], { lessonId: "lesson-01" }),
    "/lessons/lesson-01",
  );
  assert.equal(
    targetRouteRedirect(["course", "study", "course/with spaces"], { lessonId: "lesson/with spaces" }),
    "/lessons/lesson%2Fwith%20spaces",
  );
  assert.equal(targetRouteRedirect(["exam-rooms", "hsa"]), "/exam-room?examType=HSA");
  assert.equal(targetRouteRedirect(["exam-rooms", "hsa", "extra"]), null);
});

test("explicit course lesson route redirects into the canonical lesson viewer", async () => {
  const page = await readFile(new URL("../app/course/[courseId]/lesson/[lessonId]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /redirect\(`\/lessons\/\$\{encodeURIComponent\(lessonId\)\}`\)/);
  assert.doesNotMatch(page, /PlatformApp/);
});
