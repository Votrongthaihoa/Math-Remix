import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: "Chưa cấu hình khóa quản trị." }, { status: 503 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  if (!token) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return Response.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
  const { data: profile } = await admin.from("profiles").select("role,status").eq("id", auth.user.id).single();
  if (profile?.role !== "admin" || profile.status !== "active") return Response.json({ error: "Không có quyền quản trị." }, { status: 403 });

  const users: Array<{ id: string; email: string }> = [];
  const pageSize = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    users.push(...data.users.map(user => ({ id: user.id, email: user.email ?? "" })));
    if (data.users.length < pageSize) break;
  }
  return Response.json({ users }, { headers: { "cache-control": "private, no-store, max-age=0" } });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: "Chưa cấu hình khóa quản trị." }, { status: 503 });

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  if (!token) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return Response.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
  const { data: profile } = await admin.from("profiles").select("role,status").eq("id", auth.user.id).single();
  if (profile?.role !== "admin" || profile.status !== "active") return Response.json({ error: "Không có quyền quản trị." }, { status: 403 });

  const body = await request.json() as { email?: string; password?: string; fullName?: string };
  if (!body.email || !body.password || !body.fullName) return Response.json({ error: "Thiếu thông tin học viên." }, { status: 400 });
  const { data, error } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: body.fullName, must_change_password: true },
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ user: data.user }, { status: 201 });
}

export async function PATCH(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: "Chưa cấu hình khóa quản trị." }, { status: 503 });

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  if (!token) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return Response.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
  const { data: adminProfile } = await admin.from("profiles").select("role,status").eq("id", auth.user.id).single();
  if (adminProfile?.role !== "admin" || adminProfile.status !== "active") return Response.json({ error: "Không có quyền quản trị." }, { status: 403 });

  const body = await request.json() as { userId?: string; password?: string };
  const password = body.password ?? "";
  if (!body.userId) return Response.json({ error: "Thiếu học viên cần đổi mật khẩu." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "Mật khẩu phải có ít nhất 8 ký tự." }, { status: 400 });
  if (body.userId === auth.user.id) return Response.json({ error: "Hãy đổi mật khẩu quản trị trong trang hồ sơ." }, { status: 400 });

  const { data: studentProfile, error: profileError } = await admin.from("profiles").select("role").eq("id", body.userId).single();
  if (profileError || studentProfile?.role !== "student") return Response.json({ error: "Không tìm thấy tài khoản học viên hợp lệ." }, { status: 404 });

  const { data, error } = await admin.auth.admin.updateUserById(body.userId, { password });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ user: data.user });
}
