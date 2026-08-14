import { contentServer } from "../../../lib/content-server";
import { verifyContentToken } from "../../../lib/content-token";
import { guardResourceAccess } from "../../../lib/resource-access-server";
import { jsonBodyError, readJsonBody } from "../../../lib/http-server";
import { ensureActiveAccount } from "../../../lib/security-server";
import { loadPdfBytes } from "../../../lib/r2-server";

const MAX_PDF_BYTES = 50 * 1024 * 1024;

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

export async function POST(request: Request) {
  const config = contentServer();
  if (!config.ok) return config.response;
  const { admin, tokenSecret } = config;

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const parsedBody = await readJsonBody<{ videoToken?: string }>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400 });
  const body = parsedBody.body;
  if (!body.videoToken) return Response.json({ error: "Thiếu token nội dung." }, { status: 400 });

  const security = await ensureActiveAccount(request, admin);
  if (!security.ok) return security.response;
  const auth = { user: security.user };
  const payload = await verifyContentToken(body.videoToken, tokenSecret);
  if (!payload || payload.sub !== auth.user.id) return Response.json({ error: "Quyền xem nội dung không hợp lệ hoặc đã hết hạn." }, { status: 403 });

  const access = await guardResourceAccess(admin, security.user.id, security.profile, payload.rid, "view");
  if (!access.ok) return access.response;
  const resource = access.resource;
  if (resource.resource_type === "youtube" || resource.resource_type === "onedrive_video") return Response.json({ error: "Không tìm thấy tài liệu PDF." }, { status: 404 });

  let pdfBytes: Uint8Array;
  try { pdfBytes = await loadPdfBytes(resource.resource_url, MAX_PDF_BYTES); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể tải nội dung PDF." }, { status: 502 }); }
  if (new TextDecoder().decode(pdfBytes.slice(0, 5)) !== "%PDF-") return Response.json({ error: "Nội dung tải về không phải PDF hợp lệ." }, { status: 422 });

  return Response.json({
    encoding: "base64",
    mimeType: "application/pdf",
    data: arrayBufferToBase64(pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer),
  }, {
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "cross-origin-resource-policy": "same-origin",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET() {
  return Response.json({ error: "Nội dung PDF không thể mở trực tiếp." }, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
}

export async function HEAD() {
  return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
}
