import assert from "node:assert/strict";
import test from "node:test";

test("math renderer contract includes entity decoding, delimiters, image normalization and scoped output", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../app/math-renderer-content.tsx", import.meta.url), "utf8");
  assert.match(source, /decodeHtmlEntities/);
  assert.match(source, /\\\\\[/);
  assert.match(source, /renderToString/);
  assert.match(source, /math-renderer/);
  assert.match(source, /referrerpolicy|allowFullScreen|allow=/);
  assert.match(source, /trustedRichHtml = false/);
  assert.match(source, /trustedRichHtml &&/);
});
