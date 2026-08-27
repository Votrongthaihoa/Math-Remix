"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileClock,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";

type AuditSource = "all" | "exam" | "account";
type AuditStatus = "all" | "started" | "succeeded" | "failed";

type AdminAuditItem = {
  id: string;
  source: "exam" | "account";
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

type AuditPayload = {
  items?: AdminAuditItem[];
  summary?: { total: number; exam: number; account: number; failed: number; pending: number };
  total?: number;
  page?: number;
  limit?: number;
  hasNextPage?: boolean;
  error?: string;
};

const sourceFilters: Array<{ id: AuditSource; label: string }> = [
  { id: "all", label: "Tất cả nguồn" },
  { id: "exam", label: "Kỳ thi" },
  { id: "account", label: "Tài khoản" },
];

const statusFilters: Array<{ id: AuditStatus; label: string }> = [
  { id: "all", label: "Tất cả trạng thái" },
  { id: "succeeded", label: "Thành công" },
  { id: "started", label: "Đang xử lý" },
  { id: "failed", label: "Thất bại" },
];

const actionLabels: Record<string, string> = {
  save_exam_access_config: "Lưu cấu hình truy cập",
  publish_exam: "Xuất bản đề thi",
  create_exam_access_slot: "Tạo kíp thi",
  update_exam_access_slot: "Cập nhật kíp thi",
  rotate_exam_access_slot: "Đổi mã truy cập",
  release_exam_results: "Công bố kết quả",
  export_exam_results: "Xuất kết quả",
  extend_exam_attempt_time: "Gia hạn thời gian thi",
  grant_exam_attempt_retry: "Cấp lượt thi lại",
  import_exam_slot_candidates: "Nhập danh sách thí sinh",
  create_exam_scoring_version: "Tạo phiên bản chấm điểm",
  preview_exam_regrade: "Xem trước chấm lại",
  apply_exam_regrade: "Áp dụng chấm lại",
  override_exam_question: "Điều chỉnh câu hỏi",
  delete_exam_history: "Xóa lịch sử thi",
  unban: "Mở khóa tài khoản",
  extend_ban: "Gia hạn khóa tài khoản",
  permanent_ban: "Khóa tài khoản vĩnh viễn",
  mark_false_positive: "Đánh dấu cảnh báo sai",
  trust_device: "Tin cậy thiết bị",
  revoke_device: "Thu hồi thiết bị",
  reset_violation_count: "Điều chỉnh mức vi phạm",
};

function actionLabel(value: string) {
  return actionLabels[value] ?? value.replaceAll("_", " ");
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "Không rõ thời gian";
}

function initialFilter<T extends string>(name: string, allowed: readonly T[], fallback: T) {
  if (typeof window === "undefined") return fallback;
  const value = new URLSearchParams(window.location.search).get(name) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

function statusCopy(status: AdminAuditItem["status"]) {
  if (status === "succeeded") return "Thành công";
  if (status === "failed") return "Thất bại";
  if (status === "started") return "Đang xử lý";
  return "Đã ghi nhận";
}

export default function AdminAuditLog() {
  const [query, setQuery] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("q") ?? "");
  const [source, setSource] = useState<AuditSource>(() => initialFilter("source", ["all", "exam", "account"] as const, "all"));
  const [status, setStatus] = useState<AuditStatus>(() => initialFilter("status", ["all", "started", "succeeded", "failed"] as const, "all"));
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<AuditPayload>({ items: [], summary: { total: 0, exam: 0, account: 0, failed: 0, pending: 0 }, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [deferredQuery, setDeferredQuery] = useState(() => query.trim());

  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query.trim()); else url.searchParams.delete("q");
    if (source !== "all") url.searchParams.set("source", source); else url.searchParams.delete("source");
    if (status !== "all") url.searchParams.set("status", status); else url.searchParams.delete("status");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);

    const timeout = window.setTimeout(() => setDeferredQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query, source, status]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (deferredQuery) params.set("q", deferredQuery);
    if (source !== "all") params.set("source", source);
    if (status !== "all") params.set("status", status);

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await authenticatedFetch(`/api/admin/audit?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json().catch(() => null) as AuditPayload | null;
        if (!response.ok) throw new Error(result?.error ?? "Không thể tải nhật ký quản trị.");
        setPayload(result ?? {});
      } catch (value) {
        if (controller.signal.aborted) return;
        setError(value instanceof Error ? value.message : "Không thể tải nhật ký quản trị.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [deferredQuery, page, reloadKey, source, status]);

  const items = payload.items ?? [];
  const summary = payload.summary ?? { total: 0, exam: 0, account: 0, failed: 0, pending: 0 };
  const totalPages = Math.max(1, Math.ceil((payload.total ?? 0) / (payload.limit ?? 20)));
  const resultStatus = useMemo(() => loading
    ? "Đang đồng bộ nhật ký quản trị"
    : error
      ? "Không thể tải nhật ký quản trị"
      : `${payload.total ?? 0} bản ghi phù hợp`, [error, loading, payload.total]);

  function changeSource(value: AuditSource) {
    setSource(value);
    setPage(1);
  }

  function changeStatus(value: AuditStatus) {
    setStatus(value);
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setSource("all");
    setStatus("all");
    setPage(1);
  }

  return (
    <div className="admin-audit-page">
      <header className="admin-audit-header">
        <div><h1>Nhật ký quản trị</h1><p>Theo dõi thao tác kỳ thi và bảo mật tài khoản từ các nguồn nhật ký hiện có.</p></div>
        <button type="button" className="admin-audit-refresh" onClick={() => setReloadKey(value => value + 1)} disabled={loading}><RefreshCw className={loading ? "is-spinning" : undefined} aria-hidden="true" />Làm mới</button>
      </header>

      <section className="admin-audit-summary" aria-label="Tổng quan nhật ký">
        <div><span><Activity aria-hidden="true" /></span><p>Tổng bản ghi<strong>{loading ? "—" : summary.total}</strong></p></div>
        <div><span><FileClock aria-hidden="true" /></span><p>Thao tác kỳ thi<strong>{loading ? "—" : summary.exam}</strong></p></div>
        <div><span><ShieldCheck aria-hidden="true" /></span><p>Bảo mật tài khoản<strong>{loading ? "—" : summary.account}</strong></p></div>
        <div><span><CircleAlert aria-hidden="true" /></span><p>Cần kiểm tra<strong>{loading ? "—" : summary.failed + summary.pending}</strong></p></div>
      </section>

      <section className="admin-audit-console" aria-labelledby="admin-audit-filter-title">
        <div className="admin-audit-console-heading"><h2 id="admin-audit-filter-title">Tra cứu nhật ký</h2><p>Lọc theo nội dung, nguồn và trạng thái xử lý.</p></div>
        <label className="admin-audit-search"><Search aria-hidden="true" /><span className="admin-audit-visually-hidden">Từ khóa nhật ký</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm thao tác, quản trị viên, đối tượng…" autoComplete="off" />{query ? <button type="button" aria-label="Xóa từ khóa" onClick={() => { setQuery(""); setPage(1); }}><X aria-hidden="true" /></button> : null}</label>
        <label className="admin-audit-select">Nguồn<select value={source} onChange={event => changeSource(event.target.value as AuditSource)}>{sourceFilters.map(option => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>
        <label className="admin-audit-select">Trạng thái<select value={status} onChange={event => changeStatus(event.target.value as AuditStatus)}>{statusFilters.map(option => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>
        <p className="admin-audit-result-status" role="status" aria-live="polite">{resultStatus}</p>
      </section>

      {error ? <section className="admin-audit-error" role="alert"><CircleAlert aria-hidden="true" /><div><h2>Không thể tải nhật ký</h2><p>{error}</p></div><button type="button" onClick={() => setReloadKey(value => value + 1)}>Thử lại</button></section> : (
        <section className="admin-audit-list-panel" aria-labelledby="admin-audit-list-title" aria-busy={loading}>
          <div className="admin-audit-list-heading"><div><h2 id="admin-audit-list-title">Dòng thời gian thao tác</h2><p>Hiển thị mới nhất trước.</p></div><span>{payload.total ?? 0} bản ghi</span></div>
          {loading ? <div className="admin-audit-loading" role="status"><RefreshCw className="is-spinning" aria-hidden="true" />Đang tải nhật ký…</div> : items.length ? (
            <div className="admin-audit-table" role="table" aria-label="Nhật ký thao tác quản trị">
              <div className="admin-audit-row admin-audit-row-head" role="row"><span role="columnheader">Thao tác</span><span role="columnheader">Nguồn</span><span role="columnheader">Người thực hiện</span><span role="columnheader">Đối tượng</span><span role="columnheader">Thời gian</span><span role="columnheader">Trạng thái</span></div>
              {items.map(item => <article className="admin-audit-row" role="row" key={item.id}>
                <span role="cell" className="admin-audit-action"><i className={`tone-${item.status}`} aria-hidden="true">{item.source === "exam" ? <FileClock /> : <ShieldCheck />}</i><span><strong>{actionLabel(item.action)}</strong>{item.reason ? <small title={item.reason}>{item.reason}</small> : <small>{item.context}</small>}</span></span>
                <span role="cell"><em className={`admin-audit-source source-${item.source}`}>{item.source === "exam" ? "Kỳ thi" : "Tài khoản"}</em></span>
                <span role="cell" className="admin-audit-person"><strong>{item.admin_name}</strong><small>{item.admin_id?.slice(0, 12) || "Tự động"}</small></span>
                <span role="cell" className="admin-audit-person"><strong>{item.target_name}</strong><small>{item.target_code || "Không có mã"}</small></span>
                <span role="cell" className="admin-audit-time"><Clock3 aria-hidden="true" />{dateTime(item.created_at)}</span>
                <span role="cell"><em className={`admin-audit-status status-${item.status}`}>{item.status === "succeeded" || item.status === "recorded" ? <CheckCircle2 aria-hidden="true" /> : item.status === "started" ? <Clock3 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}{statusCopy(item.status)}</em></span>
              </article>)}
            </div>
          ) : <div className="admin-audit-empty" role="status"><Search aria-hidden="true" /><h2>Không có bản ghi phù hợp</h2><p>Thử thay đổi từ khóa hoặc xóa bộ lọc hiện tại.</p><button type="button" onClick={clearFilters}>Xóa bộ lọc</button></div>}

          {!loading && items.length ? <nav className="admin-audit-pagination" aria-label="Phân trang nhật ký"><span>Trang {page} / {totalPages}</span><div><button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft aria-hidden="true" /></button><button type="button" aria-label="Trang sau" disabled={!payload.hasNextPage} onClick={() => setPage(value => value + 1)}><ChevronRight aria-hidden="true" /></button></div></nav> : null}
        </section>
      )}
    </div>
  );
}
