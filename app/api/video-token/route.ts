import { createClient } from "@supabase/supabase-js";
import { verifyContentToken } from "../../../lib/content-token";

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
  const { data: auth } = await admin.auth.getUser(accessToken);
  if (!auth.user) return Response.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
  const { data: profile } = await admin.from("profiles").select("status").eq("id", auth.user.id).single();
  if (profile?.status !== "active") return Response.json({ error: "Tài khoản không hoạt động." }, { status: 403 });
  const payload = await verifyContentToken(body.videoToken, tokenSecret);
  if (!payload || payload.sub !== auth.user.id) return Response.json({ error: "Token nội dung không hợp lệ hoặc đã hết hạn." }, { status: 403 });

  const { data: resource, error } = await admin.from("lesson_resources").select("id,title,resource_type,resource_url").eq("id", payload.rid).single();
  if (error || !resource) return Response.json({ error: "Không tìm thấy nội dung." }, { status: 404 });
  return Response.json({ url: resource.resource_url, type: resource.resource_type, title: resource.title });
}
