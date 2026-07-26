import { createClient } from "@supabase/supabase-js";
import { verifyContentToken } from "../../../lib/content-token";
import { guardResourceAccess } from "../../../lib/resource-access-server";
import { ensureActiveAccount } from "../../../lib/security-server";

function youtubeSource(url: string) {
  try {
    const parsed = new URL(url);
    const id = parsed.hostname.includes("youtu.be") ? parsed.pathname.slice(1) : parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop() || "";
    const start = Number(parsed.searchParams.get("t") || parsed.searchParams.get("start") || 0) || 0;
    return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? { id, start: Math.max(0, start) } : null;
  } catch {
    return null;
  }
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
  if (!payload || payload.sub !== auth.user.id) return Response.json({ error: "Token nội dung không hợp lệ hoặc đã hết hạn." }, { status: 403 });

  const access = await guardResourceAccess(admin, security.user.id, security.profile, payload.rid, "view");
  if (!access.ok) return access.response;
  const resource = access.resource;

  let responseBody: Record<string, string | number>;
  if (resource.resource_type === "youtube") {
    const source = youtubeSource(resource.resource_url);
    if (!source) return Response.json({ error: "Liên kết YouTube không hợp lệ." }, { status: 422 });
    responseBody = { type: resource.resource_type, title: resource.title, youtubeId: source.id, start: source.start };
  } else {
    responseBody = { type: resource.resource_type, title: resource.title, protectedContent: "pdf" };
  }

  return Response.json(responseBody, {
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "referrer-policy": "same-origin",
      "x-content-type-options": "nosniff",
    },
  });
}
