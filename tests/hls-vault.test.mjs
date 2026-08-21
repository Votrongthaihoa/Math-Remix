import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hlsOriginPath, hlsVideoId, rewriteHlsManifest } from "../lib/hls-vault.ts";
import { HLS_UPLOAD_RATE_LIMIT } from "../lib/hls-upload.ts";

test("HLS Vault accepts bounded video ids and keeps origin paths inside the vault", () => {
  assert.equal(hlsVideoId("lesson01"), "lesson01");
  assert.equal(hlsVideoId("../private"), null);
  assert.equal(hlsOriginPath("lesson01", "1080p/index.m3u8"), "VideoVault/lesson01/1080p/index.m3u8");
  assert.equal(hlsOriginPath("lesson01", "index.m3u8"), "VideoVault/lesson01/index.m3u8");
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

test("HLS Vault rewrites a root single-rendition playlist", () => {
  const rewritten = rewriteHlsManifest("#EXTM3U\n#EXTINF:6,\nseg_00000.ts", "resource-1", "index.m3u8", "content-token");

  assert.match(rewritten, /\/api\/hls\/resource-1\/seg_00000\.ts\?t=content-token/);
});

test("HLS upload rate limit stays within the database RPC contract", () => {
  assert.equal(HLS_UPLOAD_RATE_LIMIT.capacity, 1000);
  assert.equal(HLS_UPLOAD_RATE_LIMIT.refillSeconds, 1);
});

test("HLS Vault routes use the existing content-token and resource-access boundary", async () => {
  const [route, adminRoute, tokenRoute, player, keyHelper] = await Promise.all([
    readFile(new URL("../app/api/hls/[resourceId]/[...path]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/lesson-hls/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/video-token/route.ts", import.meta.url), "utf8"),
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
  assert.match(adminRoute, /playlistPath:\s*"index\.m3u8"/);
  assert.match(tokenRoute, /index\.m3u8/);
  assert.doesNotMatch(player, /import\("hls\.js"\)/);
  assert.doesNotMatch(player, /plyr/i);
  assert.match(player, /yt-embed-player\.html\?mode=hls/);
  assert.match(player, /remix:set-video-source/);
  assert.match(player, /content\.type === "hls_vault"/);
  assert.match(player, /application\/vnd\.apple\.mpegurl/);
});

test("HLS gateway proxies segments and throttles bulk downloader requests", async () => {
  const route = await readFile(new URL("../app/api/hls/[resourceId]/[...path]/route.ts", import.meta.url), "utf8");

  assert.match(route, /consumeRequestBudget/);
  assert.match(route, /security_events/);
  assert.match(route, /new Response\(source\.body/);
  assert.doesNotMatch(route, /Response\.redirect\(origin, 302\)/);
});

test("HLS gateway forwards media ranges and preserves partial segment responses", async () => {
  const route = await readFile(new URL("../app/api/hls/[resourceId]/[...path]/route.ts", import.meta.url), "utf8");

  assert.match(route, /const range.*request\.headers\.get\("range"\)/s);
  assert.match(route, /upstreamHeaders\.set\("range", range\)/);
  assert.match(route, /status: source\.status/);
  assert.match(route, /content-range/);
  assert.doesNotMatch(route, /range_not_supported/);
});

test("HLS gateway CORS credentials are restricted to approved web origins", async () => {
  const route = await readFile(new URL("../app/api/hls/[resourceId]/[...path]/route.ts", import.meta.url), "utf8");

  assert.match(route, /https:\/\/mathremix\.pro\.vn/);
  assert.match(route, /https:\/\/www\.mathremix\.pro\.vn/);
  assert.match(route, /localhost/);
  assert.match(route, /access-control-allow-headers.*Range/);
  assert.match(route, /vary.*Origin|Origin.*vary/s);
  assert.doesNotMatch(route, /access-control-allow-origin": origin \|\| "\*"/);
});

test("HLS gateway rejects requests without an approved Math Remix web origin", async () => {
  const route = await readFile(new URL("../app/api/hls/[resourceId]/[...path]/route.ts", import.meta.url), "utf8");

  assert.match(route, /request\.headers\.get\("origin"\)/);
  assert.match(route, /request\.headers\.get\("referer"\)/);
  assert.match(route, /origin_not_allowed/);
  assert.match(route, /NODE_ENV/);
  assert.doesNotMatch(route, /hostname !== "localhost"/);
});

test("HLS player routes the media source through the configured API origin", async () => {
  const player = await readFile(new URL("../app/video-player.tsx", import.meta.url), "utf8");

  assert.match(player, /import \{ apiRequestUrl \} from "\.\.\/lib\/api-url";/);
  assert.match(player, /apiRequestUrl\(resolved\.playbackUrl\)/);
});

test("HLS uses the shared Vidstack player instead of Plyr", async () => {
  const [player, sharedVideoPlayer] = await Promise.all([
    readFile(new URL("../app/video-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/yt-embed-player.html", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(player, /plyr/i);
  assert.match(player, /yt-embed-player\.html\?mode=hls/);
  assert.match(sharedVideoPlayer, /\["native", "hls"\]/);
  assert.match(sharedVideoPlayer, /application\/vnd\.apple\.mpegurl/);
  assert.match(sharedVideoPlayer, /xhr\.withCredentials\s*=\s*true/);
});
