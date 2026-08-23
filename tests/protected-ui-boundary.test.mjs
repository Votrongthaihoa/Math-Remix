import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("visual smoke keeps redesign and protected route matrices separate", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /const redesignRoutes = \[/);
  assert.match(smoke, /const protectedRegressionRoutes = \[/);
  assert.match(smoke, /protected-exam-result/);
  assert.match(smoke, /protected-admin-exam-catalog/);
  assert.match(smoke, /protected-admin-session-results/);
  assert.match(smoke, /SMOKE_OUTPUT_DIR/);
  assert.match(smoke, /backClosedDetail/);
  assert.match(smoke, /forwardRestoredDetail/);
  assert.match(smoke, /incorrectly opted into optimized content/);
});

test("the opt-in foundation never names protected product internals", async () => {
  const [css, platform] = await Promise.all([
    readFile(new URL("../app/aeck-ui.css", import.meta.url), "utf8"),
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(css, /\.(?:exam|question|answer|result|review|solution|admin-exam)[\w-]*/i);
  assert.doesNotMatch(css, /(^|\n)\s*(?:button|input|textarea|select|svg|body|h1)\s*[{,]/m);
  assert.match(platform, /!examRunnerSurface && !protectedProductSurface && <a className="skip-link"/);
  assert.match(platform, /const currentView = viewFromPath\(pathname\)/);
});
