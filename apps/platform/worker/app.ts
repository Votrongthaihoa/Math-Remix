import type { ApiResult } from "@aeck/contracts";
import { Hono, type Context } from "hono";

type PlatformBindings = Pick<Env, "DATA_MODE" | "LEGACY_API_ORIGIN">;

type HealthData = {
  service: "aeck-platform";
  status: "ready";
  version: "0.1.0";
};

const app = new Hono<{ Bindings: PlatformBindings }>();
const previewDataCompiled =
  typeof __AECK_PREVIEW_DATA__ === "undefined" || __AECK_PREVIEW_DATA__;

app.use("/api/*", async (context, next) => {
  const requestId = context.req.header("x-request-id") ?? crypto.randomUUID();
  context.header("x-request-id", requestId);
  context.header("cache-control", "no-store");
  context.header("x-content-type-options", "nosniff");
  context.header("x-frame-options", "DENY");
  context.header("referrer-policy", "same-origin");
  await next();
});

async function loadPreviewData() {
  if (!previewDataCompiled) return null;
  return import("./reference-data.ts");
}

function configuredLegacyOrigin(context: Context<{ Bindings: PlatformBindings }>) {
  const rawOrigin = String(context.env.LEGACY_API_ORIGIN ?? "").trim();
  if (!rawOrigin) return null;
  try {
    const origin = new URL(rawOrigin);
    return origin.protocol === "https:" || origin.hostname === "127.0.0.1"
      ? origin
      : null;
  } catch {
    return null;
  }
}

async function proxyDashboard(
  context: Context<{ Bindings: PlatformBindings }>,
  audience: "student" | "admin",
) {
  const origin = configuredLegacyOrigin(context);
  if (context.env.DATA_MODE !== "upstream" || !origin) return null;
  const target = new URL("/api/platform/dashboard", origin);
  target.searchParams.set("audience", audience);
  const headers = new Headers({
    accept: "application/json",
    "x-request-id": context.res.headers.get("x-request-id") ?? crypto.randomUUID(),
  });
  const authorization = context.req.header("authorization");
  if (authorization) headers.set("authorization", authorization);

  try {
    const upstream = await fetch(target, {
      headers,
      redirect: "error",
      signal: context.req.raw.signal,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "dashboard_upstream_failed",
      audience,
      requestId: headers.get("x-request-id"),
      message: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

app.get("/api/health", (context) => {
  const result = {
    ok: true,
    data: {
      service: "aeck-platform",
      status: "ready",
      version: "0.1.0",
    },
  } satisfies ApiResult<HealthData>;

  return context.json(result);
});

app.get("/api/dashboard/student", async (context) => {
  const upstream = await proxyDashboard(context, "student");
  if (upstream) return upstream;
  if (context.env.DATA_MODE !== "preview") {
    return context.json(
      {
        ok: false,
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Nguồn dữ liệu dashboard chưa được cấu hình.",
          recoverable: true,
        },
      } satisfies ApiResult<never>,
      503,
    );
  }

  const previewData = await loadPreviewData();
  if (!previewData) {
    return context.json(
      {
        ok: false,
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Dữ liệu xem trước không có trong bản build này.",
          recoverable: false,
        },
      } satisfies ApiResult<never>,
      503,
    );
  }

  return context.json({
    ok: true,
    data: previewData.studentDashboardReference,
  } satisfies ApiResult<typeof previewData.studentDashboardReference>);
});

app.get("/api/dashboard/admin", async (context) => {
  const upstream = await proxyDashboard(context, "admin");
  if (upstream) return upstream;
  if (context.env.DATA_MODE !== "preview") {
    return context.json(
      {
        ok: false,
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Nguồn dữ liệu quản trị chưa được cấu hình.",
          recoverable: true,
        },
      } satisfies ApiResult<never>,
      503,
    );
  }

  const previewData = await loadPreviewData();
  if (!previewData) {
    return context.json(
      {
        ok: false,
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Dữ liệu xem trước không có trong bản build này.",
          recoverable: false,
        },
      } satisfies ApiResult<never>,
      503,
    );
  }

  return context.json({
    ok: true,
    data: previewData.adminDashboardReference,
  } satisfies ApiResult<typeof previewData.adminDashboardReference>);
});

app.notFound((context) =>
  context.json(
    {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Không tìm thấy API được yêu cầu.",
        recoverable: false,
      },
    } satisfies ApiResult<never>,
    404,
  ),
);

app.onError((error, context) => {
  console.error(JSON.stringify({
    event: "unhandled_api_error",
    requestId: context.res.headers.get("x-request-id"),
    message: error.message,
  }));
  return context.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Máy chủ gặp sự cố ngoài dự kiến.",
        recoverable: true,
      },
    } satisfies ApiResult<never>,
    500,
  );
});

export default app;
