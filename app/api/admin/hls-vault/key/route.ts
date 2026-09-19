import { hlsMediaKeyFromEnvironment } from "../../../../../lib/hls-key";
import { hlsVideoId } from "../../../../../lib/hls-vault";
import { jsonBodyError, readJsonBody } from "../../../../../lib/http-server";
import { consumeRequestBudget } from "../../../../../lib/rate-limit-server";
import { ensureAdminPermission } from "../../../../../lib/admin-authorization-server";
import { hashedRequestIp } from "../../../../../lib/security-server";

const noStore = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

export async function POST(request: Request) {
  const security = await ensureAdminPermission(request, "courses");
  if (!security.ok) return security.response;
  try {
    const budget = await consumeRequestBudget(security.admin, "admin-hls-vault-key", `${security.user.id}:${await hashedRequestIp(request)}`, { capacity: 10, refillSeconds: 60 });
    if (!budget.allowed) return Response.json({ error: "Bạn yêu cầu khóa HLS quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...noStore, "retry-after": String(budget.retryAfterSeconds) } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStore });
  }
  const parsed = await readJsonBody<{ videoId?: string }>(request);
  if (!parsed.ok) return Response.json(jsonBodyError(parsed.error), { status: parsed.error === "payload_too_large" ? 413 : 400, headers: noStore });
  const videoId = parsed.body.videoId?.trim() || "";
  if (!hlsVideoId(videoId)) return Response.json({ error: "Mã video HLS không hợp lệ." }, { status: 400, headers: noStore });
  try {
    const key = await hlsMediaKeyFromEnvironment(videoId);
    return new Response(key, { status: 200, headers: { ...noStore, "content-type": "application/octet-stream", "content-length": String(key.byteLength) } });
  } catch (error) {
    console.error("[hls-key] key derivation failed", { error: error instanceof Error ? error.message : "unknown_error" });
    return Response.json({ error: "HLS master key chưa được cấu hình trên máy chủ.", code: "HLS_KEY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStore });
  }
}
