import assert from "node:assert/strict";
import test from "node:test";
import { registerTestLoader } from "./support/test-loader.mjs";
import { signContentToken } from "../lib/content-token.ts";
import { hlsVideoId, rewriteHlsManifest } from "../lib/hls-vault.ts";

const SECRET = "synthetic-hls-route-secret-not-a-deployed-key";
const RESOURCE = "synthetic-resource";
const ORIGIN = "https://media.mathremix.pro.vn";
const routeUrl = new URL("../app/api/hls/[resourceId]/[...path]/route.ts", import.meta.url).href;
const state = {};
globalThis.__syntheticHlsRoute = state;
const stubs = {
  "content-server": "export const contentServer=()=>globalThis.__syntheticHlsRoute.config();",
  "hls-key": "export const hlsMediaKeyFromEnvironment=(...args)=>globalThis.__syntheticHlsRoute.key(...args);",
  "microsoft-graph-hls": "export const hlsVideoId=(...args)=>globalThis.__syntheticHlsRoute.videoId(...args);export const getHlsOriginRedirect=(...args)=>globalThis.__syntheticHlsRoute.origin(...args);",
  "rate-limit-server": "export const consumeRequestBudget=(...args)=>globalThis.__syntheticHlsRoute.budget(...args);",
  "resource-access-server": "export const guardResourceAccess=(...args)=>globalThis.__syntheticHlsRoute.guard(...args);",
  "security-server": "export const activeAccount=(...args)=>globalThis.__syntheticHlsRoute.active(...args);export const hashedRequestIp=async()=> 'synthetic-ip-hash';",
};
// The real route, content-token crypto and manifest rewriter execute unchanged.
// External configuration, access checks, origin discovery and quotas are seams,
// not claims about the current live schema or Microsoft/Cloudflare services.
const routeImports = {
  "../../../../../lib/content-server": "content-server",
  "../../../../../lib/hls-key": "hls-key",
  "../../../../../lib/microsoft-graph-hls": "microsoft-graph-hls",
  "../../../../../lib/rate-limit-server": "rate-limit-server",
  "../../../../../lib/resource-access-server": "resource-access-server",
  "../../../../../lib/security-server": "security-server",
};
await registerTestLoader([
  ...Object.entries(routeImports).map(([specifier, name]) => ({
    specifier,
    url: `data:text/javascript,${encodeURIComponent(stubs[name])}`,
  })),
  { specifier: "../../../../../lib/content-token", appendExtension: ".ts" },
  { specifier: "../../../../../lib/hls-vault", appendExtension: ".ts" },
]);
const { GET, OPTIONS } = await import(routeUrl);
test.after(() => { delete globalThis.__syntheticHlsRoute; });

async function harness(t, mode = "production") {
  const previousMode = process.env.NODE_ENV;
  process.env.NODE_ENV = mode;
  t.after(() => { if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode; });
  t.mock.method(Date, "now", () => 1_800_000_000_000);
  t.mock.method(console, "error", () => {});
  const calls = [];
  const profile = { id: "synthetic-user", role: "student", status: "active" };
  const admin = { from(table) {
    calls.push(["from", table]);
    const query = {
      select(value) { calls.push(["select", value]); return query; },
      eq(...args) { calls.push(["eq", ...args]); return query; },
      async maybeSingle() { return { data: profile, error: null }; },
      async insert(value) { calls.push(["insert", value]); return { error: null }; },
    };
    return query;
  } };
  Object.assign(state, {
    config: () => ({ ok: true, admin, tokenSecret: SECRET }),
    key: async () => new Uint8Array(16),
    videoId: hlsVideoId,
    origin: async (...args) => { calls.push(["origin", ...args]); return "https://upstream.example.invalid/synthetic-object"; },
    budget: async () => ({ allowed: true }),
    guard: async () => ({ ok: true, resource: { resource_type: "hls_vault", provider_metadata: { playbackMode: "hls-vault", hlsVideoId: "synthetic-video" } } }),
    active: () => true,
  });
  const upstream = { respond: async () => new Response("#EXTM3U\nsegment.ts") };
  t.mock.method(globalThis, "fetch", async (...args) => { calls.push(["fetch", ...args]); return upstream.respond(...args); });
  const token = await signContentToken(RESOURCE, profile.id, SECRET);
  const request = (headers = {}, suppliedToken = token, method = "GET") => new Request(`https://api.example.invalid/api/hls/${RESOURCE}/index.m3u8?t=${encodeURIComponent(suppliedToken)}`, { method, headers: { origin: ORIGIN, ...headers } });
  const get = (path = ["index.m3u8"], req = request(), resourceId = RESOURCE) => GET(req, { params: Promise.resolve({ resourceId, path }) });
  return { calls, state, upstream, request, get, token, profile };
}

async function error(response, status, expected) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error: expected });
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}

test("production HLS OPTIONS accepts isolated viewer origin with credentials and denies foreign/missing origins", async t => {
  const h = await harness(t);
  const response = await OPTIONS(h.request({}, "", "OPTIONS"));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.equal(response.headers.get("vary"), "Origin");
  assert.equal(await response.text(), "");
  for (const origin of ["https://evil.invalid", "https://mathremix.pro.vn.evil.invalid", "http://localhost:3000", "null", ""]) {
    const denied = await OPTIONS(h.request({ origin }, "", "OPTIONS"));
    assert.equal(denied.headers.has("access-control-allow-origin"), false);
    await error(denied, 403, "origin_not_allowed");
  }
  assert.deepEqual(h.calls, []);
});

test("GET method and origin denials precede auth/database/upstream work", async t => {
  const h = await harness(t);
  await error(await h.get(undefined, h.request({}, "", "POST")), 405, "method_not_allowed");
  await error(await h.get(undefined, h.request({ origin: "https://evil.invalid" })), 403, "origin_not_allowed");
  assert.deepEqual(h.calls, []);
});

test("valid production Referer can establish playback origin but cannot create wildcard credentialed CORS", async t => {
  const h = await harness(t);
  const response = await h.get(undefined, h.request({ origin: "", referer: `${ORIGIN}/viewer/video` }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.has("access-control-allow-origin"), false);
});

test("development HLS accepts loopback origins and rejects malformed origins safely", async t => {
  const h = await harness(t, "development");
  const local = await OPTIONS(h.request({ origin: "http://localhost:3000" }, "", "OPTIONS"));
  assert.equal(local.status, 204);
  assert.equal(local.headers.get("access-control-allow-origin"), "http://localhost:3000");
  for (const origin of ["http://127.0.0.1:8787", "not a URL", "ftp://localhost:3000"]) {
    const response = await OPTIONS(h.request({ origin }, "", "OPTIONS"));
    assert.equal(response.status, 204, origin);
    if (!origin.startsWith("http")) assert.equal(response.headers.has("access-control-allow-origin"), false);
  }
  process.env.NODE_ENV = "production";
  const malformedReferer = await OPTIONS(h.request({ origin: "", referer: "not a URL" }, "", "OPTIONS"));
  assert.equal(malformedReferer.status, 403);
});

test("missing, wrong-secret, expired and wrong-resource tokens never reach metadata or upstream", async t => {
  const h = await harness(t);
  const tokens = ["", "malformed", await signContentToken(RESOURCE, "synthetic-user", "wrong-synthetic-secret"), await signContentToken(RESOURCE, "synthetic-user", SECRET, 0), await signContentToken("other-resource", "synthetic-user", SECRET)];
  for (const token of tokens) await error(await h.get(undefined, h.request({}, token)), 401, "invalid_content_token");
  assert.deepEqual(h.calls, []);
});

for (const path of [["..", "secret.ts"], ["%2e%2e", "secret.ts"], ["folder%2f..%2fsecret.ts"], ["folder%5csecret.ts"], ["%00.ts"], ["%zz.ts"], ["%E0%A4%A.ts"], [""], ["https:evil.ts"], ["a".repeat(801)]]) {
  test(`HLS route rejects malformed path ${JSON.stringify(path).slice(0, 90)}`, async t => {
    const h = await harness(t);
    await error(await h.get(path), 400, "invalid_hls_path");
    assert.ok(!h.calls.some(([name]) => name === "origin" || name === "fetch"));
  });
}

test("manifest rewrites nested segment and key URIs, strips origin query/hash, and suppresses range forwarding", async t => {
  const h = await harness(t);
  h.upstream.respond = async () => new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://hls-key.invalid/key/video"\n../shared/seg.ts?upstream_secret=x#part\n');
  const response = await h.get(["720p", "index.m3u8"], h.request({ range: "bytes=0-10" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/vnd.apple.mpegurl; charset=utf-8");
  const text = await response.text();
  assert.ok(text.includes(`/api/hls/${RESOURCE}/key?t=${encodeURIComponent(h.token)}`));
  assert.ok(text.includes(`/api/hls/${RESOURCE}/shared/seg.ts?t=${encodeURIComponent(h.token)}`));
  assert.ok(!text.includes("upstream_secret"));
  assert.ok(!text.includes("#part"));
  const [, url, init] = h.calls.find(([name]) => name === "fetch");
  assert.equal(url, "https://upstream.example.invalid/synthetic-object");
  assert.equal(init.cache, "no-store");
  assert.equal(init.headers.has("range"), false);
});

test("segments stream partial content with range but do not forward upstream cookies or origins", async t => {
  const h = await harness(t);
  h.upstream.respond = async () => new Response("abc", { status: 206, headers: { "content-type": "video/mp2t", "content-range": "bytes 2-4/10", "content-length": "3", etag: '"synthetic"', "set-cookie": "private=1", "access-control-allow-origin": "*" } });
  const response = await h.get(["seg.ts"], h.request({ range: "bytes=2-4" }));
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "abc");
  assert.equal(response.headers.get("content-range"), "bytes 2-4/10");
  assert.equal(response.headers.get("content-disposition"), "inline");
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(h.calls.find(([name]) => name === "fetch")[2].headers.get("range"), "bytes=2-4");
});

for (const status of [404, 500, 503]) {
  test(`upstream ${status} is mapped to sanitized manifest/segment 502`, async t => {
    const h = await harness(t);
    h.upstream.respond = async () => new Response("private upstream details", { status });
    await error(await h.get(), 502, "hls_manifest_unavailable");
    await error(await h.get(["seg.ts"]), 502, "hls_segment_unavailable");
  });
}

test("upstream timeout rejection is caught and returned as a private 502", async t => {
  const h = await harness(t);
  h.upstream.respond = async () => { throw new DOMException("synthetic upstream timeout", "TimeoutError"); };
  await error(await h.get(), 502, "hls_playback_unavailable");
});

test("oversized declared manifest is rejected before reading bytes", async t => {
  const h = await harness(t);
  h.upstream.respond = async () => new Response("#EXTM3U", { headers: { "content-length": String(4 * 1024 * 1024 + 1) } });
  await error(await h.get(), 502, "hls_playback_unavailable");
});

test("oversized streamed manifest cancels its reader even without content-length", async t => {
  const h = await harness(t);
  let reason;
  h.upstream.respond = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); }, cancel(value) { reason = value; } }));
  await error(await h.get(), 502, "hls_playback_unavailable");
  assert.equal(reason, "manifest_too_large");
});

test("malformed external manifest URI returns 502 instead of exposing origin", async t => {
  const h = await harness(t);
  h.upstream.respond = async () => new Response("#EXTM3U\nhttps://evil.invalid/segment.ts");
  await error(await h.get(), 502, "hls_playback_unavailable");
});

test("authorized key requests return fixed key bytes without an upstream fetch", async t => {
  const h = await harness(t);
  const response = await h.get(["key"]);
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, 16);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.ok(!h.calls.some(([name]) => name === "fetch" || name === "origin"));
});

test("HLS route returns configured server errors before token and upstream work", async t => {
  const h = await harness(t);
  h.state.config = () => ({ ok: false, response: new Response("synthetic unavailable", { status: 503 }) });
  const response = await h.get();
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "synthetic unavailable");
  assert.deepEqual(h.calls, []);
});

test("inactive accounts and denied resources stop playback before upstream access", async t => {
  const h = await harness(t);
  h.state.active = () => false;
  await error(await h.get(), 423, "account_inactive");
  assert.ok(!h.calls.some(([name]) => name === "origin" || name === "fetch"));

  const allowed = await harness(t);
  allowed.state.guard = async () => ({ ok: false, response: Response.json({ error: "resource_forbidden" }, { status: 403, headers: { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" } }) });
  await error(await allowed.get(), 403, "resource_forbidden");
  assert.ok(!allowed.calls.some(([name]) => name === "origin" || name === "fetch"));
});

test("rate-limited playback records only the first denial and returns retry metadata", async t => {
  const h = await harness(t);
  h.state.budget = async () => ({ allowed: false, retryAfterSeconds: 17, denialsLastMinute: 1 });
  const response = await h.get(["720p", "seg.ts"], h.request({ "user-agent": "synthetic-agent" }));
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "HLS playback rate limited", code: "HLS_PLAYBACK_RATE_LIMITED", retryAfter: 17 });
  assert.equal(response.headers.get("retry-after"), "17");
  const insert = h.calls.find(([name]) => name === "insert");
  assert.equal(insert?.[1]?.reason, "HLS playback traffic was throttled.");
  assert.equal(insert?.[1]?.evidence?.path, "720p/seg.ts");

  const repeated = await harness(t);
  repeated.state.budget = async () => ({ allowed: false, retryAfterSeconds: 9, denialsLastMinute: 2 });
  const repeatedResponse = await repeated.get(["seg.ts"]);
  assert.equal(repeatedResponse.status, 429);
  assert.deepEqual(await repeatedResponse.json(), { error: "HLS playback rate limited", code: "HLS_PLAYBACK_RATE_LIMITED", retryAfter: 9 });
  assert.ok(!repeated.calls.some(([name]) => name === "insert"));
});

test("non-HLS resources are rejected after access authorization", async t => {
  const h = await harness(t);
  h.state.guard = async () => ({ ok: true, resource: { resource_type: "storage_pdf", provider_metadata: {} } });
  await error(await h.get(), 404, "hls_resource_not_found");
  assert.ok(!h.calls.some(([name]) => name === "origin" || name === "fetch"));
});

for (const uri of ["https://evil.invalid/a.ts", "//evil.invalid/a.ts", "data:text/plain,a", "javascript:alert(1)", "../../escape.ts", "a\\b.ts", "folder/\u0001.ts"]) {
  test(`manifest URI classification rejects ${JSON.stringify(uri)}`, () => {
    assert.throws(() => rewriteHlsManifest(`#EXTM3U\n${uri}`, RESOURCE, "720p/index.m3u8", "synthetic-token"));
  });
}

test("manifest URI percent text stays encoded as a literal filename, never an unescaped traversal", () => {
  for (const uri of ["%2e%2e/segment.ts", "%zz.ts", "%2fexternal.ts"]) {
    const text = rewriteHlsManifest(`#EXTM3U\n${uri}?origin=x#fragment`, RESOURCE, "index.m3u8", "synthetic+token");
    assert.ok(text.includes(encodeURIComponent(uri.split("/")[0])));
    assert.ok(text.endsWith("?t=synthetic%2Btoken"));
    assert.ok(!text.includes("origin=x"));
  }
});

test("an upstream non-HLS document must not be returned as a successful rewritten manifest", async t => {
  const h = await harness(t);
  h.upstream.respond = async () => new Response("<html>upstream maintenance</html>", { headers: { "content-type": "text/html" } });
  assert.equal((await h.get()).status, 502);
});

test("HLS upstream fetch must have a cancellation/deadline signal", async t => {
  const h = await harness(t);
  await h.get();
  const init = h.calls.find(([name]) => name === "fetch")[2];
  assert.ok(init.signal instanceof AbortSignal, "Without a signal, a stalled upstream is unbounded by this route");
});
