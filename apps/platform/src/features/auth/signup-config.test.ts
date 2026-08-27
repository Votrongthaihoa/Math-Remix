import assert from "node:assert/strict";
import test from "node:test";

import { resolveSignupConfig } from "./signup-config.ts";

test("signup stays hidden unless its public feature flag is explicitly enabled", () => {
  assert.deepEqual(
    resolveSignupConfig({
      enabled: "false",
      previewCompiled: true,
      siteKey: "preview",
    }),
    { enabled: false, mode: "disabled", siteKey: null },
  );
});

test("compiled preview signup uses the deterministic local verification flow", () => {
  assert.deepEqual(
    resolveSignupConfig({ enabled: "true", previewCompiled: true }),
    { enabled: true, mode: "preview", siteKey: null },
  );
});

test("production signup exposes Turnstile only when a public site key exists", () => {
  assert.deepEqual(
    resolveSignupConfig({
      enabled: "true",
      previewCompiled: false,
      siteKey: "  0x4AAAA-site-key  ",
    }),
    { enabled: true, mode: "turnstile", siteKey: "0x4AAAA-site-key" },
  );
  assert.deepEqual(
    resolveSignupConfig({ enabled: "true", previewCompiled: false }),
    { enabled: true, mode: "unavailable", siteKey: null },
  );
});
