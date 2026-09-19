import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAdminPermission } from "../../../../lib/admin-authorization-server";

const headers = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
};
const vietnamUtcOffset = "+07:00";

type AuditSource = "exam" | "account";
const auditSourceLimit = 500;
const auditSourceFetchLimit = auditSourceLimit + 1;
const profileLookupChunkSize = 100;

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

type DateBoundResult = { value: number | null; invalid: boolean };

function dateBound(value: string | null, endOfDay = false): DateBoundResult {
  const raw = value?.trim() ?? "";
  if (!raw) return { value: null, invalid: false };
  // The admin date inputs represent calendar days in the product's Vietnam
  // timezone, while audit timestamps are stored as UTC instants. Vietnam has
  // no DST, so an explicit +07:00 offset keeps the inclusive bounds stable.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    const calendar = new Date(`${raw}T00:00:00.000Z`);
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
      return { value: null, invalid: true };
    }
    const parsed = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}${vietnamUtcOffset}`);
    return { value: Number.isFinite(parsed.getTime()) ? parsed.getTime() : null, invalid: !Number.isFinite(parsed.getTime()) };
  }
  const parsed = new Date(raw);
  return { value: Number.isFinite(parsed.getTime()) ? parsed.getTime() : null, invalid: !Number.isFinite(parsed.getTime()) };
}

async function loadProfilesByIds(admin: SupabaseClient, profileIds: string[]) {
  const profiles: Array<{ id: string; full_name: string | null; student_code: string | null }> = [];
  for (let index = 0; index < profileIds.length; index += profileLookupChunkSize) {
    const result = await admin
      .from("profiles")
      .select("id,full_name,student_code")
      .in("id", profileIds.slice(index, index + profileLookupChunkSize));
    if (result.error) return { data: [], error: result.error };
    profiles.push(...(result.data ?? []));
  }
  return { data: profiles, error: null };
}

export async function GET(request: Request) {
  const security = await ensureAdminPermission(request, "system-admin");
  if (!security.ok) return security.response;

  const params = new URL(request.url).searchParams;
  const query = searchText([params.get("q")?.trim()]);
  const source = params.get("source") === "exam" || params.get("source") === "account" ? params.get("source") as AuditSource : "all";
  const status = params.get("status") === "started" || params.get("status") === "succeeded" || params.get("status") === "failed" || params.get("status") === "recorded" ? params.get("status") : "all";
  const action = params.get("action")?.trim().slice(0, 100) || "";
  const fromBound = dateBound(params.get("from"));
  const toBound = dateBound(params.get("to"), true);
  if (fromBound.invalid || toBound.invalid) {
    return Response.json({ error: "Ngày lọc không hợp lệ." }, { status: 400, headers });
  }
  const from = fromBound.value;
  const to = toBound.value;
  if (from !== null && to !== null && from > to) {
    return Response.json({ error: "Khoảng ngày không hợp lệ." }, { status: 400, headers });
  }
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const limit = normalizeAuditLimit(params.get("limit"));

  const examQuery = source === "account"
    ? null
    : security.admin
        .from("exam_admin_audit_logs")
        .select("id,admin_id,exam_id,room_id,slot_id,action,status,created_at,completed_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
  const accountQuery = source === "exam"
    ? null
    : security.admin
        .from("admin_actions")
        .select("id,admin_id,target_user_id,action,reason,created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
  if (from !== null) {
    const iso = new Date(from).toISOString();
    examQuery?.gte("created_at", iso);
    accountQuery?.gte("created_at", iso);
  }
  if (to !== null) {
    const iso = new Date(to).toISOString();
    examQuery?.lte("created_at", iso);
    accountQuery?.lte("created_at", iso);
  }

  const [examResult, accountResult] = await Promise.all([
    !examQuery
      ? Promise.resolve({ data: [], error: null })
      : examQuery.limit(auditSourceFetchLimit),
    !accountQuery
      ? Promise.resolve({ data: [], error: null })
      : accountQuery.limit(auditSourceFetchLimit),
  ]);
  if (examResult.error || accountResult.error) {
    return Response.json({ error: "Không thể tải nhật ký quản trị. Hãy thử lại sau." }, { status: 503, headers });
  }

  const examRowsRaw = examResult.data ?? [];
  const accountRowsRaw = accountResult.data ?? [];
  const truncated = {
    exam: examRowsRaw.length > auditSourceLimit,
    account: accountRowsRaw.length > auditSourceLimit,
  };
  const examRows = examRowsRaw.slice(0, auditSourceLimit);
  const accountRows = accountRowsRaw.slice(0, auditSourceLimit);
  const profileIds = [...new Set([
    ...examRows.map(row => row.admin_id),
    ...accountRows.flatMap(row => [row.admin_id, row.target_user_id]),
  ].filter((value): value is string => Boolean(value)))];
  const profileResult = profileIds.length
    ? await loadProfilesByIds(security.admin, profileIds)
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
  ].sort((left, right) => {
    const timeDifference = Date.parse(right.created_at) - Date.parse(left.created_at);
    return timeDifference || right.id.localeCompare(left.id);
  });

  const sourceMatched = source === "all" ? items : items.filter(item => item.source === source);
  const statusMatched = status === "all" ? sourceMatched : sourceMatched.filter(item => item.status === status);
  const actionMatched = action ? statusMatched.filter(item => item.action === action) : statusMatched;
  const dateMatched = actionMatched.filter(item => {
    const createdAt = Date.parse(item.created_at);
    return Number.isFinite(createdAt) && (from === null || createdAt >= from) && (to === null || createdAt <= to);
  });
  const filtered = query
    ? dateMatched.filter(item => searchText([item.action, item.admin_name, item.target_name, item.target_code, item.context, item.reason]).includes(query))
    : dateMatched;
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
    truncation: {
      hasTruncatedSources: truncated.exam || truncated.account,
      sources: truncated,
      sourceLimit: auditSourceLimit,
    },
    serverTime: new Date().toISOString(),
  }, { headers });
}
