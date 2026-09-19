const DEFAULT_MAX_JSON_BYTES = 5 * 1024 * 1024;

/** Extra room for multipart boundaries and small form fields around a file. */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export type JsonBodyResult<T> =
  | { ok: true; body: T }
  | { ok: false; error: "invalid_json" | "payload_too_large" };

/** Read one JSON request body and distinguish malformed input from valid data. */
export async function readJsonBody<T = unknown>(request: Request, maxBytes = DEFAULT_MAX_JSON_BYTES): Promise<JsonBodyResult<T>> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return { ok: false, error: "payload_too_large" };
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return { ok: false, error: "payload_too_large" };
  if (!raw.trim()) return { ok: false, error: "invalid_json" };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "invalid_json" };
    return { ok: true, body: parsed as T };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}

export function jsonBodyError(error: "invalid_json" | "payload_too_large") {
  return error === "payload_too_large"
    ? { error: "Dữ liệu gửi lên quá lớn." }
    : { error: "Nội dung JSON không hợp lệ." };
}

export type MultipartBodyResult =
  | { ok: true; form: FormData }
  | { ok: false; error: "invalid_multipart" | "payload_too_large" };

/**
 * Parse multipart data without allowing the request stream to grow beyond a
 * route's explicit body budget. The caller should keep its post-parse file
 * size check because multipart overhead is intentionally included in this
 * limit and a form may contain more than one part.
 */
export async function readMultipartFormData(request: Request, maxBytes: number): Promise<MultipartBodyResult> {
  if (!Number.isFinite(maxBytes) || maxBytes < 1) return { ok: false, error: "payload_too_large" };
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return { ok: false, error: "payload_too_large" };
  if (!request.body) return { ok: false, error: "invalid_multipart" };

  const reader = request.body.getReader();
  let receivedBytes = 0;
  let exceeded = false;
  const boundedBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
          return;
        }
        receivedBytes += chunk.value.byteLength;
        if (receivedBytes > maxBytes) {
          exceeded = true;
          await reader.cancel("multipart body exceeds limit");
          controller.error(new Error("multipart body exceeds limit"));
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });

  try {
    // Do not let an understated client-supplied length make the multipart
    // parser stop before the byte-counting stream sees the real body size.
    const boundedHeaders = new Headers(request.headers);
    boundedHeaders.delete("content-length");
    const boundedRequest = new Request(request, { headers: boundedHeaders, body: boundedBody, duplex: "half" } as RequestInit & { duplex: "half" });
    return { ok: true, form: await boundedRequest.formData() };
  } catch {
    return { ok: false, error: exceeded ? "payload_too_large" : "invalid_multipart" };
  }
}
