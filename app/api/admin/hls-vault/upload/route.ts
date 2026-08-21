import { jsonBodyError, readJsonBody } from "../../../../../lib/http-server";
import { ensureMicrosoftGraphHlsFolders, MicrosoftGraphError, uploadMicrosoftGraphHlsFile } from "../../../../../lib/microsoft-graph-server";
import { hlsUploadPath, MAX_HLS_UPLOAD_BYTES } from "../../../../../lib/hls-upload";
import { consumeRequestBudget } from "../../../../../lib/rate-limit-server";
import { ensureActiveAccount, hashedRequestIp } from "../../../../../lib/security-server";

const noStore = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const videoIdPattern = /^[A-Za-z0-9_-]{1,80}$/;

async function getAdmin(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return { error: security.response };
  if (security.profile.role !== "admin") return { error: Response.json({ error: "Không có quyền quản trị." }, { status: 403, headers: noStore }) };
  return { admin: security.admin, user: security.user };
}

function graphError(error: unknown) {
  if (error instanceof MicrosoftGraphError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
  console.error("[hls-upload] unexpected Graph error", { error: error instanceof Error ? error.message : "unknown_error" });
  return Response.json({ error: "Không thể làm việc với OneDrive HLS lúc này.", code: "MICROSOFT_HLS_UPLOAD_FAILED" }, { status: 502, headers: noStore });
}

function isFileValue(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value && typeof value.arrayBuffer === "function");
}

export async function POST(request: Request) {
  const authorization = await getAdmin(request);
  if ("error" in authorization) return authorization.error;
  try {
    const budget = await consumeRequestBudget(authorization.admin, "admin-hls-vault-upload", `${authorization.user.id}:${await hashedRequestIp(request)}`, { capacity: 2000, refillSeconds: 30 });
    if (!budget.allowed) return Response.json({ error: "Bạn upload quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...noStore, "retry-after": String(budget.retryAfterSeconds) } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStore });
  }

  const contentType = request.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return Response.json({ error: "Dữ liệu file HLS không hợp lệ." }, { status: 400, headers: noStore });
    const videoId = String(form.get("videoId") || "").trim();
    const relativePath = String(form.get("path") || "").trim();
    const file = form.get("file");
    if (!videoIdPattern.test(videoId) || !isFileValue(file)) return Response.json({ error: "Thiếu mã video hoặc file HLS." }, { status: 400, headers: noStore });
    let path: string;
    try { path = hlsUploadPath(videoId, relativePath); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Đường dẫn HLS không hợp lệ." }, { status: 400, headers: noStore }); }
    if (!file.size || file.size > MAX_HLS_UPLOAD_BYTES) return Response.json({ error: `Mỗi file HLS phải từ 1 byte đến ${Math.round(MAX_HLS_UPLOAD_BYTES / (1024 * 1024))} MB.` }, { status: 413, headers: noStore });
    try {
      const result = await uploadMicrosoftGraphHlsFile(videoId, path, await file.arrayBuffer(), authorization.admin);
      return Response.json(result, { status: 201, headers: noStore });
    } catch (error) { return graphError(error); }
  }

  const parsed = await readJsonBody<{ action?: "prepare"; videoId?: string }>(request);
  if (!parsed.ok) return Response.json(jsonBodyError(parsed.error), { status: parsed.error === "payload_too_large" ? 413 : 400, headers: noStore });
  if (parsed.body.action !== "prepare" || !videoIdPattern.test(parsed.body.videoId?.trim() || "")) return Response.json({ error: "Yêu cầu chuẩn bị HLS không hợp lệ." }, { status: 400, headers: noStore });
  try {
    const result = await ensureMicrosoftGraphHlsFolders(parsed.body.videoId!.trim(), authorization.admin);
    return Response.json(result, { status: 200, headers: noStore });
  } catch (error) { return graphError(error); }
}
