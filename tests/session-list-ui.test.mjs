import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin session list keeps dates safe and mobile rows non-overlapping", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../app/admin-sessions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-sessions.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /Number\.isNaN\(date\.getTime\(\)\)/);
  assert.match(component, /aria-pressed=\{stateFilter === "upcoming"\}/);
  assert.match(css, /grid-template-areas:/);
  assert.match(component, /abortController\.current\?\.abort\(\)/);
  assert.match(component, /hasNextPage/);
  assert.match(component, /url\.searchParams\.set\("status"/);
  assert.match(component, /pageSize/);
  assert.match(component, /href=\{actionPath\}/);
  assert.match(component, /action: "delete_slot"/);
  assert.match(component, /session\.kind !== "account"/);
  assert.match(component, /aria-label=\{`Xóa kíp \$\{session\.name\}`\}/);
  assert.match(component, /<MacAlert/);
  assert.match(component, /Xóa kíp và dữ liệu/);
  assert.match(component, /toàn bộ bài làm, kết quả, danh sách thí sinh và dữ liệu vận hành liên quan/);
  assert.match(css, /\.admin-session-delete/);
  assert.match(css, /\.admin-session-row-actions/);
});
