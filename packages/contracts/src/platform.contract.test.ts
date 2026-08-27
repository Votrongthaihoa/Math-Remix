import assert from "node:assert/strict";
import test from "node:test";

import {
  IntegrationStatusListSchema,
  PlatformCollectionSchema,
  ShipmentTrackingRequestSchema,
  OcrResultSchema,
} from "./platform.ts";

test("platform collection contract validates normalized records and summary counts", () => {
  const parsed = PlatformCollectionSchema.parse({
    generatedAt: "2026-08-28T09:00:00.000Z",
    source: "reference-fixture",
    resource: "courses",
    summary: [
      { label: "Tổng khóa học", value: 3, tone: "primary" },
      { label: "Đã xuất bản", value: 2, tone: "success" },
    ],
    records: [
      {
        id: "course-tsa-2026",
        title: "Luyện thi TSA 2026",
        description: "Khóa luyện thi theo cấu trúc mới.",
        status: "active",
        category: "TSA",
        updatedAt: "2026-08-28T08:30:00.000Z",
        owner: "Ban học thuật",
        tags: ["TSA", "2026"],
        metrics: [{ label: "Bài học", value: 24 }],
        metadata: { published: true },
      },
    ],
  });

  assert.equal(parsed.records[0]?.title, "Luyện thi TSA 2026");
  assert.equal(parsed.summary[1]?.value, 2);
  assert.equal(
    PlatformCollectionSchema.safeParse({ ...parsed, summary: [{ label: "Sai", value: -1 }] }).success,
    false,
  );
});

test("operations integrations expose typed readiness without leaking credentials", () => {
  const status = IntegrationStatusListSchema.parse({
    generatedAt: "2026-08-28T09:00:00.000Z",
    source: "reference-fixture",
    providers: [
      {
        provider: "zoom",
        label: "Zoom",
        state: "ready",
        message: "Kết nối bản xem trước sẵn sàng.",
      },
      {
        provider: "manual-tracking",
        label: "Theo dõi thủ công",
        state: "fallback",
        message: "Nhập mã vận đơn để lưu trạng thái thủ công.",
      },
    ],
  });
  const tracking = ShipmentTrackingRequestSchema.parse({
    carrier: "GHN",
    trackingCode: " G8AECK001 ",
  });

  assert.equal(status.providers[0]?.state, "ready");
  assert.deepEqual(tracking, { carrier: "ghn", trackingCode: "G8AECK001" });
  assert.equal(OcrResultSchema.parse({
    engine: "gemini",
    text: "x² + 2x + 1 = 0",
    latex: "x^2 + 2x + 1 = 0",
    confidence: 0.98,
    source: "reference-fixture",
  }).engine, "gemini");
});
