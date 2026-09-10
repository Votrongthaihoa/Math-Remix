import assert from "node:assert/strict";
import test from "node:test";
import { formatUiWeekRange } from "../app/ui-format.ts";

test("week ranges use Vietnam time and preserve a safe fallback", () => {
  assert.equal(
    formatUiWeekRange("2026-09-06T17:00:00.000Z", "2026-09-13T16:59:59.000Z"),
    "07/09 – 13/09/2026",
  );
  assert.equal(formatUiWeekRange("invalid", "2026-09-13T16:59:59.000Z"), "Chưa rõ thời gian");
});
