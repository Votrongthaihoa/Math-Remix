import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("watermark trace route is admin-only, bounded, and does not guess image attribution", async () => {
  const route = await readFile(new URL("../app/api/admin/watermark-trace/route.ts", import.meta.url), "utf8");
  assert.match(route, /ensureAdminPermission\(request, "system-admin"\)/);
  assert.match(route, /readMultipartFormData\(request, MAX_TRACE_FILE_BYTES \+ MULTIPART_OVERHEAD_BYTES\)/);
  assert.match(route, /MAX_TRACE_FILE_BYTES/);
  assert.match(route, /parseWatermarkTrace/);
  assert.match(route, /PDFDocument\.load/);
  assert.match(route, /status: 422/);
  assert.doesNotMatch(route, /ocr|tesseract/i);
});

test("PDF download embeds a signed metadata marker when trace configuration is available", async () => {
  const route = await readFile(new URL("../app/api/lesson-pdf-download/route.ts", import.meta.url), "utf8");
  assert.match(route, /createWatermarkTraceMarker/);
  assert.match(route, /hashedRequestIp/);
  assert.match(route, /pdf\.setSubject\(traceMarker\)/);
  assert.match(route, /pdf\.setKeywords\(\["AECK", traceMarker\]\)/);
  assert.match(route, /resourceId: payload\.rid/);
});
