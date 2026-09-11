import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("HLS sends the authenticated email watermark to the same moving overlay used by YouTube", async () => {
  const [player, viewer] = await Promise.all([
    readFile(new URL("../app/video-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/yt-embed-player.html", import.meta.url), "utf8"),
  ]);

  assert.match(player, /src=\{`\/yt-embed-player\.html\?mode=hls&wm=\$\{encodeURIComponent\(watermarkEmail\)\}`\}/);
  assert.match(viewer, /const watermarkOwner = \(query\.get\("wm"\) \|\| ""\)\.trim\(\)\.slice\(0, 120\)/);
  assert.match(viewer, /setInterval\(moveWatermark, 6500\)/);
});
