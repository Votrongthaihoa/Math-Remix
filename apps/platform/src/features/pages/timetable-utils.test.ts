import assert from "node:assert/strict";
import test from "node:test";

import { groupTimetableByDay } from "./timetable-utils.ts";

test("timetable groups entries by Vietnam calendar day and sorts each day chronologically", () => {
  const groups = groupTimetableByDay([
    { id: "late", startsAt: "2026-08-31T13:00:00.000Z", title: "Buổi 2" },
    { id: "early", startsAt: "2026-08-31T01:00:00.000Z", title: "Buổi 1" },
    { id: "next", startsAt: "2026-09-01T01:00:00.000Z", title: "Buổi 3" },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0]?.entries.map((entry) => entry.id), ["early", "late"]);
});
