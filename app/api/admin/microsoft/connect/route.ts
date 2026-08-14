import { jsonBodyError, readJsonBody } from "../../../../../lib/http-server";
import { createMicrosoftAuthorizationUrl, microsoftConnectionStatus, MicrosoftGraphError } from "../../../../../lib/microsoft-graph-server";
import { consumeRequestBudget } from "../../../../../lib/rate-limit-server";
import { ensureActiveAccount, hashedRequestIp } from "../../../../../lib/security-server";

const noStore = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

async function getAdmin(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return { error: security.response };
  if (security.profile.role !== "admin") return { error: Response.json({ error: "Không có quyền quản trị." }, { status: 403, headers: noStore }) };
  return { admin: security.admin, user: security.user };
}

function graphError(error: unknown) {
  if (error instanceof MicrosoftGraphError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
  console.error("[microsoft-connect] unexpected error", error);
  return Response.json({ error: "Không thể chuẩn bị kết nối Microsoft lúc này." }, { status: 502, headers: noStore });
}

export async function GET(request: Request) {
  const authorization = await getAdmin(request);
  if ("error" in authorization) return authorization.error;
  try { return Response.json(await microsoftConnectionStatus(authorization.admin), { headers: noStore }); }
  catch (error) { return graphError(error); }
}

export async function POST(request: Request) {
  const authorization = await getAdmin(request);
  if ("error" in authorization) return authorization.error;
  try {
    const budget = await consumeRequestBudget(authorization.admin, "admin-microsoft-connect", `${authorization.user.id}:${await hashedRequestIp(request)}`, { capacity: 5, refillSeconds: 60 });
    if (!budget.allowed) return Response.json({ error: "Bạn thử kết nối Microsoft quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...noStore, "retry-after": String(budget.retryAfterSeconds) } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStore });
  }
  const parsed = await readJsonBody<{ returnTo?: string }>(request);
  if (!parsed.ok) return Response.json(jsonBodyError(parsed.error), { status: parsed.error === "payload_too_large" ? 413 : 400, headers: noStore });
  try {
    const authorizationUrl = await createMicrosoftAuthorizationUrl(authorization.user.id, parsed.body.returnTo);
    return Response.json({ authorizationUrl }, { headers: noStore });
  } catch (error) { return graphError(error); }
}
