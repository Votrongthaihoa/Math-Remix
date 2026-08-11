import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { randomGuestLinkToken } from "../lib/guest-exam-server.ts";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("guest exam links use a short public token while preserving legacy routes", async () => {
  const tokens = Array.from({ length: 32 }, () => randomGuestLinkToken());
  assert.equal(new Set(tokens).size, tokens.length);
  assert.equal(tokens.every(token => /^[A-Za-z0-9_-]{10}$/.test(token)), true);

  const [accessRoute, guestServer, catchAll, wizard, wizardCss, guestExam, guestCss] = await Promise.all([
    source("app/api/admin/exam-access/route.ts"),
    source("lib/guest-exam-server.ts"),
    source("app/[...slug]/page.tsx"),
    source("app/admin-session-wizard.tsx"),
    source("app/admin-session-wizard.css"),
    source("app/guest-exam.tsx"),
    source("app/guest-exam.css"),
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
  assert.match(wizardCss, /\.admin-session-result-card\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(wizardCss, /\.admin-session-qr\s*\{[^}]*width:\s*fit-content;[^}]*min-height:\s*0/);
  assert.match(guestExam, /function GuestLinkTimePanel/);
  assert.match(guestExam, /<small>Thời gian hiện tại<\/small>/);
  assert.match(guestExam, /<small>Link hết hạn<\/small>/);
  assert.match(guestExam, /<time dateTime=/);
  assert.match(guestCss, /\.guest-link-time-panel\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(guestExam, /aria-live/);
});
