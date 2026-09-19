import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  aggregateHealthStatus,
  SERVER_HEALTH_CHECK_TIMEOUT_MS,
  timedCheck,
} from "../lib/admin-server-health.ts";

test("health checks have a bounded default timeout and abort the underlying query", async () => {
  let aborted = false;
  const started = Date.now();
  const result = await timedCheck("slow", "Slow check", signal => new Promise((_, reject) => {
    signal.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("The operation was aborted.", "AbortError"));
    }, { once: true });
  }), 25);

  assert.equal(SERVER_HEALTH_CHECK_TIMEOUT_MS, 5_000);
  assert.equal(result.status, "degraded");
  assert.equal(result.detail, "Kiểm tra quá thời gian cho phép.");
  assert.equal(aborted, true);
  assert.ok(Date.now() - started < 1_000);
});

test("successful and failed checks preserve truthful status and detail", async () => {
  const healthy = await timedCheck("ok", "OK", async () => ({ ok: true, detail: "Đã kiểm tra." }), 100);
  const degraded = await timedCheck("bad", "Bad", async () => ({ ok: false, detail: "Bảng phản hồi lỗi." }), 100);

  assert.equal(healthy.status, "healthy");
  assert.equal(healthy.detail, "Đã kiểm tra.");
  assert.equal(degraded.status, "degraded");
  assert.equal(degraded.detail, "Bảng phản hồi lỗi.");
});

test("synchronous check failures do not leak cancellation rejections", async () => {
  const result = await timedCheck("sync-failure", "Sync failure", () => {
    throw new Error("synthetic failure");
  }, 100);

  assert.equal(result.status, "degraded");
  assert.equal(result.detail, "Không thể hoàn tất kiểm tra lúc này.");
});

test("aggregate health is degraded when any check or integration is unavailable", () => {
  assert.equal(aggregateHealthStatus(
    [{ status: "healthy" }, { status: "healthy" }],
    [{ configured: true }, { configured: true }],
  ), "healthy");
  assert.equal(aggregateHealthStatus(
    [{ status: "healthy" }],
    [{ configured: true }, { configured: false }],
  ), "degraded");
  assert.equal(aggregateHealthStatus(
    [{ status: "not_configured" }],
    [{ configured: true }],
  ), "degraded");
  assert.equal(aggregateHealthStatus([], [{ configured: true }]), "degraded");
  assert.equal(aggregateHealthStatus([{ status: "healthy" }], []), "degraded");
});

test("request cancellation is linked to the underlying check", async () => {
  const parent = new AbortController();
  let aborted = false;
  const pending = timedCheck("cancelled", "Cancelled", signal => new Promise((_, reject) => {
    signal.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("The operation was aborted.", "AbortError"));
    }, { once: true });
  }), 1_000, parent.signal);
  await Promise.resolve();
  parent.abort();
  const result = await pending;

  assert.equal(aborted, true);
  assert.equal(result.status, "degraded");
  assert.equal(result.detail, "Không thể hoàn tất kiểm tra lúc này.");

  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  let invoked = false;
  const skipped = await timedCheck("already-cancelled", "Already cancelled", async () => {
    invoked = true;
    return { ok: true, detail: "Không nên chạy." };
  }, 100, alreadyAborted.signal);
  assert.equal(invoked, false);
  assert.equal(skipped.status, "degraded");
});

test("server-health route passes abort signals and includes integration state in aggregate status", async () => {
  const [source, panel, styles, smoke] = await Promise.all([
    readFile(new URL("../app/api/admin/server-health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-capability-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-capability-center.css", import.meta.url), "utf8"),
    readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(source, /\.abortSignal\(signal\)/);
  assert.match(source, /aggregateHealthStatus\(checks, integrations\)/);
  assert.match(source, /microsoftGraphConfigurationReady\(\)/);
  assert.match(source, /request\.signal/);
  assert.match(source, /timedCheck\("profiles"[^\n]*signal/);
  assert.match(source, /timedCheck\("courses"[^\n]*signal/);
  assert.match(source, /timedCheck\("exam_rooms"[^\n]*signal/);
  assert.match(panel, /aggregateHealthStatusText\(health\?\.status\)/);
  assert.match(panel, /admin-health-actions/);
  assert.match(panel, /healthAbortControllerRef\.current\?\.abort\(\)/);
  assert.match(panel, /signal: controller\.signal/);
  assert.match(styles, /\.admin-health-check-icon\.status-healthy\s*\{\s*background:\s*#fef2f2;\s*color:\s*#a91427;/);
  assert.match(styles, /\.admin-health-integration > span:first-child\.is-configured\s*\{\s*background:\s*#cd1627;/);
  assert.match(smoke, /app_metadata: mockRole === "admin"/);
  assert.match(smoke, /is_super_admin: true/);
  assert.match(smoke, /account_status: "active"/);
  assert.match(smoke, /\/api\/admin\/server-health/);
});
