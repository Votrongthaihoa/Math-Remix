import {
  PlatformResourceSchema,
  ExamDocumentSaveSchema,
  SignupRequestSchema,
  ZoomMeetingRequestSchema,
  VietQrLookupRequestSchema,
  ShipmentTrackingRequestSchema,
  type ApiResult,
  type CourseDetail,
  type PlatformCollection,
  type TimetableEntry,
  type ExamDocument,
  type SignupResult,
  type IntegrationStatusList,
  type ZoomMeetingResult,
  type VietQrLookupResult,
  type ShipmentTrackingResult,
  type OcrResult,
} from "@aeck/contracts";
import { Hono, type Context } from "hono";
import { verifyTurnstile } from "./turnstile.ts";

type PlatformBindings = {
  DATA_MODE: string;
  LEGACY_API_ORIGIN: string;
  PUBLIC_SIGNUP_ENABLED?: string;
  TURNSTILE_HOSTNAMES?: string;
  TURNSTILE_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  OPERATIONS_INTEGRATIONS_ENABLED?: string;
};

type HealthData = {
  service: "aeck-platform";
  status: "ready";
  version: "0.1.0";
};

const app = new Hono<{ Bindings: PlatformBindings }>();
const previewExamDocuments = new Map<string, ExamDocument>();
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

app.use("/api/platform/v1/integrations/*", async (context, next) => {
  if (!context.req.header("authorization")?.startsWith("Bearer ")) {
    return context.json(
      {
        ok: false,
        error: {
          code: "AUTH_REQUIRED",
          message: "Vui lòng đăng nhập để dùng tích hợp vận hành.",
          recoverable: false,
        },
      } satisfies ApiResult<never>,
      401,
    );
  }
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

async function proxyPlatformApi(
  context: Context<{ Bindings: PlatformBindings }>,
  pathname: string,
  override?: { body: BodyInit },
) {
  const origin = configuredLegacyOrigin(context);
  if (context.env.DATA_MODE !== "upstream" || !origin) return null;
  const incoming = new URL(context.req.url);
  const target = new URL(pathname, origin);
  target.search = incoming.search;
  const headers = new Headers({
    accept: context.req.header("accept") ?? "application/json",
    "x-request-id": context.res.headers.get("x-request-id") ?? crypto.randomUUID(),
    version: "3.0",
    "x-crypto-version": "3",
  });
  const incomingContentType = context.req.header("content-type");
  if (incomingContentType && !(override?.body instanceof FormData)) {
    headers.set("content-type", incomingContentType);
  }
  const authorization = context.req.header("authorization");
  if (authorization) headers.set("authorization", authorization);

  try {
    const upstream = await fetch(target, {
      method: context.req.method,
      headers,
      body: context.req.method === "GET" || context.req.method === "HEAD"
        ? undefined
        : override?.body ?? context.req.raw.body,
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
      event: "platform_upstream_failed",
      pathname,
      requestId: headers.get("x-request-id"),
      message: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

function unavailable(context: Context<{ Bindings: PlatformBindings }>) {
  return context.json(
    {
      ok: false,
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Nguồn dữ liệu của module chưa sẵn sàng.",
        recoverable: true,
      },
    } satisfies ApiResult<never>,
    503,
  );
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

app.post("/api/platform/v1/signup", async (context) => {
  if (context.env.PUBLIC_SIGNUP_ENABLED !== "true") {
    return context.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Đăng ký công khai đang tạm đóng.", recoverable: false } } satisfies ApiResult<never>,
      403,
    );
  }
  const request = SignupRequestSchema.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!request.success) {
    return context.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Thông tin đăng ký không hợp lệ.",
          recoverable: false,
        },
      } satisfies ApiResult<never>,
      400,
    );
  }
  const { email, password, fullName, turnstileToken } = request.data;
  if (context.env.DATA_MODE === "preview") {
    if (turnstileToken !== "preview-turnstile-token") {
      return context.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Xác minh chống spam không hợp lệ.", recoverable: true } } satisfies ApiResult<never>,
        403,
      );
    }
    return context.json({ ok: true, data: { email, verificationRequired: true } } satisfies ApiResult<SignupResult>, 201);
  }
  const allowedHostnames = new Set(String(context.env.TURNSTILE_HOSTNAMES ?? "").split(",").map((hostname) => hostname.trim()).filter(Boolean));
  const verification = await verifyTurnstile({
    token: turnstileToken,
    remoteIp: context.req.header("cf-connecting-ip") ?? context.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
    secret: String(context.env.TURNSTILE_SECRET ?? ""),
    expectedAction: "signup",
    allowedHostnames,
  });
  if (!verification.ok) {
    return context.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Không thể xác minh yêu cầu đăng ký.", recoverable: verification.reason === "network" } } satisfies ApiResult<never>,
      403,
    );
  }
  const supabaseUrl = String(context.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const publishableKey = String(context.env.SUPABASE_PUBLISHABLE_KEY ?? "");
  if (!supabaseUrl || !publishableKey) return unavailable(context);
  const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password, data: { full_name: fullName } }),
  });
  const payload = await response.json().catch(() => null) as { user?: { email?: string }; msg?: string; message?: string } | null;
  if (!response.ok) {
    return context.json(
      { ok: false, error: { code: response.status === 429 ? "RATE_LIMITED" : "INVALID_REQUEST", message: payload?.msg || payload?.message || "Không thể tạo tài khoản.", recoverable: response.status >= 500 } } satisfies ApiResult<never>,
      response.status === 429 ? 429 : 400,
    );
  }
  return context.json({ ok: true, data: { email: payload?.user?.email ?? email, verificationRequired: true } } satisfies ApiResult<SignupResult>, 201);
});

app.get("/api/platform/v1/integrations/status", async (context) => {
  const enabled = context.env.OPERATIONS_INTEGRATIONS_ENABLED === "true";
  if (enabled) {
    const upstream = await proxyPlatformApi(
      context,
      "/api/platform/v1/integrations/status",
    );
    if (upstream) return upstream;
  }
  const preview = context.env.DATA_MODE === "preview" && previewDataCompiled;
  const providerState = !enabled
    ? "disabled"
    : preview
      ? "ready"
      : "unavailable";
  const providerMessage = !enabled
    ? "Tích hợp đang tắt bằng feature flag."
    : preview
      ? "Kết nối bản xem trước sẵn sàng."
      : "Adapter backend chưa được cấu hình.";
  const status: IntegrationStatusList = {
    generatedAt: new Date().toISOString(),
    source: preview ? "reference-fixture" : "backend",
    providers: [
      { provider: "zoom", label: "Zoom", state: providerState, message: providerMessage },
      { provider: "gemini-ocr", label: "Gemini OCR", state: providerState, message: providerMessage },
      { provider: "vietqr", label: "VietQR", state: providerState, message: providerMessage },
      { provider: "ghn", label: "GHN", state: providerState, message: providerMessage },
      {
        provider: "manual-tracking",
        label: "Theo dõi thủ công",
        state: "fallback",
        message: "Có thể lưu trạng thái thủ công khi hãng vận chuyển không phản hồi.",
      },
    ],
  };

  return context.json({ ok: true, data: status } satisfies ApiResult<IntegrationStatusList>);
});

app.post("/api/platform/v1/integrations/zoom/meetings", async (context) => {
  if (context.env.OPERATIONS_INTEGRATIONS_ENABLED !== "true") {
    return context.json(
      {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Tích hợp Zoom đang tắt.",
          recoverable: false,
        },
      } satisfies ApiResult<never>,
      403,
    );
  }
  const request = ZoomMeetingRequestSchema.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!request.success) {
    return context.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Thông tin buổi học không hợp lệ.",
          recoverable: false,
        },
      } satisfies ApiResult<never>,
      400,
    );
  }
  if (context.env.DATA_MODE !== "preview" || !previewDataCompiled) {
    const upstream = await proxyPlatformApi(
      context,
      "/api/platform/v1/integrations/zoom/meetings",
      { body: JSON.stringify(request.data) },
    );
    if (upstream) return upstream;
    return unavailable(context);
  }
  const meetingId = `preview-${crypto.randomUUID()}`;
  const result: ZoomMeetingResult = {
    meetingId,
    joinUrl: `https://preview.aeck.invalid/zoom/${encodeURIComponent(meetingId)}`,
    startsAt: request.data.startsAt,
    source: "reference-fixture",
  };
  return context.json({ ok: true, data: result } satisfies ApiResult<ZoomMeetingResult>, 201);
});

app.post("/api/platform/v1/integrations/vietqr/lookup", async (context) => {
  if (context.env.OPERATIONS_INTEGRATIONS_ENABLED !== "true") {
    return context.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Tích hợp VietQR đang tắt.", recoverable: false } } satisfies ApiResult<never>,
      403,
    );
  }
  const request = VietQrLookupRequestSchema.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!request.success) {
    return context.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "Thông tin tài khoản ngân hàng không hợp lệ.", recoverable: false } } satisfies ApiResult<never>,
      400,
    );
  }
  if (context.env.DATA_MODE !== "preview" || !previewDataCompiled) {
    const upstream = await proxyPlatformApi(
      context,
      "/api/platform/v1/integrations/vietqr/lookup",
      { body: JSON.stringify(request.data) },
    );
    if (upstream) return upstream;
    return unavailable(context);
  }
  const result: VietQrLookupResult = {
    ...request.data,
    accountName: "NGUYEN MINH ANH",
    source: "reference-fixture",
  };
  return context.json({ ok: true, data: result } satisfies ApiResult<VietQrLookupResult>);
});

app.post("/api/platform/v1/integrations/shipments/track", async (context) => {
  if (context.env.OPERATIONS_INTEGRATIONS_ENABLED !== "true") {
    return context.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Theo dõi vận đơn đang tắt.", recoverable: false } } satisfies ApiResult<never>,
      403,
    );
  }
  const request = ShipmentTrackingRequestSchema.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!request.success) {
    return context.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "Mã vận đơn không hợp lệ.", recoverable: false } } satisfies ApiResult<never>,
      400,
    );
  }
  const result: ShipmentTrackingResult = {
    ...request.data,
    state: "unknown",
    message: "Chưa có phản hồi trực tiếp từ hãng vận chuyển. Hãy cập nhật trạng thái thủ công.",
    trackingUrl: null,
    source: "manual",
  };
  if (context.env.DATA_MODE !== "preview") {
    const upstream = await proxyPlatformApi(
      context,
      "/api/platform/v1/integrations/shipments/track",
      { body: JSON.stringify(request.data) },
    );
    if (upstream) return upstream;
  }
  return context.json({ ok: true, data: result } satisfies ApiResult<ShipmentTrackingResult>);
});

app.post("/api/platform/v1/integrations/gemini-ocr/equation", async (context) => {
  if (context.env.OPERATIONS_INTEGRATIONS_ENABLED !== "true") {
    return context.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Tích hợp Gemini OCR đang tắt.", recoverable: false } } satisfies ApiResult<never>,
      403,
    );
  }
  const form = await context.req.parseBody().catch(() => null);
  const file = form?.file;
  const acceptedTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
  if (!(file instanceof File) || !acceptedTypes.has(file.type) || file.size <= 0 || file.size > 8 * 1024 * 1024) {
    return context.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "Chọn ảnh PNG, JPEG, WebP hoặc PDF không quá 8 MB.", recoverable: false } } satisfies ApiResult<never>,
      400,
    );
  }
  if (context.env.DATA_MODE !== "preview" || !previewDataCompiled) {
    const upstreamForm = new FormData();
    upstreamForm.set("file", file);
    const upstream = await proxyPlatformApi(
      context,
      "/api/platform/v1/integrations/gemini-ocr/equation",
      { body: upstreamForm },
    );
    if (upstream) return upstream;
    return unavailable(context);
  }
  const result: OcrResult = {
    engine: "gemini",
    text: "x² + 2x + 1 = 0",
    latex: "x^2 + 2x + 1 = 0",
    confidence: 0.98,
    source: "reference-fixture",
  };
  return context.json({ ok: true, data: result } satisfies ApiResult<OcrResult>);
});

app.get("/api/platform/v1/collections/:resource", async (context) => {
  const resource = PlatformResourceSchema.safeParse(context.req.param("resource"));
  if (!resource.success) {
    return context.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Module dữ liệu không tồn tại.",
          recoverable: false,
        },
      } satisfies ApiResult<never>,
      404,
    );
  }
  const upstream = await proxyPlatformApi(
    context,
    `/api/platform/v1/collections/${encodeURIComponent(resource.data)}`,
  );
  if (upstream) return upstream;
  if (context.env.DATA_MODE !== "preview") return unavailable(context);
  const previewData = await import("./reference-platform-data.ts");
  return context.json({
    ok: true,
    data: previewData.platformCollections[resource.data],
  } satisfies ApiResult<PlatformCollection>);
});

app.get("/api/platform/v1/courses/:courseId", async (context) => {
  const courseId = context.req.param("courseId");
  const upstream = await proxyPlatformApi(
    context,
    `/api/platform/v1/courses/${encodeURIComponent(courseId)}`,
  );
  if (upstream) return upstream;
  if (context.env.DATA_MODE !== "preview") return unavailable(context);
  const previewData = await import("./reference-platform-data.ts");
  const course = previewData.courseDetails[courseId];
  if (!course) {
    return context.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Không tìm thấy khóa học.", recoverable: false } } satisfies ApiResult<never>,
      404,
    );
  }
  return context.json({ ok: true, data: course } satisfies ApiResult<CourseDetail>);
});

app.get("/api/platform/v1/timetable", async (context) => {
  const upstream = await proxyPlatformApi(context, "/api/platform/v1/timetable");
  if (upstream) return upstream;
  if (context.env.DATA_MODE !== "preview") return unavailable(context);
  const previewData = await import("./reference-platform-data.ts");
  return context.json({ ok: true, data: previewData.timetableEntries } satisfies ApiResult<TimetableEntry[]>);
});

async function previewExamDocument(examId: string) {
  const cached = previewExamDocuments.get(examId);
  if (cached) return cached;
  const previewData = await import("./reference-platform-data.ts");
  const fixture = previewData.examDocuments[examId];
  if (!fixture) return null;
  const copy = structuredClone(fixture);
  previewExamDocuments.set(examId, copy);
  return copy;
}

async function contentHash(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

app.post("/api/platform/v1/exam-documents", async (context) => {
  const upstream = await proxyPlatformApi(context, "/api/platform/v1/exam-documents");
  if (upstream) return upstream;
  if (context.env.DATA_MODE !== "preview") return unavailable(context);
  const body = await context.req.json().catch(() => null) as { title?: unknown; template?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 160) : "";
  const template = body?.template === "from-bank" || body?.template === "random" ? body.template : "blank";
  if (!title) {
    return context.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "Vui lòng nhập tên đề thi.", recoverable: false } } satisfies ApiResult<never>,
      400,
    );
  }
  const examId = crypto.randomUUID();
  const normalizedSections = template === "random"
    ? [
        { id: crypto.randomUUID(), title: "Phần 1", html: "<p>Cấu hình số lượng câu hỏi ngẫu nhiên.</p>", latexSource: "" },
        { id: crypto.randomUUID(), title: "Phần 2", html: "<p>Cấu hình chủ đề và mức độ.</p>", latexSource: "" },
      ]
    : [{ id: crypto.randomUUID(), title: template === "from-bank" ? "Câu hỏi từ ngân hàng" : "Phần thi 1", html: "<p>Bắt đầu soạn nội dung tại đây.</p>", latexSource: "" }];
  const authoritativeHtml = template === "from-bank"
    ? "<h2>Đề tạo từ ngân hàng câu hỏi</h2><p>Nội dung chuẩn hóa sẽ được liên kết theo phiên bản câu hỏi.</p>"
    : template === "random"
      ? "<h2>Đề thi ngẫu nhiên</h2><p>Cấu hình ma trận trước khi xuất bản.</p>"
      : "<h2>Hướng dẫn chung</h2><p>Nhập hướng dẫn cho thí sinh.</p>";
  const hash = await contentHash({ examId, title, authoritativeHtml, normalizedSections });
  const document: ExamDocument = {
    examId,
    revision: 0,
    contentHash: hash,
    title,
    authoritativeHtml,
    normalizedSections,
    lexicalJson: null,
    updatedAt: new Date().toISOString(),
  };
  previewExamDocuments.set(examId, document);
  return context.json({ ok: true, data: document } satisfies ApiResult<ExamDocument>, 201);
});

app.get("/api/platform/v1/exam-documents/:examId", async (context) => {
  const examId = context.req.param("examId").trim();
  const upstream = await proxyPlatformApi(
    context,
    `/api/platform/v1/exam-documents/${encodeURIComponent(examId)}`,
  );
  if (upstream) return upstream;
  if (context.env.DATA_MODE !== "preview") return unavailable(context);
  const document = await previewExamDocument(examId);
  if (!document) {
    return context.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Không tìm thấy tài liệu đề thi.", recoverable: false } } satisfies ApiResult<never>,
      404,
    );
  }
  return context.json({ ok: true, data: document } satisfies ApiResult<ExamDocument>);
});

app.put("/api/platform/v1/exam-documents/:examId", async (context) => {
  const examId = context.req.param("examId").trim();
  const upstream = await proxyPlatformApi(
    context,
    `/api/platform/v1/exam-documents/${encodeURIComponent(examId)}`,
  );
  if (upstream) return upstream;
  if (context.env.DATA_MODE !== "preview") return unavailable(context);
  const parsed = ExamDocumentSaveSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success || parsed.data.examId !== examId) {
    return context.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "Tài liệu đề thi không hợp lệ.", recoverable: false, details: { issues: parsed.success ? [] : parsed.error.issues } } } satisfies ApiResult<never>,
      400,
    );
  }
  const current = await previewExamDocument(examId);
  if (!current) {
    return context.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Không tìm thấy tài liệu đề thi.", recoverable: false } } satisfies ApiResult<never>,
      404,
    );
  }
  const expectedRevision = Number(context.req.header("if-match-revision"));
  const expectedHash = context.req.header("if-match-content-hash") ?? "";
  if (expectedRevision !== current.revision || expectedHash !== current.contentHash) {
    return context.json(
      { ok: false, error: { code: "EDIT_CONFLICT", message: "Tài liệu đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.", recoverable: true, details: { currentRevision: current.revision, currentContentHash: current.contentHash } } } satisfies ApiResult<never>,
      409,
    );
  }
  const saved: ExamDocument = {
    ...parsed.data,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  previewExamDocuments.set(examId, saved);
  return context.json({ ok: true, data: saved } satisfies ApiResult<ExamDocument>);
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
