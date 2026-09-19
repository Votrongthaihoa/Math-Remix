import assert from "node:assert/strict";
import test from "node:test";

import { apiRequestUrl } from "../lib/api-url.ts";

function withEnvironment(t, values, callback) {
  const previous = new Map(Object.keys(values).map(key => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (Object.hasOwn(globalThis, "window")) delete globalThis.window;
  });
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return callback();
}

test("non-API inputs remain unchanged and only same-origin API paths are rewritten", async t => withEnvironment(t, { NEXT_PUBLIC_API_URL: "https://api.synthetic.test/v1" }, () => {
  const url = new URL("https://other.synthetic.test/api/data");
  assert.equal(apiRequestUrl("/courses"), "/courses");
  assert.equal(apiRequestUrl("api/courses"), "api/courses");
  assert.equal(apiRequestUrl("/apiary/courses"), "/apiary/courses");
  assert.equal(apiRequestUrl(url), url);
  assert.equal(apiRequestUrl("/api"), "https://api.synthetic.test/api");
  assert.equal(apiRequestUrl("/api/courses?filter=HSA#recent"), "https://api.synthetic.test/api/courses?filter=HSA#recent");
  assert.equal(apiRequestUrl("/api/"), "https://api.synthetic.test/api/");
}));

test("configured API origin accepts HTTP/HTTPS, strips path/query, and rejects unsafe schemes", async t => withEnvironment(t, { NEXT_PUBLIC_API_URL: "https://configured.synthetic.test/base?ignore=1" }, () => {
  assert.equal(apiRequestUrl("/api/health"), "https://configured.synthetic.test/api/health");
  for (const value of ["javascript:alert(1)", "//external.synthetic.test", "not a URL", "ftp://configured.synthetic.test", "data:text/plain,wrong", "https://server.aeck.vn", "https://api.aeck.vn/v2"]) {
    process.env.NEXT_PUBLIC_API_URL = value;
    assert.equal(apiRequestUrl("/api/health"), "/api/health", value);
  }
}));

test("production browser fallback is limited to mathremix web origins", async t => withEnvironment(t, { NEXT_PUBLIC_API_URL: undefined }, () => {
  globalThis.window = { location: { hostname: "mathremix.pro.vn" } };
  assert.equal(apiRequestUrl("/api/session"), "https://api.mathremix.pro.vn/api/session");

  globalThis.window.location.hostname = "www.mathremix.pro.vn";
  assert.equal(apiRequestUrl("/api/session"), "https://api.mathremix.pro.vn/api/session");
  globalThis.window.location.hostname = "alpha.mathremix.pro.vn";
  assert.equal(apiRequestUrl("/api/session"), "https://api.mathremix.pro.vn/api/session");

  globalThis.window.location.hostname = "attacker-mathremix.pro.vn.example";
  assert.equal(apiRequestUrl("/api/session"), "/api/session");
  globalThis.window.location.hostname = "localhost";
  assert.equal(apiRequestUrl("/api/session"), "/api/session");
}));

test("explicit configuration takes precedence over a production browser fallback", async t => withEnvironment(t, { NEXT_PUBLIC_API_URL: "https://configured.synthetic.test" }, () => {
  globalThis.window = { location: { hostname: "mathremix.pro.vn" } };
  assert.equal(apiRequestUrl("/api/lesson"), "https://configured.synthetic.test/api/lesson");
}));
