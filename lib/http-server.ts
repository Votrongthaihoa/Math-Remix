const DEFAULT_MAX_JSON_BYTES = 5 * 1024 * 1024;

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
