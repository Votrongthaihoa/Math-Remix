import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hlsOriginPath, hlsVideoId } from "../lib/hls-vault.ts";

test("HLS Vault accepts bounded video ids and keeps origin paths inside the vault", () => {
  assert.equal(hlsVideoId("lesson01"), "lesson01");
  assert.equal(hlsVideoId("../private"), null);
  assert.equal(hlsOriginPath("lesson01", "1080p/index.m3u8"), "VideoVault/lesson01/1080p/index.m3u8");
  assert.throws(() => hlsOriginPath("lesson01", "../private.m3u8"));
  assert.throws(() => hlsOriginPath("lesson01", "key:bad"));
});

test("HLS Vault routes use the existing content-token and resource-access boundary", async () => {
  const [route, adminRoute, player] = await Promise.all([
    readFile(new URL("../app/api/hls/[resourceId]/[...path]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/lesson-hls/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/video-player.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /verifyContentToken/);
  assert.match(route, /guardResourceAccess/);
  assert.match(route, /activeAccount/);
  assert.match(route, /MEDIA_MASTER_KEY_HEX/);
  assert.doesNotMatch(route, /ensureActiveAccount\(/);
  assert.match(adminRoute, /profile\.role !== "admin"/);
  assert.match(adminRoute, /resource_type:\s*"hls_vault"/);
  assert.match(player, /import\("hls\.js"\)/);
  assert.match(player, /content\.type === "hls_vault"/);
});
