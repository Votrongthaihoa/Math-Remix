import assert from "node:assert/strict";
import test from "node:test";
import { registerTestLoader } from "./support/test-loader.mjs";

const workerUrl = new URL("../worker/index.ts", import.meta.url).href;
const state = { handler: null, image: null };
globalThis.__syntheticWorkerEntry = state;
const stubs = {
  "vinext/server/app-router-entry": "export default {fetch: (...args) => globalThis.__syntheticWorkerEntry.handler(...args)}",
  "vinext/server/image-optimization": "export const DEFAULT_DEVICE_SIZES=[640];export const DEFAULT_IMAGE_SIZES=[32];export const handleImageOptimization=(...args)=>globalThis.__syntheticWorkerEntry.image(...args);",
};
await registerTestLoader(Object.entries(stubs).map(([specifier, source]) => ({
  parentURL: workerUrl,
  specifier,
  url: `data:text/javascript,${encodeURIComponent(source)}`,
})));
const { default: worker } = await import(workerUrl);
test.after(() => { delete globalThis.__syntheticWorkerEntry; });

function assertSecurity(response) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
}

for (const [path, method, isolated] of [
  ["/admin/hls-vault?isolated=1", "GET", true],
  ["/admin/hls-vault?isolated=0", "GET", false],
  ["/admin/hls-vault", "GET", false],
  ["/admin/hls-vault/?isolated=1", "GET", false],
  ["/other?isolated=1", "GET", false],
  ["/admin/hls-vault?isolated=1", "OPTIONS", false],
  ["/admin/hls-vault?isolated=1", "POST", false],
  ["/admin/hls-vault?isolated=1", "HEAD", false],
]) {
  test(`Worker isolation boundary ${method} ${path}`, async () => {
    const request = new Request(`https://app.example.invalid${path}`, { method });
    const env = {};
    const ctx = {};
    let calls = 0;
    const source = new Response(method === "HEAD" ? null : "synthetic page", { status: 200, headers: { "x-upstream": "preserved" } });
    state.handler = async (...args) => { calls++; assert.deepEqual(args, [request, env, ctx]); return source; };
    const response = await worker.fetch(request, env, ctx);
    assert.equal(calls, 1);
    assertSecurity(response);
    assert.equal(response.headers.get("cross-origin-embedder-policy"), isolated ? "require-corp" : null);
    assert.equal(response.headers.get("cross-origin-opener-policy"), isolated ? "same-origin" : null);
    assert.equal(response.headers.get("x-upstream"), "preserved");
    assert.equal(source.headers.has("x-content-type-options"), false, "Do not mutate the app response");
    assert.equal(await response.text(), method === "HEAD" ? "" : "synthetic page");
  });
}

for (const status of [404, 500, 503]) {
  test(`unknown/upstream ${status} retains status/body and gains security headers`, async () => {
    state.handler = async () => new Response("synthetic error", { status });
    const response = await worker.fetch(new Request("https://app.example.invalid/unknown"), {}, {});
    assert.equal(response.status, status);
    assert.equal(await response.text(), "synthetic error");
    assertSecurity(response);
  });
}

test("image endpoint delegates the actual asset and image binding adapters and secures the result", async () => {
  const calls = [];
  const env = {
    ASSETS: { async fetch(request) { calls.push(["asset", request.url]); return new Response("asset"); } },
    IMAGES: { input(body) { calls.push(["input", body]); return { transform(options) { calls.push(["transform", options]); return { async output(options) { calls.push(["output", options]); return { response: () => new Response("optimized") }; } }; } }; } },
  };
  state.handler = () => assert.fail("Image requests must not reach the app router");
  state.image = async (_request, adapters, widths) => {
    assert.deepEqual(widths, [640, 32]);
    assert.equal(await (await adapters.fetchAsset("/synthetic.png")).text(), "asset");
    return adapters.transformImage("synthetic stream", { width: 640, format: "image/webp", quality: 75 });
  };
  const response = await worker.fetch(new Request("https://app.example.invalid/_vinext/image"), env, {});
  assert.equal(await response.text(), "optimized");
  assertSecurity(response);
  assert.deepEqual(calls, [["asset", "https://app.example.invalid/synthetic.png"], ["input", "synthetic stream"], ["transform", { width: 640 }], ["output", { format: "image/webp", quality: 75 }]]);
});
