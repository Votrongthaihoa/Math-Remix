import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { ApiClientError, parseApiResponse, requestApi } from "./api-client.ts";
import { authStore } from "../store/auth-store.ts";

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

test("API requests announce AECK crypto v3 and preserve bearer authentication", async () => {
  authStore.getState().login("test-access-token", {
    id: "student-1",
    username: "Minh Anh",
    email: "minhanh@example.vn",
    role: "student",
    permissions: [],
  });
  const result = await requestApi("/api/health", z.object({ ready: z.boolean() }), {
    fetcher: async (_input, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer test-access-token");
      assert.equal(headers.get("version"), "3.0");
      assert.equal(headers.get("x-crypto-version"), "3");
      return new Response(JSON.stringify({ ok: true, data: { ready: true } }));
    },
  });
  authStore.getState().logout();
  assert.deepEqual(result, { ready: true });
});
