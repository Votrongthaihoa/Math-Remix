import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { randomGuestLinkToken } from "../lib/guest-exam-server.ts";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("guest exam links use a short public token while preserving legacy routes", async () => {
  const tokens = Array.from({ length: 32 }, () => randomGuestLinkToken());
  assert.equal(new Set(tokens).size, tokens.length);
  assert.equal(tokens.every(token => /^[A-Za-z0-9_-]{10}$/.test(token)), true);

  const [accessRoute, guestServer, catchAll, wizard] = await Promise.all([
    source("app/api/admin/exam-access/route.ts"),
    source("lib/guest-exam-server.ts"),
    source("app/[...slug]/page.tsx"),
    source("app/admin-session-wizard.tsx"),
  ]);

  assert.match(accessRoute, /https:\/\/mathremix\.pro\.vn/);
  assert.match(accessRoute, /new URL\(`\/exam\/\$\{encodeURIComponent\(token\)\}`/);
  assert.doesNotMatch(accessRoute, /new URL\(`\/guest\/exam\//);
  assert.equal((accessRoute.match(/randomGuestLinkToken\(\)/g) ?? []).length, 2);
  assert.match(guestServer, /\^\[A-Za-z0-9_-\]\{10,100\}\$/);
  assert.match(catchAll, /validDirectGuestExamRoute/);
  assert.match(catchAll, /validLegacyGuestExamRoute/);
  assert.match(catchAll, /initialGuestToken=\{guestToken\}/);
  assert.match(wizard, /LINK NGẮN/);
  assert.match(wizard, /Link ngừng nhận lượt thi mới khi kíp đóng lúc/);
});
