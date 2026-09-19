import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EXAM_RISK_BLOCK_THRESHOLD, examRiskBlockPayload } from "../lib/security-server.ts";

test("exam risk gate exposes a stable 403 contract above the threshold", () => {
  assert.equal(EXAM_RISK_BLOCK_THRESHOLD, 100);
  assert.deepEqual(examRiskBlockPayload(123), {
    allowed: false,
    code: "EXAM_RISK_BLOCKED",
    riskScore: 123,
    message: "Phát hiện đăng nhập bất thường. Phiên thi hiện tại đã bị khóa.",
  });
});

test("exam attempt creation invokes the server-side risk gate", async () => {
  const [route, security] = await Promise.all([
    readFile(new URL("../app/api/exams/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/security-server.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /guardExamStartRisk/);
  assert.match(route, /body\.action === "start"/);
  assert.match(security, /EXAM_RISK_BLOCKED/);
  assert.match(security, /status: 403/);
  assert.match(security, /user_sessions.*update/s);
});

test("authenticated browser requests carry only the local device/session identifiers used by the risk backstop", async () => {
  const client = await readFile(new URL("../lib/auth-client.ts", import.meta.url), "utf8");
  assert.match(client, /remix\.security\.device-id\.v1/);
  assert.match(client, /x-remix-device-id/);
  assert.match(client, /remix\.security\.learning-session\.v1/);
  assert.match(client, /x-remix-security-session-id/);
});
