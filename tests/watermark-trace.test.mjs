import assert from "node:assert/strict";
import test from "node:test";
import { createWatermarkTraceMarker, parseWatermarkTrace } from "../lib/watermark-trace.ts";

test("watermark trace markers round-trip signed metadata without exposing an email", async () => {
  const marker = await createWatermarkTraceMarker({
    userId: "user-123",
    resourceId: "resource-456",
    issuedAt: "2026-09-15T10:20:30.000Z",
    ipHash: "hash-789",
  }, "test-secret");

  assert.match(marker, /^AECK-WM1:[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(marker, /@/);
  const bytes = new TextEncoder().encode(`%PDF-1.7\n/Subject (${marker})\n%%EOF`);
  const result = await parseWatermarkTrace(bytes, "test-secret");
  assert.equal(result.status, "matched");
  if (result.status !== "matched") return;
  assert.deepEqual(result.claims, {
    userId: "user-123",
    resourceId: "resource-456",
    issuedAt: "2026-09-15T10:20:30.000Z",
    ipHash: "hash-789",
  });
});

test("watermark trace never attributes a tampered marker and reports visible-only evidence separately", async () => {
  const marker = await createWatermarkTraceMarker({
    userId: "user-123",
    resourceId: "resource-456",
    issuedAt: "2026-09-15T10:20:30.000Z",
    ipHash: "hash-789",
  }, "test-secret");
  const tampered = `${marker.slice(0, -1)}${marker.endsWith("A") ? "B" : "A"}`;
  const result = await parseWatermarkTrace(new TextEncoder().encode(`${tampered} owner@example.com`), "test-secret");
  assert.equal(result.status, "unmatched");
  if (result.status !== "unmatched") return;
  assert.equal(result.reason, "invalid_marker");
  assert.deepEqual(result.visibleEmails, ["owner@example.com"]);
});
