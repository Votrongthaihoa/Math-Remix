import { createClient } from "@supabase/supabase-js";
import { verifyContentToken } from "../../../lib/content-token";
import { ensureActiveAccount } from "../../../lib/security-server";

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

  const sourceHeaders = { accept: "application/pdf", "accept-encoding": "identity" };
  let upstream = await fetch(resource.resource_url, { headers: sourceHeaders, redirect: "follow", cache: "no-store" });
  if (upstream.status === 204 || !upstream.body) upstream = await fetch(resource.resource_url, { headers: sourceHeaders, redirect: "follow", cache: "no-store" });
  if (upstream.status === 204 || !upstream.body) return Response.json({ error: "Nguồn PDF trả về nội dung rỗng." }, { status: 502 });
  if (!upstream.ok) return Response.json({ error: "Không thể tải nội dung PDF." }, { status: 502 });
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!/application\/pdf|application\/octet-stream/i.test(contentType)) return Response.json({ error: "Nguồn nội dung không phải PDF hợp lệ." }, { status: 422 });

  const pdfBytes = await upstream.arrayBuffer();
  if (!pdfBytes.byteLength) return Response.json({ error: "Nguồn PDF trả về nội dung rỗng." }, { status: 502 });

  return Response.json({
    encoding: "base64",
    mimeType: "application/pdf",
    data: arrayBufferToBase64(pdfBytes),
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
