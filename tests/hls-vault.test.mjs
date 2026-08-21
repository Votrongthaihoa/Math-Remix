import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hlsOriginPath, hlsVideoId, rewriteHlsManifest } from "../lib/hls-vault.ts";
import { HLS_UPLOAD_RATE_LIMIT } from "../lib/hls-upload.ts";

test("HLS Vault accepts bounded video ids and keeps origin paths inside the vault", () => {
  assert.equal(hlsVideoId("lesson01"), "lesson01");
  assert.equal(hlsVideoId("../private"), null);
  assert.equal(hlsOriginPath("lesson01", "1080p/index.m3u8"), "VideoVault/lesson01/1080p/index.m3u8");
  assert.throws(() => hlsOriginPath("lesson01", "../private.m3u8"));
  assert.throws(() => hlsOriginPath("lesson01", "key:bad"));
});

test("HLS Vault rewrites local playlists and the derived AES key back through the gateway", () => {
  const manifest = [
    "#EXTM3U",
    '#EXT-X-KEY:METHOD=AES-128,URI="https://hls-key.invalid/key/lesson01"',
    "#EXTINF:6,",
    "seg_00000.ts",
  ].join("\n");

  const rewritten = rewriteHlsManifest(manifest, "resource-1", "1080p/index.m3u8", "content-token");

  assert.match(rewritten, /URI="\/api\/hls\/resource-1\/key\?t=content-token"/);
  assert.match(rewritten, /\/api\/hls\/resource-1\/1080p\/seg_00000\.ts\?t=content-token/);
  assert.throws(() => rewriteHlsManifest("https://example.com/segment.ts", "resource-1", "index.m3u8", "content-token"));
});

test("HLS upload rate limit stays within the database RPC contract", () => {
  assert.equal(HLS_UPLOAD_RATE_LIMIT.capacity, 1000);
  assert.equal(HLS_UPLOAD_RATE_LIMIT.refillSeconds, 1);
});

test("HLS Vault routes use the existing content-token and resource-access boundary", async () => {
  const [route, adminRoute, player, keyHelper] = await Promise.all([
    readFile(new URL("../app/api/hls/[resourceId]/[...path]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/lesson-hls/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/video-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/hls-key.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /verifyContentToken/);
  assert.match(route, /guardResourceAccess/);
  assert.match(route, /activeAccount/);
  assert.match(keyHelper, /process\.env\.MEDIA_MASTER_KEY_HEX/);
  assert.doesNotMatch(route, /ensureActiveAccount\(/);
  assert.match(adminRoute, /profile\.role !== "admin"/);
  assert.match(adminRoute, /resource_type:\s*"hls_vault"/);
  assert.match(player, /import\("hls\.js"\)/);
  assert.match(player, /import\("plyr"\)/);
  assert.match(player, /new Plyr\(/);
  assert.match(player, /disableContextMenu:\s*true/);
  assert.match(player, /content\.type === "hls_vault"/);
  assert.match(player, /controlsList="nodownload noremoteplayback"/);
});

test("HLS gateway proxies segments and throttles bulk downloader requests", async () => {
  const route = await readFile(new URL("../app/api/hls/[resourceId]/[...path]/route.ts", import.meta.url), "utf8");

  assert.match(route, /consumeRequestBudget/);
  assert.match(route, /security_events/);
  assert.match(route, /range_not_supported/);
  assert.match(route, /new Response\(source\.body/);
  assert.doesNotMatch(route, /Response\.redirect\(origin, 302\)/);
});
