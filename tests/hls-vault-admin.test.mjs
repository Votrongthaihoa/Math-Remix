import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveHlsMediaKey } from "../lib/hls-key.ts";
import { clearAttachedBytes, hlsUploadPath } from "../lib/hls-upload.ts";

test("HLS media key derivation is deterministic, video-scoped, and 16 bytes", async () => {
  const master = "00".repeat(32);
  const first = await deriveHlsMediaKey(master, "lesson01");
  const second = await deriveHlsMediaKey(master, "lesson01");
  const otherVideo = await deriveHlsMediaKey(master, "lesson02");

  assert.equal(first.byteLength, 16);
  assert.deepEqual(Array.from(first), Array.from(second));
  assert.notDeepEqual(Array.from(first), Array.from(otherVideo));
});

test("HLS upload paths accept only the vault manifests and segments", () => {
  assert.equal(hlsUploadPath("lesson01", "master.m3u8"), "master.m3u8");
  assert.equal(hlsUploadPath("lesson01", "1080p/seg_00001.ts"), "1080p/seg_00001.ts");
  assert.equal(hlsUploadPath("lesson01", "720p/index.m3u8"), "720p/index.m3u8");
  assert.throws(() => hlsUploadPath("lesson01", "../secret.txt"));
  assert.throws(() => hlsUploadPath("lesson01", "1080p/key.bin"));
  assert.throws(() => hlsUploadPath("lesson01", "master.m3u8?token=secret"));
});

test("clearing an FFmpeg key is safe after its buffer is transferred", () => {
  const detached = new Uint8Array([1, 2, 3]);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  assert.doesNotThrow(() => clearAttachedBytes(detached));

  const attached = new Uint8Array([1, 2, 3]);
  clearAttachedBytes(attached);
  assert.deepEqual(Array.from(attached), [0, 0, 0]);
});

test("admin HLS tool encodes locally and never embeds the master secret", async () => {
  const component = await readFile(new URL("../app/admin-hls-vault.tsx", import.meta.url), "utf8");
  const keyRoute = await readFile(new URL("../app/api/admin/hls-vault/key/route.ts", import.meta.url), "utf8");

  assert.match(component, /import\("@ffmpeg\/ffmpeg"\)/);
  assert.match(component, /\/api\/admin\/hls-vault\/upload/);
  assert.match(component, /hls\.key/);
  assert.match(component, /clearAttachedBytes\(ffmpegKey\)/);
  assert.doesNotMatch(component, /ffmpegKey\.fill\(0\)/);
  assert.doesNotMatch(component, /MEDIA_MASTER_KEY_HEX/);
  assert.match(keyRoute, /ensureActiveAccount/);
  assert.match(keyRoute, /hlsMediaKeyFromEnvironment/);
  assert.doesNotMatch(keyRoute, /console\.log\([^)]*key/i);
});
