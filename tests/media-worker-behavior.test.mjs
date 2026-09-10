import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";
import mediaWorker from "../workers/media-proxy/src/index.ts";

function bucket(result = null) {
  const calls = [];
  return { calls, MEDIA_BUCKET: {
    async get(...args) { calls.push(["get", ...args]); if (result instanceof Error) throw result; return result; },
    async head(...args) { calls.push(["head", ...args]); if (result instanceof Error) throw result; return result; },
  } };
}
function object(overrides = {}) {
  return { size: 6, httpEtag: '"synthetic-etag"', body: new Response("sample").body,
    writeHttpMetadata(headers) { headers.set("content-type", "video/mp4"); }, ...overrides };
}
const request = (path, init) => new Request(`https://media.example.invalid${path}`, init);

for (const path of ["/private-videos/secret.mp4", "/unknown", "/admin-images", "/admin-images/bad%2Fname.png", "/admin-images/bad%5cname.png", "/admin-images/%00.png", "/admin-images/%zz.png", "/admin-images/%E0%A4%A.png", "/admin-images/..%2fprivate.png"]) {
  test(`media gateway rejects invalid/private path ${path} without querying R2`, async () => {
    const env = bucket();
    const response = await mediaWorker.fetch(request(path), env);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(env.calls, []);
  });
}

test("media gateway root returns a non-cacheable health banner without storage access", async () => {
  const env = bucket();
  const response = await mediaWorker.fetch(request("/"), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "REMIX Education media gateway");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(env.calls, []);
});

for (const [path, key] of [["/admin-images/b%C3%A0i%20h%E1%BB%8Dc.png?x=1#ignored", "admin-images/bài học.png"], ["/public-videos/clip.mp4?download=1", "public-videos/clip.mp4"]]) {
  test(`public key decoding and query/hash isolation: ${path}`, async () => {
    const env = bucket(object());
    const req = request(path, { headers: { range: "bytes=1-3", "if-none-match": '"prior"' } });
    const response = await mediaWorker.fetch(req, env);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "sample");
    assert.deepEqual(env.calls, [["get", key, { onlyIf: req.headers, range: req.headers }]]);
    assert.equal(response.headers.get("content-type"), "video/mp4");
    assert.equal(response.headers.get("content-length"), "6");
    assert.equal(response.headers.get("etag"), '"synthetic-etag"');
    assert.equal(response.headers.get("cross-origin-resource-policy"), "cross-origin");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("accept-ranges"), "bytes");
  });
}

test("OPTIONS is public and bodyless; writes are denied without storage access", async () => {
  const env = bucket();
  const preflight = await mediaWorker.fetch(request("/anything", { method: "OPTIONS", headers: { origin: "https://untrusted.invalid" } }), env);
  assert.equal(preflight.status, 204);
  assert.equal(await preflight.text(), "");
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  assert.equal(preflight.headers.get("access-control-allow-methods"), "GET, HEAD, OPTIONS");
  for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
    const response = await mediaWorker.fetch(request("/public-videos/clip.mp4", { method }), env);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD, OPTIONS");
  }
  assert.deepEqual(env.calls, []);
});

test("HEAD reads metadata only and returns no object body", async () => {
  const env = bucket(object());
  const response = await mediaWorker.fetch(request("/public-videos/clip.mp4", { method: "HEAD" }), env);
  assert.deepEqual(env.calls, [["head", "public-videos/clip.mp4"]]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-length"), "6");
  assert.equal(await response.text(), "");
});

for (const [range, expected] of [[{ offset: 1, length: 3 }, "bytes 1-3/6"], [{ suffix: 2 }, "bytes 4-5/6"], [{ suffix: 99 }, "bytes 0-5/6"], [{ offset: 4 }, "bytes 4-5/6"]]) {
  test(`R2 returned range ${JSON.stringify(range)} becomes a partial response`, async () => {
    const response = await mediaWorker.fetch(request("/public-videos/clip.mp4", { headers: { range: "bytes=1-3" } }), bucket(object({ range })));
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), expected);
  });
}

for (const [headers, expectedStatus] of [[{ "if-none-match": '"etag"' }, 304], [{ "if-modified-since": "Thu, 01 Jan 2026 00:00:00 GMT" }, 304], [{ "if-match": '"etag"' }, 412]]) {
  test(`failed R2 condition returns ${expectedStatus} without body`, async () => {
    const metadata = object();
    delete metadata.body;
    const response = await mediaWorker.fetch(request("/public-videos/clip.mp4", { headers }), bucket(metadata));
    assert.equal(response.status, expectedStatus);
    assert.equal(await response.text(), "");
  });
}

test("R2 missing objects return 404; thrown storage errors return sanitized no-store 500", async t => {
  t.mock.method(console, "error", () => {});
  assert.equal((await mediaWorker.fetch(request("/public-videos/missing.mp4"), bucket())).status, 404);
  const response = await mediaWorker.fetch(request("/public-videos/clip.mp4"), bucket(new Error("synthetic private storage diagnostics")));
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "Unable to load media");
});

for (const viewer of ["video", "pdf"]) {
  test(`${viewer} viewer response enforces isolated-origin security policy`, async () => {
    const env = bucket();
    const response = await mediaWorker.fetch(request(`/viewer/${viewer}`), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const policy = response.headers.get("content-security-policy");
    assert.ok(policy.includes("default-src 'none'"));
    assert.ok(policy.includes("frame-ancestors https://mathremix.pro.vn https://www.mathremix.pro.vn"));
    assert.ok(policy.includes("connect-src https://api.mathremix.pro.vn"));
    assert.deepEqual(env.calls, []);
  });
}

// Execute the unmodified inline VIDEO_VIEWER script returned by the real Worker
// with a deliberately small DOM double. Native HLS support avoids CDN imports;
// this tests message/source policy, not browser sandbox/CSP enforcement or layout.
async function videoHarness(mode = "hls") {
  const html = await (await mediaWorker.fetch(request("/viewer/video"), bucket())).text();
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const nodes = [];
  const app = { children: [], replaceChildren(...children) { this.children = children; }, append(child) { this.children.push(child); } };
  const messages = [];
  const listeners = [];
  const parent = { postMessage(...args) { messages.push(args); } };
  const context = { URL, URLSearchParams, location: { search: `?mode=${mode}` }, parent,
    document: { querySelector: () => app, createElement(tag) { const node = { tag, style: {}, addEventListener() {}, canPlayType: () => "probably" }; nodes.push(node); return node; } },
    addEventListener(type, fn) { assert.equal(type, "message"); listeners.push(fn); },
    setInterval() {},
  };
  runInNewContext(script, context, { timeout: 1000 });
  const channel = "synthetic-channel-at-least-20";
  const origin = "https://mathremix.pro.vn";
  const send = (data, overrides = {}) => listeners.forEach(fn => fn({ origin, source: parent, data: { channel, ...data }, ...overrides }));
  return { send, channel, origin, parent, nodes, app, messages };
}

test("video init requires trusted parent origin/source and a minimum-length channel", async () => {
  const h = await videoHarness();
  for (const overrides of [{ origin: "https://evil.invalid" }, { source: {} }, { data: { type: "remix:viewer-init", channel: "short" } }, { data: null }]) h.send({ type: "remix:viewer-init" }, overrides);
  assert.equal(h.messages.length, 0);
  h.send({ type: "remix:viewer-init" });
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0][0].type, "remix:video-player-ready");
  assert.equal(h.messages[0][0].channel, h.channel);
  assert.equal(h.messages[0][1], h.origin);
});

test("video source messages require completed init and matching channel, origin and parent", async () => {
  const h = await videoHarness();
  const data = { type: "remix:set-video-source", src: "https://api.mathremix.pro.vn/api/hls/resource/index.m3u8?t=synthetic" };
  h.send(data);
  assert.equal(h.nodes.length, 0);
  h.send({ type: "remix:viewer-init" });
  for (const overrides of [{ origin: "https://evil.invalid" }, { source: {} }, { data: { ...data, channel: "different-channel-at-least-20" } }]) h.send(data, overrides);
  assert.equal(h.nodes.length, 0);
  h.send(data);
  assert.equal(h.nodes[0].tag, "video");
  assert.equal(h.nodes[0].src, data.src);
  assert.equal(h.nodes[0].referrerPolicy, "no-referrer");
});

for (const src of ["http://api.mathremix.pro.vn/api/hls/x", "https://evil.invalid/api/hls/x", "https://api.mathremix.pro.vn/api/other", "https://user:password@api.mathremix.pro.vn/api/hls/x", "javascript:alert(1)", "not a URL"]) {
  test(`HLS viewer rejects forbidden source ${src}`, async () => {
    const h = await videoHarness();
    h.send({ type: "remix:viewer-init" });
    h.send({ type: "remix:set-video-source", src });
    assert.ok(!h.nodes.some(node => node.tag === "video"));
    assert.equal(h.messages.at(-1)[0].type, "remix:video-player-error");
  });
}

test("YouTube viewer accepts a valid id and rejects URL injection", async () => {
  const h = await videoHarness("youtube");
  h.send({ type: "remix:viewer-init" });
  h.send({ type: "remix:set-video-source", videoId: "abc_DEF-123", start: -100 });
  assert.equal(h.nodes[0].src, "https://www.youtube-nocookie.com/embed/abc_DEF-123?autoplay=0&start=0");
  h.send({ type: "remix:set-video-source", videoId: "https://evil.invalid/" });
  assert.equal(h.messages.at(-1)[0].type, "remix:video-player-error");
});
