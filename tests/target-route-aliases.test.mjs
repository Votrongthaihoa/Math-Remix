import assert from "node:assert/strict";
import { test } from "node:test";

import { targetRouteRedirect } from "../app/target-route-aliases.ts";

test("authenticated target route names resolve to equivalent local product surfaces", () => {
  assert.equal(targetRouteRedirect(["history"]), "/exam-history");
  assert.equal(targetRouteRedirect(["portal"]), "/profile");
  assert.equal(targetRouteRedirect(["course", "study", "lesson-01"]), "/lessons/lesson-01");
  assert.equal(targetRouteRedirect(["exam-rooms", "hsa"]), "/exam-room?examType=HSA");
  assert.equal(targetRouteRedirect(["exam-rooms", "hsa", "extra"]), null);
});
