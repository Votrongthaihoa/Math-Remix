import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const marker = "UI optimized neutral/crimson surface";
const files = [
  "admin-sessions.css",
  "admin-session-wizard.css",
  "admin-upload.css",
  "admin-hls-vault.css",
];

test("opt-in admin flows use a neutral/crimson visual layer without gradient or glass", async () => {
  for (const file of files) {
    const css = await readFile(new URL(`../app/${file}`, import.meta.url), "utf8");
    const optimized = css.split(marker)[1] ?? "";
    assert.ok(optimized, `${file} needs an optimized visual block`);
    assert.match(optimized, /\.ui-shell\.admin-app\.product-shell\.ui-optimized-surface/);
    assert.match(optimized, /#b5122b/i);
    assert.doesNotMatch(optimized, /(?:linear|radial|conic)-gradient/i);
    assert.doesNotMatch(optimized, /backdrop-filter:(?!\s*none)/i);
    assert.doesNotMatch(optimized, /#(?:007aff|1c668f|1d4ed8|1d66c2|2874bd|67a8c2|6ca7bf|7656b8|9fc4d3|ded7f0|e7f3f8|e8e1f5|eef6ff|eff7fb|f3efff|f4f9ff|f5fbfd|f6fbfd|f7fbfd|fdfbff)\b/i);
  }
});

test("optimized upload and encoder surfaces explicitly remove legacy effects", async () => {
  const [sessions, upload, hls] = await Promise.all([
    readFile(new URL("../app/admin-sessions.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-upload.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-hls-vault.css", import.meta.url), "utf8"),
  ]);
  const sessionsOptimized = sessions.split(marker)[1] ?? "";
  const uploadOptimized = upload.split(marker)[1] ?? "";
  const hlsOptimized = hls.split(marker)[1] ?? "";

  assert.match(sessionsOptimized, /\.admin-session-list[\s\S]*?backdrop-filter:\s*none/);
  assert.match(uploadOptimized, /\.admin-upload-refresh[\s\S]*?backdrop-filter:\s*none/);
  assert.match(uploadOptimized, /:where\(\.admin-upload-upload-card,\s*\.admin-upload-library\)[\s\S]*?backdrop-filter:\s*none/);
  assert.match(uploadOptimized, /\.admin-upload-skeleton-card\s*>\s*span[\s\S]*?admin-upload-neutral-pulse/);
  assert.match(hlsOptimized, /\.admin-hls-vault-progress-track\s+span[\s\S]*?background:\s*#b5122b/);
});

test("optimized narrow layouts preserve readable actions and honor reduced motion", async () => {
  const [sessions, wizard, upload, hls] = await Promise.all(files.map(file =>
    readFile(new URL(`../app/${file}`, import.meta.url), "utf8")
  ));

  const sessionsOptimized = sessions.split(marker)[1] ?? "";
  const wizardOptimized = wizard.split(marker)[1] ?? "";
  const uploadOptimized = upload.split(marker)[1] ?? "";
  const hlsOptimized = hls.split(marker)[1] ?? "";

  assert.match(sessionsOptimized, /\.admin-session-list\s+\.admin-session-action[\s\S]*?background:\s*#fff[\s\S]*?color:\s*var\(--session-accent\)/);
  assert.match(wizardOptimized, /\.admin-session-wizard-back[\s\S]*?min-height:\s*40px/);
  assert.match(uploadOptimized, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.admin-upload-dropzone[\s\S]*?grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)/);
  assert.match(uploadOptimized, /\.admin-upload-search\s+input[\s\S]*?min-height:\s*24px/);

  for (const [file, optimized] of [["admin-session-wizard.css", wizardOptimized], ["admin-upload.css", uploadOptimized], ["admin-hls-vault.css", hlsOptimized]]) {
    assert.match(optimized, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, `${file} needs a reduced-motion override`);
  }
});
