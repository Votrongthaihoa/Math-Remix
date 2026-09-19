import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("protected media viewers keep the intended mixed-origin and channel-bound boundaries", async () => {
  const [player, worker, hls, localViewer] = await Promise.all([
    readFile(new URL("../app/video-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../workers/media-proxy/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/hls/[resourceId]/[...path]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/yt-embed-player.html", import.meta.url), "utf8"),
  ]);

  assert.match(player, /MEDIA_VIEWER_ORIGIN/);
  assert.match(player, /MEDIA_VIEWER_ORIGIN\}\/viewer\/video\?mode=native/);
  assert.match(player, /MEDIA_VIEWER_ORIGIN\}\/viewer\/pdf/);
  assert.match(player, /sandbox="allow-scripts allow-same-origin"/);
  assert.match(player, /referrerPolicy="no-referrer"/);
  assert.match(player, /event\.origin !== MEDIA_VIEWER_ORIGIN/);
  assert.match(player, /event\.origin !== viewerOrigin \|\| event\.source !== frameWindow \|\| event\.data\?\.channel !== viewerChannelRef\.current/);
  assert.match(player, /channel: viewerChannelRef\.current/);
  assert.match(player, /\/yt-embed-player\.html\?v=\$\{encodeURIComponent\(content\.youtubeId\)\}[^`]+wm=\$\{encodeURIComponent\(watermarkEmail\)\}/);
  assert.match(player, /\/yt-embed-player\.html\?mode=hls&wm=\$\{encodeURIComponent\(watermarkEmail\)\}/);
  assert.match(localViewer, /event\.origin !== location\.origin \|\| event\.source !== window\.parent/);
  assert.match(localViewer, /function allowedHlsSource\(value\)/);
  assert.match(worker, /viewer\/video/);
  assert.match(worker, /viewer\/pdf/);
  assert.match(worker, /frame-ancestors https:\/\/mathremix\.pro\.vn https:\/\/www\.mathremix\.pro\.vn/);
  assert.match(hls, /https:\/\/media\.mathremix\.pro\.vn/);
});
