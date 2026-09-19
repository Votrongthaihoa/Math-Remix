import assert from "node:assert/strict";
import test from "node:test";
import { fetchDashboardWidgets } from "../lib/student-dashboard-client.ts";

test("student dashboard widgets use allSettled and preserve partial successes", async () => {
  const snapshot = await fetchDashboardWidgets({
    getUserInfo: async () => ({ id: "u" }),
    getCompleted: async () => { throw new Error("offline"); },
    getCourses: async () => ["course"],
    getExamRooms: async () => ["room"],
    getMyResults: async () => ["result"],
  });
  assert.deepEqual(snapshot.userInfo, { id: "u" });
  assert.deepEqual(snapshot.courses, ["course"]);
  assert.deepEqual(snapshot.failed, ["completed"]);
});
