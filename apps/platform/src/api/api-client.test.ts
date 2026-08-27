import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { ApiClientError, parseApiResponse } from "./api-client.ts";

test("API client parses typed successes and maps typed failures without throwing raw JSON", async () => {
  const success = await parseApiResponse(
    new Response(JSON.stringify({ ok: true, data: { count: 3 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    z.object({ count: z.number().int() }),
  );
  assert.deepEqual(success, { count: 3 });

  await assert.rejects(
    () =>
      parseApiResponse(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "UPSTREAM_UNAVAILABLE",
              message: "Nguồn dữ liệu chưa sẵn sàng.",
              recoverable: true,
            },
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
        z.object({ count: z.number().int() }),
      ),
    (error) =>
      error instanceof ApiClientError &&
      error.code === "UPSTREAM_UNAVAILABLE" &&
      error.status === 503,
  );
});
