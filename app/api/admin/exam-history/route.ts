import { ensureAdminPermission } from "../../../../lib/admin-authorization-server";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { finishExamAdminAudit, startExamAdminAudit } from "../../../../lib/admin-audit-server";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

async function adminRequest(request: Request) {
  return ensureAdminPermission(request, "exam-results");
}

export async function GET(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const result = await security.admin.from("exam_attempts").select("id", { count: "exact", head: true });
  if (result.error) return Response.json({ error: "Không thể tải số lượng lịch sử thi." }, { status: 503, headers });
  return Response.json({ count: result.count ?? 0 }, { headers });
}

type Body = { action?: "delete_all"; confirm?: boolean };

export async function POST(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return Response.json(jsonBodyError(parsed.error), { status: parsed.error === "payload_too_large" ? 413 : 400, headers });
  if (parsed.body.action !== "delete_all" || parsed.body.confirm !== true) {
    return Response.json({ error: "Cần xác nhận rõ thao tác xóa lịch sử thi." }, { status: 400, headers });
  }

  const countResult = await security.admin.from("exam_attempts").select("id", { count: "exact", head: true });
  if (countResult.error) return Response.json({ error: "Không thể kiểm tra lịch sử thi." }, { status: 503, headers });
  const count = countResult.count ?? 0;
  const audit = await startExamAdminAudit(security.admin, {
    adminId: security.user.id,
    action: "delete_exam_history",
    metadata: { attempt_count: count, destructive: true },
  });
  if (!audit.ok) return Response.json({ error: "Không thể ghi nhật ký thao tác. Không xóa dữ liệu." }, { status: 503, headers });

  const deleted = await security.admin.from("exam_attempts").delete().not("id", "is", null);
  if (deleted.error) {
    await finishExamAdminAudit(security.admin, audit.audit.id, "failed");
    return Response.json({ error: "Không thể xóa lịch sử thi." }, { status: 503, headers });
  }
  await finishExamAdminAudit(security.admin, audit.audit.id, "succeeded");
  return Response.json({ deleted: count }, { headers });
}
