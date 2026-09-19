import assert from "node:assert/strict";
import test from "node:test";
import { registerTestLoader } from "./support/test-loader.mjs";

await registerTestLoader([]);
const { isActiveProfileState } = await import(new URL("../lib/active-profile.ts", import.meta.url));
const now = Date.parse("2026-09-15T08:00:00.000Z");

test("profile activity fails closed for missing, locked, and permanently banned states", () => {
  assert.equal(isActiveProfileState(null, now), false);
  assert.equal(isActiveProfileState({ status: "active" }, now), false);
  assert.equal(isActiveProfileState({ status: "locked", account_status: "active" }, now), false);
  assert.equal(isActiveProfileState({ status: "active", account_status: "permanently_banned" }, now), false);
});

test("profile activity permits active accounts and elapsed temporary bans only", () => {
  assert.equal(isActiveProfileState({ status: "active", account_status: "active" }, now), true);
  assert.equal(isActiveProfileState({ status: "active", account_status: "temporarily_banned", banned_until: "2026-09-15T07:59:59.000Z" }, now), true);
  assert.equal(isActiveProfileState({ status: "active", account_status: "temporarily_banned", banned_until: "2026-09-15T08:00:01.000Z" }, now), false);
  assert.equal(isActiveProfileState({ status: "active", account_status: "temporarily_banned", banned_until: "invalid" }, now), false);
});
