import assert from "node:assert/strict";
import test from "node:test";

import { getIntegrationStatus } from "./integration-api.ts";

test("integration client parses the normalized operations readiness payload", async () => {
  const result = await getIntegrationStatus(async (input, init) => {
    assert.equal(input, "/api/platform/v1/integrations/status");
    assert.equal(init?.method, undefined);
    return new Response(JSON.stringify({
      ok: true,
      data: {
        generatedAt: "2026-08-28T09:00:00.000Z",
        source: "reference-fixture",
        providers: [{
          provider: "zoom",
          label: "Zoom",
          state: "ready",
          message: "Kết nối bản xem trước sẵn sàng.",
        }],
      },
    }));
  });

  assert.equal(result.providers[0]?.provider, "zoom");
});
