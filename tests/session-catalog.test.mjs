import assert from "node:assert/strict";
import test from "node:test";

import { sessionState } from "../lib/session-catalog.ts";

test("sessionState derives the operational state from its window", () => {
  const session = {
    enabled: true,
    starts_at: "2026-08-09T09:00:00.000Z",
    ends_at: "2026-08-09T10:00:00.000Z",
  };

  assert.equal(sessionState(session, Date.parse("2026-08-09T08:59:59.000Z")), "upcoming");
  assert.equal(sessionState(session, Date.parse("2026-08-09T09:30:00.000Z")), "open");
  assert.equal(sessionState(session, Date.parse("2026-08-09T10:00:01.000Z")), "ended");
  assert.equal(sessionState({ ...session, enabled: false }, Date.parse("2026-08-09T09:30:00.000Z")), "disabled");
});
