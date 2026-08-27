import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readJson(relativeUrl: string) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), "utf8")) as Record<string, unknown>;
}

test("Vercel forwards the API wildcard to the platform function without an invalid repeated replacement", async () => {
  const config = await readJson("../vercel.json");
  const rewrites = config.rewrites as Array<{ source: string; destination: string }>;

  assert.deepEqual(rewrites[0], {
    source: "/api/:path*",
    destination: "/api/platform",
  });
});

test("the deployable platform pins the supported Node major", async () => {
  const packageJson = await readJson("../package.json");

  assert.deepEqual(packageJson.engines, { node: "22.x" });
});

test("the platform declares the PostCSS plugin used by the monorepo config", async () => {
  const packageJson = await readJson("../package.json");
  const devDependencies = packageJson.devDependencies as Record<string, string>;

  assert.equal(devDependencies["@tailwindcss/postcss"], "4.2.1");
});
