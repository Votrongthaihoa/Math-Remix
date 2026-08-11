import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production start launches the generated Cloudflare Worker", async () => {
  const [packageJson, launcher] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/start-worker.mjs", import.meta.url), "utf8"),
  ]);
  const packageConfig = JSON.parse(packageJson);

  assert.equal(packageConfig.scripts.start, "node scripts/start-worker.mjs");
  assert.equal(packageConfig.scripts["test:e2e"], "node scripts/run-playwright.mjs");
  assert.match(packageConfig.scripts["start:node"], /vinext start/);
  assert.match(launcher, /dist[\\/]server[\\/]wrangler\.json/);
  assert.match(launcher, /\.env\.local/);
});
