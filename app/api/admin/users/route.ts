import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { ensureAdminPermission } from "../../../../lib/admin-authorization-server";
import { parseAdminUserCreateInput, parseAdminUserPasswordInput } from "../../../../lib/admin-user-input";
import { authPaginationHasMoreAtLimit } from "../../../../lib/admin-user-pagination";
import { hashedRequestIp } from "../../../../lib/security-server";
import { consumeRequestBudget } from "../../../../lib/rate-limit-server";

const noStoreHeaders = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const authPageSize = 1000;
const authMaxPages = 20;

function validationResponse(result: { code: string; error: string }) {
  return Response.json({ error: result.error, code: result.code }, { status: 400, headers: noStoreHeaders });
}

export async function GET(request: Request) {
  const security = await ensureAdminPermission(request, "users");
  if (!security.ok) return security.response;
  const { user, admin } = security;
  try {
    const budget = await consumeRequestBudget(admin, "admin-users-list", `${user.id}:${await hashedRequestIp(request)}`, { capacity: 30, refillSeconds: 2 });
    if (!budget.allowed) return Response.json({ error: "Bạn tải danh sách quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...noStoreHeaders, "retry-after": String(budget.retryAfterSeconds) } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStoreHeaders });
  }

  const users: Array<{ id: string; email: string }> = [];
  let hasMore = false;
  let scannedPages = 0;
  for (let page = 1; page <= authMaxPages; page += 1) {
    scannedPages = page;
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: authPageSize });
    if (error) return Response.json({ error: "Không thể tải danh sách tài khoản.", code: "AUTH_USER_LIST_FAILED" }, { status: 503, headers: noStoreHeaders });
    users.push(...data.users.map(user => ({ id: user.id, email: user.email ?? "" })));
    const reportedTotal = Number(data.total);
    const reportedNextPage = Number(data.nextPage);
    const providerHasMore = (Number.isInteger(reportedNextPage) && reportedNextPage > page)
      || (Number.isFinite(reportedTotal) && reportedTotal > users.length);
    const pageMayBeFull = data.users.length >= authPageSize;
    if (!providerHasMore && !pageMayBeFull) break;
    if (page === authMaxPages) {
      hasMore = authPaginationHasMoreAtLimit({ page, pageSize: authPageSize, userCount: data.users.length, usersSeen: users.length, total: data.total, nextPage: data.nextPage });
      break;
    }
  }
  return Response.json({ users, hasMore, scannedPages }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const security = await ensureAdminPermission(request, "users");
  if (!security.ok) return security.response;
  const { user, admin } = security;
  try {
    const budget = await consumeRequestBudget(admin, "admin-users-create", `${user.id}:${await hashedRequestIp(request)}`, { capacity: 5, refillSeconds: 120 });
    if (!budget.allowed) return Response.json({ error: "Bạn tạo tài khoản quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...noStoreHeaders, "retry-after": String(budget.retryAfterSeconds) } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStoreHeaders });
  }

  const parsedBody = await readJsonBody<unknown>(request, 16 * 1024);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400, headers: noStoreHeaders });
  const input = parseAdminUserCreateInput(parsedBody.body);
  if (!input.ok) return validationResponse(input);
  const { data, error } = await admin.auth.admin.createUser({
    email: input.value.email,
    password: input.value.password,
    email_confirm: true,
    user_metadata: { full_name: input.value.fullName },
  });
  if (error) return Response.json({ error: error.message, code: "AUTH_USER_CREATE_FAILED" }, { status: 400, headers: noStoreHeaders });
  return Response.json({ user: data.user }, { status: 201, headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const security = await ensureAdminPermission(request, "users");
  if (!security.ok) return security.response;
  const { user, admin } = security;
  try {
    const budget = await consumeRequestBudget(admin, "admin-users-password-reset", `${user.id}:${await hashedRequestIp(request)}`, { capacity: 5, refillSeconds: 120 });
    if (!budget.allowed) return Response.json({ error: "Bạn đổi mật khẩu quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...noStoreHeaders, "retry-after": String(budget.retryAfterSeconds) } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStoreHeaders });
  }

  const parsedBody = await readJsonBody<unknown>(request, 4 * 1024);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400, headers: noStoreHeaders });
  const input = parseAdminUserPasswordInput(parsedBody.body);
  if (!input.ok) return validationResponse(input);
  if (input.value.userId === user.id) return Response.json({ error: "Hãy đổi mật khẩu quản trị trong trang hồ sơ.", code: "SELF_PASSWORD_RESET_FORBIDDEN" }, { status: 400, headers: noStoreHeaders });

  const { data: studentProfile, error: profileError } = await admin.from("profiles").select("role").eq("id", input.value.userId).single();
  if (profileError || studentProfile?.role !== "student") return Response.json({ error: "Không tìm thấy tài khoản học viên hợp lệ.", code: "STUDENT_NOT_FOUND" }, { status: 404, headers: noStoreHeaders });

  const { data, error } = await admin.auth.admin.updateUserById(input.value.userId, { password: input.value.password });
  if (error) return Response.json({ error: error.message, code: "AUTH_PASSWORD_UPDATE_FAILED" }, { status: 400, headers: noStoreHeaders });
  return Response.json({ user: data.user }, { headers: noStoreHeaders });
}
