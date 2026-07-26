import { createClient } from "@supabase/supabase-js";
import { verifyContentToken } from "../../../lib/content-token";
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tokenSecret = process.env.VIDEO_TOKEN_SECRET || serviceKey;
  if (!url || !serviceKey || !tokenSecret) return Response.json({ error: "Chưa cấu hình máy chủ nội dung." }, { status: 503 });

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const body = await request.json() as { videoToken?: string };
  if (!body.videoToken) return Response.json({ error: "Thiếu token nội dung." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const security = await ensureActiveAccount(request, admin);
  if (!security.ok) return security.response;
  const auth = { user: security.user };
  const payload = await verifyContentToken(body.videoToken, tokenSecret);
  if (!payload || payload.sub !== auth.user.id) return Response.json({ error: "Quyền xem nội dung không hợp lệ hoặc đã hết hạn." }, { status: 403 });

  const { data: resource } = await admin.from("lesson_resources").select("id,resource_type,resource_url").eq("id", payload.rid).single();
  if (!resource || resource.resource_type === "youtube") return Response.json({ error: "Không tìm thấy tài liệu PDF." }, { status: 404 });

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
