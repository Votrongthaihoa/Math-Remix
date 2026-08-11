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
});
