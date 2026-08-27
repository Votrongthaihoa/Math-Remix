import assert from "node:assert/strict";
import test from "node:test";

import app from "./app.ts";
import {
  AdminDashboardSchema,
  StudentDashboardSchema,
  createApiResultSchema,
  PlatformCollectionSchema,
  IntegrationStatusListSchema,
  ZoomMeetingResultSchema,
  VietQrLookupResultSchema,
  ShipmentTrackingResultSchema,
  OcrResultSchema,
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

test("preview collections expose the normalized student course catalog", async () => {
  const response = await app.request(
    "http://127.0.0.1/api/platform/v1/collections/courses",
    undefined,
    { DATA_MODE: "preview", LEGACY_API_ORIGIN: "" },
  );
  const result = createApiResultSchema(PlatformCollectionSchema).parse(await response.json());

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.resource, "courses");
    assert.ok(result.data.records.some((record) => record.title.includes("TSA")));
  }
});

test("exam document saves reject stale revisions with EDIT_CONFLICT", async () => {
  const response = await app.request(
    "http://127.0.0.1/api/platform/v1/exam-documents/exam-demo-tsa",
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "if-match-revision": "0",
        "if-match-content-hash": "stale-content-hash",
      },
      body: JSON.stringify({
        examId: "exam-demo-tsa",
        revision: 0,
        contentHash: "0123456789abcdef",
        title: "Bản ghi cũ",
        authoritativeHtml: "<p>Cũ</p>",
        normalizedSections: [],
        lexicalJson: null,
      }),
    },
    { DATA_MODE: "preview", LEGACY_API_ORIGIN: "" },
  );
  const body = await response.json() as { ok: boolean; error?: { code?: string } };

  assert.equal(response.status, 409);
  assert.equal(body.error?.code, "EDIT_CONFLICT");
});

test("preview exam builder creates an isolated canonical document", async () => {
  const response = await app.request(
    "http://127.0.0.1/api/platform/v1/exam-documents",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Đề mới từ ngân hàng", template: "from-bank" }),
    },
    { DATA_MODE: "preview", LEGACY_API_ORIGIN: "" },
  );
  const body = await response.json() as { ok: boolean; data?: { examId?: string; revision?: number } };

  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  assert.equal(body.data?.revision, 0);
  assert.ok(body.data?.examId);
});

test("preview signup requires the explicit preview Turnstile token", async () => {
  const response = await app.request(
    "http://127.0.0.1/api/platform/v1/signup",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "student@example.vn", password: "Password123!", fullName: "Học viên mới", turnstileToken: "invalid" }),
    },
    { DATA_MODE: "preview", LEGACY_API_ORIGIN: "", PUBLIC_SIGNUP_ENABLED: "true", TURNSTILE_HOSTNAMES: "127.0.0.1", TURNSTILE_SECRET: "", SUPABASE_URL: "", SUPABASE_PUBLISHABLE_KEY: "" },
  );

  assert.equal(response.status, 403);
});

test("preview signup normalizes the contract and requires email verification", async () => {
  const response = await app.request(
    "http://127.0.0.1/api/platform/v1/signup",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "  STUDENT@example.vn ",
        password: "Password123!",
        fullName: "  Học viên mới  ",
        turnstileToken: "preview-turnstile-token",
      }),
    },
    { DATA_MODE: "preview", LEGACY_API_ORIGIN: "", PUBLIC_SIGNUP_ENABLED: "true" },
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: { email: "student@example.vn", verificationRequired: true },
  });
});

test("operations integrations reject requests without a bearer session", async () => {
  const response = await app.request(
    "http://127.0.0.1/api/platform/v1/integrations/status",
    undefined,
    {
      DATA_MODE: "preview",
      LEGACY_API_ORIGIN: "",
      OPERATIONS_INTEGRATIONS_ENABLED: "true",
    },
  );

  assert.equal(response.status, 401);
});

test("preview operations report the provider and manual fallback readiness", async () => {
  const response = await app.request(
    "http://127.0.0.1/api/platform/v1/integrations/status",
    { headers: { authorization: "Bearer preview-admin-token" } },
    {
      DATA_MODE: "preview",
      LEGACY_API_ORIGIN: "",
      OPERATIONS_INTEGRATIONS_ENABLED: "true",
    },
  );
  const body = await response.json() as { ok: boolean; data?: unknown };
  const status = IntegrationStatusListSchema.parse(body.data);

  assert.equal(response.status, 200);
  assert.equal(status.providers.find((item) => item.provider === "zoom")?.state, "ready");
  assert.equal(status.providers.find((item) => item.provider === "manual-tracking")?.state, "fallback");
});

test("preview Zoom operation creates a typed meeting without calling a provider", async () => {
  const startsAt = "2026-09-02T12:30:00.000Z";
  const response = await app.request(
    "http://127.0.0.1/api/platform/v1/integrations/zoom/meetings",
    {
      method: "POST",
      headers: {
        authorization: "Bearer preview-admin-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        classId: "ilearn-tsa-a",
        title: "Luyện tư duy định lượng",
        startsAt,
        durationMinutes: 90,
      }),
    },
    {
      DATA_MODE: "preview",
      LEGACY_API_ORIGIN: "",
      OPERATIONS_INTEGRATIONS_ENABLED: "true",
    },
  );
  const body = await response.json() as { data?: unknown };
  const meeting = ZoomMeetingResultSchema.parse(body.data);

  assert.equal(response.status, 201);
  assert.equal(meeting.startsAt, startsAt);
  assert.equal(meeting.source, "reference-fixture");
});

test("preview VietQR lookup normalizes bank details without exposing a secret", async () => {
  const response = await app.request(
    "http://127.0.0.1/api/platform/v1/integrations/vietqr/lookup",
    {
      method: "POST",
      headers: {
        authorization: "Bearer preview-admin-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ bankId: "vtb", accountNumber: "123456789" }),
    },
    {
      DATA_MODE: "preview",
      LEGACY_API_ORIGIN: "",
      OPERATIONS_INTEGRATIONS_ENABLED: "true",
    },
  );
  const body = await response.json() as { data?: unknown };
  const lookup = VietQrLookupResultSchema.parse(body.data);

  assert.equal(response.status, 200);
  assert.equal(lookup.bankId, "VTB");
  assert.equal(lookup.accountName, "NGUYEN MINH ANH");
});

test("shipment tracking keeps a manual fallback when no live provider is available", async () => {
  const response = await app.request(
    "http://127.0.0.1/api/platform/v1/integrations/shipments/track",
    {
      method: "POST",
      headers: {
        authorization: "Bearer preview-admin-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ carrier: "GHTK", trackingCode: "S1AECK144" }),
    },
    {
      DATA_MODE: "preview",
      LEGACY_API_ORIGIN: "",
      OPERATIONS_INTEGRATIONS_ENABLED: "true",
    },
  );
  const body = await response.json() as { data?: unknown };
  const tracking = ShipmentTrackingResultSchema.parse(body.data);

  assert.equal(response.status, 200);
  assert.equal(tracking.source, "manual");
  assert.equal(tracking.carrier, "ghtk");
  assert.equal(tracking.trackingUrl, null);
});

test("preview Gemini OCR accepts a bounded image upload and returns typed math", async () => {
  const form = new FormData();
  form.set("file", new File(["preview-image"], "equation.png", { type: "image/png" }));
  const response = await app.request(
    "http://127.0.0.1/api/platform/v1/integrations/gemini-ocr/equation",
    {
      method: "POST",
      headers: { authorization: "Bearer preview-admin-token" },
      body: form,
    },
    {
      DATA_MODE: "preview",
      LEGACY_API_ORIGIN: "",
      OPERATIONS_INTEGRATIONS_ENABLED: "true",
    },
  );
  const body = await response.json() as { data?: unknown };
  const ocr = OcrResultSchema.parse(body.data);

  assert.equal(response.status, 200);
  assert.equal(ocr.engine, "gemini");
  assert.ok(ocr.latex.includes("x^2"));
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
