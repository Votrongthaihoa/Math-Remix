import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("Vercel uses a stable Node major and reviewed dependency install scripts", () => {
  assert.equal(packageJson.engines?.node, "22.x");
  assert.deepEqual(packageJson.allowScripts, {
    "core-js": false,
    "esbuild@0.18.20 || 0.25.12 || 0.27.3 || 0.28.0 || 0.28.1": true,
    "sharp@0.34.5": true,
    "unrs-resolver@1.11.1": true,
    "workerd@1.20260515.1 || 1.20260825.1": true,
  });
});
