import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the Node test runner supports TypeScript utility imports on the CI Node version", async () => {
  const packageConfig = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(packageConfig.scripts.test, /node --experimental-strip-types --test tests\/\*\.test\.mjs/);
});
