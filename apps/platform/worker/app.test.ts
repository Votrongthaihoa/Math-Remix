import assert from "node:assert/strict";
import test from "node:test";

import app from "./app.ts";
import {
  AdminDashboardSchema,
  StudentDashboardSchema,
  createApiResultSchema,
} from "@aeck/contracts";

test("GET /api/health returns the typed platform readiness payload", async () => {
  const response = await app.request("http://aeck.local/api/health");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: {
      service: "aeck-platform",
      status: "ready",
      version: "0.1.0",
    },
  });
});

test("API responses include request correlation and defensive headers", async () => {
  const response = await app.request("http://aeck.local/api/health", {
    headers: { "x-request-id": "qa-request-001" },
  });

  assert.equal(response.headers.get("x-request-id"), "qa-request-001");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});

test("explicit preview mode returns admin metrics conforming to the shared contract", async () => {
  const response = await app.request(
    "http://127.0.0.1/api/dashboard/admin",
    undefined,
    { DATA_MODE: "preview", LEGACY_API_ORIGIN: "" },
  );
  const result = createApiResultSchema(AdminDashboardSchema).parse(
    await response.json(),
  );

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.metrics.totalUsers, 12_840);
});

test("explicit preview mode returns student data conforming to the shared contract", async () => {
  const response = await app.request(
    "http://127.0.0.1/api/dashboard/student",
    undefined,
    { DATA_MODE: "preview", LEGACY_API_ORIGIN: "" },
  );
  const result = createApiResultSchema(StudentDashboardSchema).parse(
    await response.json(),
  );

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.profile.fullName, "Nguyễn Minh Anh");
    assert.equal(result.data.source, "reference-fixture");
  }
});
