import assert from "node:assert/strict";
import test from "node:test";

test("native HLS agent allows only approved web origins", async () => {
  const { isAllowedOrigin } = await import("../scripts/native-hls-agent.mjs");

  assert.equal(isAllowedOrigin("https://mathremix.pro.vn"), true);
  assert.equal(isAllowedOrigin("https://www.mathremix.pro.vn"), true);
  assert.equal(isAllowedOrigin("http://localhost:5175"), true);
  assert.equal(isAllowedOrigin("https://evil.example"), false);
  assert.equal(isAllowedOrigin(""), false);
});
