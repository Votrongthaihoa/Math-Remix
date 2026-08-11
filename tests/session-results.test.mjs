import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("session results is a first-class admin route for combined sessions", async () => {
  const [page, platform, results] = await Promise.all([
    readFile(new URL("../app/[...slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-session-results.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /slug\.length === 4 && slug\[1\] === "sessions" && Boolean\(slug\[2\]\) && slug\[3\] === "results"/);
  assert.match(platform, /lazy\(\(\) => import\("\.\/admin-session-results"\)\)/);
  assert.match(results, /includeAccount=true/);
  assert.match(results, /TỔNG QUAN KÍP THI/);
  assert.match(results, /Người tham gia/);
});

test("session results release is single-flight and announces its busy state", async () => {
  const results = await readFile(new URL("../app/admin-session-results.tsx", import.meta.url), "utf8");

  assert.match(results, /const \[releasingResults, setReleasingResults\] = useState\(false\);/);
  assert.match(results, /const releaseInFlight = useRef\(false\);/);
  assert.match(results, /if \(releaseInFlight\.current\) return;/);
  assert.match(results, /releaseInFlight\.current = true;/);
  assert.match(results, /releaseInFlight\.current = false;/);
  assert.match(results, /aria-busy=\{releasingResults\}/);
  assert.match(results, /disabled=\{Boolean\(session\?\.resultsReleasedAt\) \|\| releasingResults\}/);
});

test("session list responsive CSS does not hide the results page", async () => {
  const css = await readFile(new URL("../app/admin-sessions.css", import.meta.url), "utf8");

  assert.match(css, /\.admin-session-meta\.admin-session-results\{display:none\}/);
  assert.doesNotMatch(css, /\.ui-shell\.admin-app \.admin-session-results\{display:none\}/);
});
