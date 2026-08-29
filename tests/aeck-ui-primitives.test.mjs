import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("AECK foundation exports a reusable geometry-preserving skeleton", async () => {
  const components = await readFile(new URL("../app/aeck-ui.tsx", import.meta.url), "utf8");

  assert.match(components, /export function AeckSkeleton/);
});

test("AECK foundation is opt-in and uses the restrained REMIX accent", async () => {
  const css = await readFile(new URL("../app/aeck-ui.css", import.meta.url), "utf8");

  assert.match(css, /\.product-shell\.ui-optimized-surface/);
  assert.match(css, /--aeck-primary: #b5122b/);
  assert.match(css, /> \.sidebar/);
  assert.match(css, /> \.topbar/);
  assert.doesNotMatch(css, /product-shell:not\(\.protected-exam-surface\)/);
  assert.doesNotMatch(css, /\.exam-|\.question-|\.answer-|\.result-|\.review-|\.solution-|\.admin-exam-/);
});

test("AECK fields connect help and errors to their native control", async () => {
  const components = await readFile(new URL("../app/aeck-ui.tsx", import.meta.url), "utf8");

  assert.match(components, /const describedBy = \[children\.props\["aria-describedby"\], help \? helpId/);
  assert.match(components, /"aria-describedby": describedBy/);
  assert.match(components, /"aria-invalid": error \? "true"/);
  assert.match(components, /id=\{errorId\} role="status" aria-live="polite"/);
  assert.match(components, /<dialog[^>]*aria-modal="true"/);
});

test("authentication polish is opt-in and cannot style exam content", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth-ui-v2.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /className="login-page ui-auth-surface auth-public-refresh"/);
  assert.match(platform, /className="login-page admin-login-page ui-auth-surface auth-public-refresh"/);
  assert.match(css, /\.login-page\.ui-auth-surface/);
  assert.doesNotMatch(css, /\.(?:exam|question|answer|result|review|solution|admin-exam)[\w-]*/i);
  assert.doesNotMatch(css, /(^|\n)\s*(?:button|input|textarea|select|svg|body|h1)\s*[{,]/m);
});
