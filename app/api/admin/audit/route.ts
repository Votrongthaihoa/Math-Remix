import { ensureActiveAccount } from "../../../../lib/security-server";

const headers = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
};

type AuditSource = "exam" | "account";

type UnifiedAuditItem = {
  id: string;
  source: AuditSource;
  action: string;
  status: "started" | "succeeded" | "failed" | "recorded";
  admin_id: string | null;
  admin_name: string;
  target_id: string | null;
  target_name: string;
  target_code: string;
  context: string;
  reason: string;
  created_at: string;
  completed_at: string | null;
};

function normalizeAuditLimit(value: string | null) {
  const parsed = Math.floor(Number(value) || 20);
  return Math.min(100, Math.max(10, parsed));
}

function searchText(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi-VN");
}

function boundedReason(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 320) : "";
}

export async function GET(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  if (security.profile.role !== "admin") {
    return Response.json({ error: "Bạn không có quyền quản trị." }, { status: 403, headers });
  }

  const params = new URL(request.url).searchParams;
  const query = searchText([params.get("q")?.trim()]);
  const source = params.get("source") === "exam" || params.get("source") === "account" ? params.get("source") as AuditSource : "all";
  const status = params.get("status") === "started" || params.get("status") === "succeeded" || params.get("status") === "failed" ? params.get("status") : "all";
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const limit = normalizeAuditLimit(params.get("limit"));

  const [examResult, accountResult] = await Promise.all([
    source === "account"
      ? Promise.resolve({ data: [], error: null })
      : security.admin
          .from("exam_admin_audit_logs")
          .select("id,admin_id,exam_id,room_id,slot_id,action,status,created_at,completed_at")
          .order("created_at", { ascending: false })
          .limit(500),
    source === "exam"
      ? Promise.resolve({ data: [], error: null })
      : security.admin
          .from("admin_actions")
          .select("id,admin_id,target_user_id,action,reason,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
  ]);
  if (examResult.error || accountResult.error) {
    return Response.json({ error: "Không thể tải nhật ký quản trị. Hãy thử lại sau." }, { status: 503, headers });
  }

  const examRows = examResult.data ?? [];
  const accountRows = accountResult.data ?? [];
  const profileIds = [...new Set([
    ...examRows.map(row => row.admin_id),
    ...accountRows.flatMap(row => [row.admin_id, row.target_user_id]),
  ].filter((value): value is string => Boolean(value)))];
  const profileResult = profileIds.length
    ? await security.admin.from("profiles").select("id,full_name,student_code").in("id", profileIds)
    : { data: [], error: null };
  if (profileResult.error) {
    return Response.json({ error: "Không thể đối chiếu người thực hiện nhật ký." }, { status: 503, headers });
  }
  const profiles = new Map((profileResult.data ?? []).map(profile => [profile.id, profile]));
  const profileName = (id: string | null) => id ? profiles.get(id)?.full_name || "Tài khoản quản trị" : "Hệ thống";

  const items: UnifiedAuditItem[] = [
    ...examRows.map(row => {
      const targetId = row.exam_id || row.room_id || row.slot_id || null;
      const targetKind = row.exam_id ? "Đề thi" : row.room_id ? "Phòng thi" : row.slot_id ? "Kíp thi" : "Hệ thống thi";
      return {
        id: `exam:${row.id}`,
        source: "exam" as const,
        action: row.action,
        status: row.status as UnifiedAuditItem["status"],
        admin_id: row.admin_id,
        admin_name: profileName(row.admin_id),
        target_id: targetId,
        target_name: targetKind,
        target_code: targetId ? targetId.slice(0, 12) : "",
        context: targetKind,
        reason: "",
        created_at: row.created_at,
        completed_at: row.completed_at,
      };
    }),
    ...accountRows.map(row => ({
      id: `account:${row.id}`,
      source: "account" as const,
      action: row.action,
      status: "recorded" as const,
      admin_id: row.admin_id,
      admin_name: profileName(row.admin_id),
      target_id: row.target_user_id,
      target_name: profiles.get(row.target_user_id)?.full_name || "Học viên",
      target_code: profiles.get(row.target_user_id)?.student_code || row.target_user_id.slice(0, 12),
      context: "Bảo mật tài khoản",
      reason: boundedReason(row.reason),
      created_at: row.created_at,
      completed_at: row.created_at,
    })),
  ].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));

  const sourceMatched = source === "all" ? items : items.filter(item => item.source === source);
  const statusMatched = status === "all" ? sourceMatched : sourceMatched.filter(item => item.status === status);
  const filtered = query
    ? statusMatched.filter(item => searchText([item.action, item.admin_name, item.target_name, item.target_code, item.context, item.reason]).includes(query))
    : statusMatched;
  const start = (page - 1) * limit;
  const pageItems = filtered.slice(start, start + limit);
  const summary = items.reduce((result, item) => {
    result.total += 1;
    result[item.source] += 1;
    if (item.status === "failed") result.failed += 1;
    if (item.status === "started") result.pending += 1;
    return result;
  }, { total: 0, exam: 0, account: 0, failed: 0, pending: 0 });

  return Response.json({
    items: pageItems,
    summary,
    total: filtered.length,
    page,
    limit,
    hasNextPage: start + pageItems.length < filtered.length,
    serverTime: new Date().toISOString(),
  }, { headers });
}
