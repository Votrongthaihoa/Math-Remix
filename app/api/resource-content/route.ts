import { createClient } from "@supabase/supabase-js";
import { verifyContentToken } from "../../../lib/content-token";

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const item of cookies.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

function isEmbeddedViewerRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    const source = new URL(referer);
    if (source.origin !== requestUrl.origin) return false;
    const fromPdfFrame = source.pathname === "/pdf-viewer.html";
    const fromLessonParent = request.headers.get("x-remix-content-viewer") === "lesson-parent" && source.pathname.startsWith("/lessons/");
    if (!fromPdfFrame && !fromLessonParent) return false;
  } catch {
    return false;
  }
  const destination = request.headers.get("sec-fetch-dest");
  const site = request.headers.get("sec-fetch-site");
  return destination !== "document" && (!site || site === "same-origin");
}

export async function HEAD() {
  return new Response(null, { status: 405, headers: { allow: "GET", "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tokenSecret = process.env.VIDEO_TOKEN_SECRET || serviceKey;
  if (!url || !serviceKey || !tokenSecret) return Response.json({ error: "Chưa cấu hình máy chủ nội dung." }, { status: 503 });
  if (!isEmbeddedViewerRequest(request)) return Response.json({ error: "Nội dung chỉ được phép mở trong trình xem của REMIX." }, { status: 403 });

  const requestUrl = new URL(request.url);
  const contentToken = requestUrl.searchParams.get("token") ?? "";
  const sessionToken = cookieValue(request, "remix_content_session");
  const [contentPayload, sessionPayload] = await Promise.all([
    verifyContentToken(contentToken, tokenSecret),
    verifyContentToken(sessionToken, tokenSecret),
  ]);
  if (!contentPayload || !sessionPayload || sessionPayload.rid !== "__content_session__" || sessionPayload.sub !== contentPayload.sub) {
    return Response.json({ error: "Quyền xem nội dung không hợp lệ hoặc đã hết hạn." }, { status: 403 });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: profile } = await admin.from("profiles").select("status").eq("id", contentPayload.sub).single();
  if (profile?.status !== "active") return Response.json({ error: "Tài khoản không hoạt động." }, { status: 403 });
  const { data: resource } = await admin.from("lesson_resources").select("id,resource_type,resource_url").eq("id", contentPayload.rid).single();
  if (!resource || resource.resource_type === "youtube") return Response.json({ error: "Không tìm thấy tài liệu PDF." }, { status: 404 });

  const upstreamHeaders = new Headers({ accept: "application/pdf", "accept-encoding": "identity" });
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("range", range);
  let upstream = await fetch(resource.resource_url, { headers: upstreamHeaders, redirect: "follow", cache: "no-store" });
  if (upstream.status === 204 || !upstream.body) {
    upstream = await fetch(resource.resource_url, {
      headers: { accept: "application/pdf", "accept-encoding": "identity" },
      redirect: "follow",
      cache: "no-store",
    });
  }
  if (upstream.status === 204 || !upstream.body) return Response.json({ error: "Nguồn PDF trả về nội dung rỗng." }, { status: 502 });
  if (!upstream.ok && upstream.status !== 206) return Response.json({ error: "Không thể tải nội dung PDF." }, { status: 502 });
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!/application\/pdf|application\/octet-stream/i.test(contentType)) return Response.json({ error: "Nguồn nội dung không phải PDF hợp lệ." }, { status: 422 });

  const headers = new Headers({
    "content-type": "application/pdf",
    "cache-control": "private, no-store, max-age=0",
    "content-disposition": "inline",
    "content-security-policy": "default-src 'none'; frame-ancestors 'self'",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
  });
  for (const name of ["accept-ranges", "content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
