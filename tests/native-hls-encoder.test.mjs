import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native HLS encoder uses local FFmpeg and the existing protected upload contract", async () => {
  const [script, packageJson, docs] = await Promise.all([
    readFile(new URL("../scripts/encode-hls-native.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../docs/onedrive-hls-vault-setup.md", import.meta.url), "utf8"),
  ]);

  assert.match(script, /C:\\\\ffmpeg\\\\bin\\\\ffmpeg\.exe/);
  assert.match(script, /spawn/);
  assert.match(script, /HLS_UPLOAD_CONCURRENCY\s*=\s*6/);
  assert.match(script, /\/api\/admin\/hls-vault\/key/);
  assert.match(script, /\/api\/admin\/hls-vault\/upload/);
  assert.match(script, /authorization/i);
  assert.doesNotMatch(script, /MEDIA_MASTER_KEY_HEX/);
  assert.match(packageJson, /"encode:hls:native"\s*:/);
  assert.match(packageJson, /"ffmpeg:agent"\s*:/);
  assert.match(docs, /encode-hls-native\.mjs/);
  assert.match(docs, /--check-ffmpeg/);
});

test("native HLS encoder supports an FFmpeg-only preflight", async () => {
  const { parseArguments } = await import("../scripts/encode-hls-native.mjs");
  const options = parseArguments(["--check-ffmpeg"]);

  assert.equal(options.checkFfmpeg, true);
});

test("native HLS encoder accepts an FFmpeg executable from PATH", async () => {
  const { parseArguments } = await import("../scripts/encode-hls-native.mjs");
  const options = parseArguments(["--check-ffmpeg", "--ffmpeg", "ffmpeg"]);

  assert.equal(options.ffmpegPath, "ffmpeg");
});
