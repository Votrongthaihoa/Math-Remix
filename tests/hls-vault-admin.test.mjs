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

test("HLS upload paths accept the single-rendition root playlist", () => {
  assert.equal(hlsUploadPath("lesson01", "index.m3u8"), "index.m3u8");
  assert.equal(hlsUploadPath("lesson01", "seg_00001.ts"), "seg_00001.ts");
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
  assert.match(component, /@ffmpeg\/core-mt@0\.12\.10/);
  assert.match(component, /ffmpeg-core\.worker\.js/);
  assert.match(component, /crossOriginIsolated/);
  assert.match(component, /workerURL/);
  assert.match(component, /\/api\/admin\/hls-vault\/upload/);
  assert.match(component, /NATIVE_AGENT_ORIGIN/);
  assert.match(component, /activeSessionToken/);
  assert.match(component, /FFmpeg native trên máy/);
  assert.match(component, /hls\.key/);
  assert.match(component, /clearAttachedBytes\(ffmpegKey\)/);
  assert.doesNotMatch(component, /ffmpegKey\.fill\(0\)/);
  assert.doesNotMatch(component, /MEDIA_MASTER_KEY_HEX/);
  assert.match(keyRoute, /ensureAdminPermission\(request, "courses"\)/);
  assert.match(keyRoute, /hlsMediaKeyFromEnvironment/);
  assert.doesNotMatch(keyRoute, /console\.log\([^)]*key/i);
});

test("admin HLS tool reserves CPU threads for one browser rendition", async () => {
  const component = await readFile(new URL("../app/admin-hls-vault.tsx", import.meta.url), "utf8");

  assert.match(component, /navigator\.hardwareConcurrency/);
  assert.match(component, /-threads/);
  assert.match(component, /SINGLE_RENDITION/);
  assert.doesNotMatch(component, /Promise\.all\(RENDITIONS\.map/);
});

test("admin HLS tool bounds segment size and uploads files in small batches", async () => {
  const component = await readFile(new URL("../app/admin-hls-vault.tsx", import.meta.url), "utf8");

  assert.match(component, /HLS_SEGMENT_SECONDS = 6/);
  assert.match(component, /HLS_UPLOAD_CONCURRENCY = 6/);
  assert.match(component, /Promise\.allSettled\(entries\.slice/);
});

test("admin HLS tool keeps one root playlist and never creates a 720p rendition", async () => {
  const component = await readFile(new URL("../app/admin-hls-vault.tsx", import.meta.url), "utf8");

  assert.match(component, /seg_%05d\.ts/);
  assert.match(component, /index\.m3u8/);
  assert.doesNotMatch(component, /master\.m3u8/);
  assert.doesNotMatch(component, /720p/);
});

test("admin HLS logs remain fully readable and keyboard-scrollable", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../app/admin-hls-vault.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-hls-vault.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /<pre className="admin-hls-vault-log" role="log" aria-label="Nhật ký FFmpeg" tabIndex=\{0\}>\{ffmpegLog\}<\/pre>/);
  assert.doesNotMatch(component, /className="admin-hls-vault-log" title=\{ffmpegLog\}/);
  assert.match(css, /\.admin-hls-vault-log\s*\{[\s\S]*?max-height:\s*180px;[\s\S]*?overflow:\s*auto;[\s\S]*?white-space:\s*pre-wrap;[\s\S]*?overflow-wrap:\s*anywhere;/);
  assert.doesNotMatch(css, /\.admin-hls-vault-log\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(css, /\.admin-hls-vault-log:focus-visible\s*\{[\s\S]*?outline:\s*2px/);
});

test("HLS encoder route enables browser cross-origin isolation", async () => {
  const [worker, proxy] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
  ]);

  assert.match(worker, /admin\/hls-vault/);
  assert.match(worker, /searchParams\.get\("isolated"\) === "1"/);
  assert.match(worker, /cross-origin-opener-policy/);
  assert.match(worker, /cross-origin-embedder-policy/);
  assert.match(proxy, /admin\/hls-vault/);
  assert.match(proxy, /searchParams\.get\("isolated"\) === "1"/);
  assert.match(proxy, /cross-origin-opener-policy/);
  assert.match(proxy, /cross-origin-embedder-policy/);
});

test("admin HLS tool cancels both encoders, guards navigation, and announces only stages", async () => {
  const [component, agent] = await Promise.all([
    readFile(new URL("../app/admin-hls-vault.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/native-hls-agent.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(component, /activeRunIdRef\.current \+= 1/);
  assert.match(component, /disposeFfmpeg\(\)/);
  assert.match(component, /nativeJobRequest\(jobId, "DELETE"\)/);
  assert.match(component, /window\.addEventListener\("beforeunload", handleBeforeUnload\)/);
  assert.match(component, /listenForProductNavigation\(event =>/);
  assert.match(component, /runAbortControllerRef\.current\?\.abort\(\)/);
  assert.match(component, /const runController = new AbortController\(\)/);
  assert.match(component, /startNative\(normalizedVideoId, runId, runController\.signal\)/);
  assert.match(component, /if \(!currentRun\(runId\)\) return;[\s\S]*?activeSessionToken\(\)/);
  assert.match(component, /if \(jobId\) void nativeJobRequest\(jobId, "DELETE"\)/);
  assert.match(component, /setState\("cancelled"\)[\s\S]*?if \(jobId\) await nativeJobRequest/);
  assert.match(component, /className="admin-hls-vault-stage-live" role="status" aria-live="polite" aria-atomic="true"/);
  assert.doesNotMatch(component, /admin-hls-vault-progress-card" aria-live/);
  assert.match(component, /aria-invalid=\{Boolean\(fieldErrors\.videoId\)\}/);
  assert.match(component, /aria-describedby=\{`admin-hls-video-id-help\$\{fieldErrors\.videoId \? " admin-hls-video-id-error" : ""\}`\}/);
  assert.match(component, /aria-invalid=\{Boolean\(fieldErrors\.file\)\}/);
  assert.match(component, /<b role="status" aria-live="polite" aria-atomic="true">/);
  assert.match(component, /type="file"[^>]*tabIndex=\{-1\}/);
  assert.match(component, /state === "done"[\s\S]*?Bước tiếp theo: mở trình soạn nội dung/);
  assert.match(component, /className="admin-hls-vault-notice">\{notice\}/);
  assert.doesNotMatch(component, /className="admin-hls-vault-notice" role="status"/);
  assert.match(agent, /request\.method === "DELETE"/);
  assert.match(agent, /job\.child\.kill\(\)/);
});
