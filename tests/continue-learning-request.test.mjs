import assert from "node:assert/strict";
import test from "node:test";
import { loadContinueLearningResult, parseContinueLearningPayload, serializeContinueLearningFallback } from "../lib/continue-learning.ts";

const item = { lessonId: "lesson-1", resourceId: "resource-1", lessonTitle: "Bài học", courseTitle: "Khóa học", updatedAt: "2026-09-10T08:00:00Z" };
const fallback = serializeContinueLearningFallback(item);
const run = (request, overrides = {}) => loadContinueLearningResult({ request, readFallback: () => fallback, signal: new AbortController().signal, ...overrides });

test("API parser accepts explicit empty and valid data and strips extra fields", () => {
  assert.deepEqual(parseContinueLearningPayload({ item: null }), { item: null });
  assert.deepEqual(parseContinueLearningPayload({ item: { ...item, secret: "ignored" } }), { item });
  for (const value of [null, [], {}, { item: 1 }, { item: {} }, { item: { ...item, lessonId: " " } }, { item: { ...item, lessonTitle: {} } }, { item: { ...item, updatedAt: "bad" } }, { item: { ...item, resourceId: null } }]) {
    assert.equal(parseContinueLearningPayload(value), null);
  }
});
test("valid server empty does not resurrect local fallback", async () => {
  assert.deepEqual(await run(async () => Response.json({ item: null })), { status: "ready", item: null });
  assert.deepEqual(await run(async () => Response.json({ item })), { status: "ready", item });
});
test("authorization failures never read the fallback", async () => {
  for (const status of [400, 401, 403, 404, 429]) {
    const result = await run(async () => new Response("", { status }), { readFallback: () => { assert.fail("must not read fallback"); } });
    assert.deepEqual(result, { status: "error", item: null });
  }
});
test("network, malformed payload and 5xx use device fallback", async () => {
  for (const request of [async () => { throw new Error("network"); }, async () => new Response("bad json"), async () => Response.json({ item: {} }), async () => new Response("", { status: 503 })]) {
    assert.equal((await run(request)).status, "fallback");
    assert.equal((await run(request, { readFallback: () => { throw new Error("storage blocked"); } })).status, "error");
  }
});
test("timeout settles even when transport does not support abort", async () => {
  assert.equal((await run(() => new Promise(() => {}), { timeoutMs: 5 })).status, "fallback");
});
test("cancellation does not read fallback, including before request starts", async () => {
  for (const preCancelled of [false, true]) {
    const controller = new AbortController();
    if (preCancelled) controller.abort();
    const pending = run(() => new Promise(() => {}), { signal: controller.signal, readFallback: () => { assert.fail("cancelled read"); } });
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
  }
});

test("API parser rejects missing fields, malformed ids/timestamps, and wrong optional types", () => {
  for (const field of ["lessonId", "updatedAt", "lessonTitle", "courseTitle"]) {
    const copy = { ...item };
    delete copy[field];
    assert.equal(parseContinueLearningPayload({ item: copy }), null, `missing ${field}`);
  }
  for (const [field, values] of [
    ["lessonId", [undefined, null, "", " \t ", 0, false, {}, [], "x".repeat(181)]],
    ["resourceId", [null, "", " \t ", 0, false, {}, [], "x".repeat(181)]],
    ["updatedAt", [null, "", "bad", "2026-99-99T00:00:00Z", 0, {}, []]],
    ["lessonTitle", [undefined, null, 1, {}, []]],
    ["courseTitle", [undefined, null, 1, {}, []]],
    ["resourceTitle", [null, 1, {}, []]],
  ]) {
    for (const value of values) assert.equal(parseContinueLearningPayload({ item: { ...item, [field]: value } }), null, `${field}: ${JSON.stringify(value)}`);
  }
  for (const value of [undefined, false, 3, "invalid", { item: undefined }, { item: [] }]) {
    assert.equal(parseContinueLearningPayload(value), null);
  }
});

test("API parser preserves optional titles, accepts absent resource, and strips sensitive extras", () => {
  const publicItem = { ...item, resourceTitle: "Synthetic resource" };
  assert.deepEqual(parseContinueLearningPayload({ item: { ...publicItem, email: "synthetic@example.invalid", accessToken: "fake", answer_key: "private" }, secret: "unused" }), { item: publicItem });
  const withoutResource = { ...item };
  delete withoutResource.resourceId;
  assert.deepEqual(parseContinueLearningPayload({ item: { ...withoutResource, resourceId: undefined, resourceTitle: undefined } }), { item: withoutResource });
});

test("all 4xx decisions stay errors even when fallback contains a valid item", async () => {
  let reads = 0;
  for (const status of [400, 401, 403, 404, 409, 410, 422, 429, 499]) {
    assert.deepEqual(await run(async () => new Response(null, { status }), { readFallback: () => { reads++; return fallback; } }), { status: "error", item: null });
  }
  assert.equal(reads, 0);
});

test("server success including explicit null never reads stale local storage", async () => {
  let reads = 0;
  for (const serverItem of [null, item]) {
    assert.deepEqual(await run(async () => Response.json({ item: serverItem }), { readFallback: () => { reads++; return fallback; } }), { status: "ready", item: serverItem });
  }
  assert.equal(reads, 0);
});

test("5xx and offline transport produce minimal fallback content", async () => {
  const expected = {
    status: "fallback",
    item: { lessonId: item.lessonId, resourceId: item.resourceId, updatedAt: item.updatedAt, lessonTitle: "Bài học đang học", courseTitle: "Tiếp tục từ thiết bị này" },
  };
  for (const request of [
    async () => new Response(null, { status: 500 }),
    async () => new Response(null, { status: 502 }),
    async () => new Response(null, { status: 503 }),
    async () => new Response(null, { status: 504 }),
    async () => { throw new TypeError("Failed to fetch (synthetic offline)"); },
  ]) {
    let reads = 0;
    assert.deepEqual(await run(request, { readFallback: () => { reads++; return fallback; } }), expected);
    assert.equal(reads, 1);
  }
});

test("offline recovery handles missing, corrupt, stale-version, and blocked storage", async () => {
  const offline = async () => { throw new TypeError("synthetic offline"); };
  for (const stored of [null, "", "broken", "null", "[]", "{}", JSON.stringify({ version: 0, ...item }), JSON.stringify({ version: 1, lessonId: "", updatedAt: item.updatedAt })]) {
    assert.deepEqual(await run(offline, { readFallback: () => stored }), { status: "error", item: null });
  }
  assert.deepEqual(await run(offline, { readFallback: () => { throw new DOMException("Blocked", "SecurityError"); } }), { status: "error", item: null });
});

test("caller retry starts a fresh request and replaces prior fallback with server data", async () => {
  let requests = 0;
  const request = async () => {
    requests++;
    if (requests === 1) throw new TypeError("synthetic offline");
    return Response.json({ item });
  };
  assert.equal((await run(request)).status, "fallback");
  assert.equal(requests, 1, "helper must not silently retry");
  assert.deepEqual(await run(request), { status: "ready", item });
  assert.equal(requests, 2);
});

test("timeout aborts the injected signal and settles when transport ignores it", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let requestSignal;
  const pending = run(signal => { requestSignal = signal; return new Promise(() => {}); }, { timeoutMs: 25 });
  assert.equal(requestSignal.aborted, false);
  t.mock.timers.tick(25);
  assert.equal((await pending).status, "fallback");
  assert.equal(requestSignal.aborted, true);
});

test("timeout also bounds a response whose JSON body never settles", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let bodyRead = false;
  const pending = run(async () => ({ ok: true, json: () => { bodyRead = true; return new Promise(() => {}); } }), { timeoutMs: 25 });
  await Promise.resolve();
  assert.equal(bodyRead, true);
  t.mock.timers.tick(25);
  assert.equal((await pending).status, "fallback");
});

test("pre-aborted requests never invoke transport or storage", async () => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  let reads = 0;
  await assert.rejects(run(async () => { requests++; return Response.json({ item }); }, {
    signal: controller.signal, readFallback: () => { reads++; return fallback; },
  }), { name: "AbortError" });
  assert.equal(requests, 0);
  assert.equal(reads, 0);
});

test("aborted old request cannot settle as ready after a newer request finishes", async () => {
  let finishOld;
  let oldSignal;
  let oldFallbackReads = 0;
  const controller = new AbortController();
  const old = run(signal => {
    oldSignal = signal;
    return new Promise(resolve => { finishOld = resolve; });
  }, { signal: controller.signal, readFallback: () => { oldFallbackReads++; return fallback; } });
  const rejected = assert.rejects(old, { name: "AbortError" });
  controller.abort();
  const newer = { ...item, lessonId: "newer-lesson" };
  assert.deepEqual(await run(async () => Response.json({ item: newer })), { status: "ready", item: newer });
  finishOld(Response.json({ item }));
  await rejected;
  assert.equal(oldSignal.aborted, true);
  assert.equal(oldFallbackReads, 0);
});

test("abort during JSON parsing rejects without resurrecting fallback", async () => {
  const controller = new AbortController();
  let finishBody;
  let reads = 0;
  const pending = run(async () => ({ ok: true, json: () => new Promise(resolve => { finishBody = resolve; }) }), {
    signal: controller.signal, readFallback: () => { reads++; return fallback; },
  });
  await Promise.resolve();
  const rejected = assert.rejects(pending, { name: "AbortError" });
  controller.abort();
  finishBody({ item });
  await rejected;
  assert.equal(reads, 0);
});

test("completed request removes its abort listener and timeout", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = new AbortController();
  const add = t.mock.method(controller.signal, "addEventListener");
  const remove = t.mock.method(controller.signal, "removeEventListener");
  let requestSignal;
  assert.deepEqual(await run(async signal => { requestSignal = signal; return Response.json({ item }); }, { signal: controller.signal, timeoutMs: 25 }), { status: "ready", item });
  assert.equal(add.mock.callCount(), 1);
  assert.equal(remove.mock.callCount(), 1);
  assert.equal(remove.mock.calls[0].arguments[0], "abort");
  assert.equal(remove.mock.calls[0].arguments[1], add.mock.calls[0].arguments[1]);
  t.mock.timers.tick(100);
  controller.abort();
  assert.equal(requestSignal.aborted, false);
});
