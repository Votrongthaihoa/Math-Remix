import { createClient } from "@supabase/supabase-js";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { hashedRequestIp, resolveAuthUser } from "../../../../lib/security-server";
import { consumeRequestBudget } from "../../../../lib/rate-limit-server";

function accessTokenFrom(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.replace(/^Bearer\s+/i, "").trim()
    || request.headers.get("x-supabase-access-token")?.trim()
    || "";
}

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: "Chưa cấu hình khóa quản trị." }, { status: 503 });

  const token = accessTokenFrom(request);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  if (!token) return Response.json({ error: "Chưa đăng nhập hoặc phiên đăng nhập đã bị mất.", code: "AUTH_REQUIRED" }, { status: 401, headers: { "cache-control": "private, no-store" } });
  const user = await resolveAuthUser(token, admin);
  if (!user) return Response.json({ error: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.", code: "AUTH_SESSION_INVALID" }, { status: 401, headers: { "cache-control": "private, no-store" } });
  const { data: profile } = await admin.from("profiles").select("role,status").eq("id", user.id).single();
  if (profile?.role !== "admin" || profile.status !== "active") return Response.json({ error: "Không có quyền quản trị." }, { status: 403 });
  try {
    const budget = await consumeRequestBudget(admin, "admin-users-list", `${user.id}:${await hashedRequestIp(request)}`, { capacity: 30, refillSeconds: 2 });
    if (!budget.allowed) return Response.json({ error: "Bạn tải danh sách quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { "retry-after": String(budget.retryAfterSeconds), "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503 });
  }

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

  const token = accessTokenFrom(request);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  if (!token) return Response.json({ error: "Chưa đăng nhập hoặc phiên đăng nhập đã bị mất.", code: "AUTH_REQUIRED" }, { status: 401, headers: { "cache-control": "private, no-store" } });
  const user = await resolveAuthUser(token, admin);
  if (!user) return Response.json({ error: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.", code: "AUTH_SESSION_INVALID" }, { status: 401, headers: { "cache-control": "private, no-store" } });
  const { data: profile } = await admin.from("profiles").select("role,status").eq("id", user.id).single();
  if (profile?.role !== "admin" || profile.status !== "active") return Response.json({ error: "Không có quyền quản trị." }, { status: 403 });
  try {
    const budget = await consumeRequestBudget(admin, "admin-users-create", `${user.id}:${await hashedRequestIp(request)}`, { capacity: 5, refillSeconds: 120 });
    if (!budget.allowed) return Response.json({ error: "Bạn tạo tài khoản quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { "retry-after": String(budget.retryAfterSeconds), "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503 });
  }

  const parsedBody = await readJsonBody<{ email?: string; password?: string; fullName?: string }>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400 });
  const body = parsedBody.body;
  if (!body.email || !body.password || !body.fullName) return Response.json({ error: "Thiếu thông tin học viên." }, { status: 400 });
  const { data, error } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: body.fullName },
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ user: data.user }, { status: 201 });
}

export async function PATCH(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: "Chưa cấu hình khóa quản trị." }, { status: 503 });

  const token = accessTokenFrom(request);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  if (!token) return Response.json({ error: "Chưa đăng nhập hoặc phiên đăng nhập đã bị mất.", code: "AUTH_REQUIRED" }, { status: 401, headers: { "cache-control": "private, no-store" } });
  const user = await resolveAuthUser(token, admin);
  if (!user) return Response.json({ error: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.", code: "AUTH_SESSION_INVALID" }, { status: 401, headers: { "cache-control": "private, no-store" } });
  const { data: adminProfile } = await admin.from("profiles").select("role,status").eq("id", user.id).single();
  if (adminProfile?.role !== "admin" || adminProfile.status !== "active") return Response.json({ error: "Không có quyền quản trị." }, { status: 403 });
  try {
    const budget = await consumeRequestBudget(admin, "admin-users-password-reset", `${user.id}:${await hashedRequestIp(request)}`, { capacity: 5, refillSeconds: 120 });
    if (!budget.allowed) return Response.json({ error: "Bạn đổi mật khẩu quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { "retry-after": String(budget.retryAfterSeconds), "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503 });
  }

  const parsedBody = await readJsonBody<{ userId?: string; password?: string }>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400 });
  const body = parsedBody.body;
  const password = body.password ?? "";
  if (!body.userId) return Response.json({ error: "Thiếu học viên cần đổi mật khẩu." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "Mật khẩu phải có ít nhất 8 ký tự." }, { status: 400 });
  if (body.userId === user.id) return Response.json({ error: "Hãy đổi mật khẩu quản trị trong trang hồ sơ." }, { status: 400 });

  const { data: studentProfile, error: profileError } = await admin.from("profiles").select("role").eq("id", body.userId).single();
  if (profileError || studentProfile?.role !== "student") return Response.json({ error: "Không tìm thấy tài khoản học viên hợp lệ." }, { status: 404 });

  const { data, error } = await admin.auth.admin.updateUserById(body.userId, { password });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ user: data.user });
}
