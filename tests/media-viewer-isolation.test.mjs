import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("protected media viewer uses an isolated origin and channel-bound messages", async () => {
  const [player, worker, hls] = await Promise.all([
    readFile(new URL("../app/video-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../workers/media-proxy/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/hls/[resourceId]/[...path]/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(player, /MEDIA_VIEWER_ORIGIN/);
  assert.match(player, /sandbox="allow-scripts allow-same-origin"/);
  assert.match(player, /referrerPolicy="no-referrer"/);
  assert.match(player, /event\.origin !== MEDIA_VIEWER_ORIGIN/);
  assert.match(player, /channel: viewerChannelRef\.current/);
  assert.doesNotMatch(player, /wm=\$\{encodeURIComponent\(watermarkEmail\)/);
  assert.match(worker, /viewer\/video/);
  assert.match(worker, /viewer\/pdf/);
  assert.match(worker, /frame-ancestors https:\/\/mathremix\.pro\.vn https:\/\/www\.mathremix\.pro\.vn/);
  assert.match(hls, /https:\/\/media\.mathremix\.pro\.vn/);
});
