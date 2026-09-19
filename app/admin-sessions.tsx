"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, FilePlus2, RefreshCw, Search, Trash2 } from "lucide-react";
import AeckConfirmDialog from "../components/aeck/AeckConfirmDialog";
import { authenticatedFetch } from "../lib/auth-client";
import { sessionState, sessionStateLabel, type SessionState } from "../lib/session-catalog";
import LoadingIndicator from "./loading-indicator";
import { formatUiDate, formatUiDateTime, formatUiTime } from "./ui-format";
import "./admin-sessions.css";

type SessionRow = {
  id: string;
  kind: "account" | "link_qr" | "both";
  exam_id: string;
  room_id: string;
  name: string;
  exam_title: string;
  exam_type: string;
  room_title: string;
  starts_at: string;
  ends_at: string;
  enabled: boolean;
  results_released_at: string | null;
  token_hint: string | null;
  attempt_count: number;
  submitted_count: number;
};

type SessionsPayload = {
  items?: SessionRow[];
  summary?: Record<SessionState, number>;
  total?: number;
  hasNextPage?: boolean;
  error?: string;
};

type SessionSort = "start_desc" | "start_asc" | "name_asc";

const PAGE_SIZES = [20, 50] as const;

function formatDateTime(value: string) {
  return formatUiDateTime(value, "Chưa xác định");
}

function formatRange(session: Pick<SessionRow, "starts_at" | "ends_at">) {
  const start = new Date(session.starts_at);
  const end = new Date(session.ends_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Chưa xác định thời gian";
  return `${formatUiDate(start, "Chưa xác định")} · ${formatUiTime(start, "--:--")}–${formatUiTime(end, "--:--")}`;
}

function modeLabel(kind: SessionRow["kind"]) {
  return kind === "account" ? "Tài khoản" : kind === "both" ? "Tài khoản + Link/QR" : "Link/QR";
}

export default function AdminSessionList({
  navigate,
  canManageExams,
  canOpenResults,
}: {
  navigate: (path: string) => void;
  canManageExams: boolean;
  canOpenResults: boolean;
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [summary, setSummary] = useState<Record<SessionState, number>>({ upcoming: 0, open: 0, ended: 0, disabled: 0 });
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<"" | SessionState>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(20);
  const [sort, setSort] = useState<SessionSort>("start_desc");
  const [urlReady, setUrlReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SessionRow | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deletingSessionId, setDeletingSessionId] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [resultTotal, setResultTotal] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const requestId = useRef(0);
  const abortController = useRef<AbortController | null>(null);

  const readUrlState = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const nextPage = Math.max(1, Math.floor(Number(params.get("page")) || 1));
    const requestedPageSize = Number(params.get("pageSize"));
    const requestedSort = params.get("sort");
    const nextQuery = params.get("q") ?? "";
    setQuery(nextQuery);
    setDebouncedQuery(nextQuery.trim());
    setStateFilter(status === "upcoming" || status === "open" || status === "ended" || status === "disabled" ? status : "");
    setPage(nextPage);
    setPageSize(PAGE_SIZES.includes(requestedPageSize as (typeof PAGE_SIZES)[number]) ? requestedPageSize as (typeof PAGE_SIZES)[number] : 20);
    setSort(requestedSort === "start_asc" || requestedSort === "name_asc" ? requestedSort : "start_desc");
    setUrlReady(true);
  }, []);

  useEffect(() => {
    // URL state is read once on mount, then synchronized by popstate events.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    readUrlState();
    window.addEventListener("popstate", readUrlState);
    return () => window.removeEventListener("popstate", readUrlState);
  }, [readUrlState]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!urlReady) return;
    const url = new URL(window.location.href);
    if (debouncedQuery) url.searchParams.set("q", debouncedQuery); else url.searchParams.delete("q");
    if (stateFilter) url.searchParams.set("status", stateFilter); else url.searchParams.delete("status");
    if (page > 1) url.searchParams.set("page", String(page)); else url.searchParams.delete("page");
    if (pageSize !== 20) url.searchParams.set("pageSize", String(pageSize)); else url.searchParams.delete("pageSize");
    if (sort !== "start_desc") url.searchParams.set("sort", sort); else url.searchParams.delete("sort");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [debouncedQuery, page, pageSize, sort, stateFilter, urlReady]);

  const load = useCallback(async () => {
    if (!urlReady) return;
    const currentRequestId = ++requestId.current;
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    setRefreshing(true);
    setError("");
    const params = new URLSearchParams({ limit: String(pageSize), page: String(page), sort });
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (stateFilter) params.set("state", stateFilter);
    try {
      const response = await authenticatedFetch(`/api/admin/sessions?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json().catch(() => ({})) as SessionsPayload;
      if (!response.ok) throw new Error(payload.error || "Không thể tải danh sách kíp thi.");
      if (currentRequestId !== requestId.current || controller.signal.aborted) return;
      setSessions(payload.items ?? []);
      setSummary(payload.summary ?? { upcoming: 0, open: 0, ended: 0, disabled: 0 });
      setResultTotal(Math.max(0, payload.total ?? 0));
      setHasNextPage(Boolean(payload.hasNextPage));
    } catch (value) {
      if (controller.signal.aborted) return;
      if (currentRequestId === requestId.current) setError(value instanceof Error ? value.message : "Không thể tải danh sách kíp thi.");
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [debouncedQuery, page, pageSize, sort, stateFilter, urlReady]);

  useEffect(() => {
    // Network-backed state is populated after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useEffect(() => () => abortController.current?.abort(), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const total = useMemo(() => Object.values(summary).reduce((sum, value) => sum + value, 0), [summary]);

  function updateFilter(next: "" | SessionState) {
    setStateFilter(next);
    setPage(1);
  }

  function openPath(event: MouseEvent<HTMLAnchorElement>, path: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(path);
  }

  async function deleteSession(session: SessionRow) {
    if (!canManageExams || session.kind === "account" || deletingSessionId) return;
    setDeletingSessionId(session.id);
    setDeleteError("");
    setNotice("");
    try {
      const response = await authenticatedFetch("/api/admin/exam-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete_slot", examId: session.exam_id, slotId: session.id }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Không thể xóa kíp thi.");
      setPendingDelete(null);
      setNotice(`Đã xóa kíp “${session.name}”.`);
      if (sessions.length === 1 && page > 1) setPage(current => Math.max(1, current - 1));
      else await load();
    } catch (value) {
      setDeleteError(value instanceof Error ? value.message : "Không thể xóa kíp thi.");
    } finally {
      setDeletingSessionId("");
    }
  }

  return <div className="admin-session-page">
    <header className="admin-session-header">
      <div>
        <span className="admin-kicker">VẬN HÀNH KỲ THI</span>
        <h1>Đợt thi</h1>
        <p>Mỗi kíp thi là một lần tổ chức của một đề đã xuất bản.</p>
      </div>
      <div className="admin-session-header-actions">
        <button type="button" className="admin-session-refresh" onClick={() => void load()} disabled={refreshing}><RefreshCw aria-hidden="true" />{refreshing ? "Đang tải…" : "Làm mới"}</button>
        {canManageExams ? <Link className="admin-session-primary" href="/admin/sessions/new" onClick={event => openPath(event, "/admin/sessions/new")}><FilePlus2 aria-hidden="true" />Tạo kíp thi</Link> : null}
      </div>
    </header>

    <div className="admin-session-summary" role="group" aria-label="Tóm tắt đợt thi">
      <button type="button" className={stateFilter === "upcoming" ? "active" : ""} aria-pressed={stateFilter === "upcoming"} onClick={() => updateFilter(stateFilter === "upcoming" ? "" : "upcoming")}><small>Sắp diễn ra</small><strong>{loading ? "—" : summary.upcoming}</strong></button>
      <button type="button" className={stateFilter === "open" ? "active" : ""} aria-pressed={stateFilter === "open"} onClick={() => updateFilter(stateFilter === "open" ? "" : "open")}><small>Đang mở</small><strong>{loading ? "—" : summary.open}</strong></button>
      <button type="button" className={stateFilter === "ended" ? "active" : ""} aria-pressed={stateFilter === "ended"} onClick={() => updateFilter(stateFilter === "ended" ? "" : "ended")}><small>Đã kết thúc</small><strong>{loading ? "—" : summary.ended}</strong></button>
      <button type="button" className={stateFilter === "disabled" ? "active" : ""} aria-pressed={stateFilter === "disabled"} onClick={() => updateFilter(stateFilter === "disabled" ? "" : "disabled")}><small>Đã tắt</small><strong>{loading ? "—" : summary.disabled}</strong></button>
      <button type="button" className={!stateFilter ? "active" : ""} aria-pressed={!stateFilter} onClick={() => updateFilter("")}><small>Tất cả kíp thi</small><strong>{loading ? "—" : total}</strong></button>
    </div>

    {notice && <div className="admin-session-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Đóng thông báo">×</button></div>}
    {error && <div className="admin-session-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Thử lại</button></div>}

    <section className="admin-session-list" aria-labelledby="session-list-title" aria-busy={loading || refreshing}>
      <div className="admin-session-list-head">
        <div><span className="admin-kicker">LỊCH TỔ CHỨC</span><h2 id="session-list-title">Các kíp thi</h2></div>
        <div className="admin-session-list-tools">
          <label className="admin-session-search"><Search aria-hidden="true" /><span className="sr-only">Tìm kíp thi</span><input name="sessionSearch" type="search" autoComplete="off" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm kíp, đề hoặc phòng…" /></label>
          <label className="admin-session-select"><span>Sắp xếp</span><select name="sessionSort" value={sort} onChange={event => { setSort(event.target.value as SessionSort); setPage(1); }}><option value="start_desc">Mới nhất</option><option value="start_asc">Cũ nhất</option><option value="name_asc">Tên A–Z</option></select></label>
          <label className="admin-session-select"><span>Số dòng</span><select name="sessionPageSize" value={pageSize} onChange={event => { setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]); setPage(1); }}>{PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        </div>
        <span className="admin-session-count" role="status" aria-live="polite">{loading ? "Đang tải…" : `${resultTotal} kíp`}</span>
      </div>
      {loading ? <div className="admin-session-loading"><LoadingIndicator label="Đang tải kíp thi…" /></div> : sessions.length ? <ul className="admin-session-table">
        {sessions.map(session => {
          const state = sessionState(session, now);
          const submitted = session.submitted_count;
          const totalAttempts = session.attempt_count;
          const actionLabel = state === "open" ? "Theo dõi" : state === "ended" ? "Xem kết quả" : "Xem kíp";
          const actionPath = `/admin/sessions/${encodeURIComponent(session.id)}/results?examId=${encodeURIComponent(session.exam_id)}${session.kind === "account" ? "" : `&slotId=${encodeURIComponent(session.id)}`}${session.kind === "both" ? "&mode=both" : session.kind === "link_qr" ? "&mode=link_qr" : "&mode=account"}`;
          return <li className="admin-session-row" key={session.id}>
            <div className="admin-session-main">
              <div className="admin-session-title-row"><span className={`admin-session-status ${state}`}><i aria-hidden="true" />{sessionStateLabel(state)}</span><h3>{session.name}</h3></div>
              <p>{session.exam_title} · {session.room_title} · {modeLabel(session.kind)}</p>
            </div>
            <div className="admin-session-meta"><small>Thời gian</small><b>{formatRange(session)}</b><span>{formatDateTime(session.starts_at)} → {formatDateTime(session.ends_at)}</span></div>
            <div className="admin-session-meta admin-session-progress"><small>Người tham gia</small><b>{submitted}/{totalAttempts} đã nộp</b><span className="admin-progress-track"><i style={{ width: `${totalAttempts ? Math.round((submitted / totalAttempts) * 100) : 0}%` }} /></span></div>
            <div className="admin-session-meta admin-session-results"><small>Kết quả</small><b>{session.results_released_at ? "Đã công bố" : "Chưa công bố"}</b><span>{state === "ended" && !session.results_released_at ? "Cần xem lại" : "Theo cấu hình kíp thi"}</span></div>
            <div className="admin-session-row-actions">
              {canOpenResults ? <Link className="admin-session-action" href={actionPath} onClick={event => openPath(event, actionPath)}>{actionLabel}<ChevronRight aria-hidden="true" /></Link> : null}
              {canManageExams && session.kind !== "account" ? <button type="button" className="admin-session-action admin-session-delete" disabled={deletingSessionId === session.id} aria-label={`Xóa kíp ${session.name}`} onClick={() => { setDeleteError(""); setPendingDelete(session); }}><Trash2 aria-hidden="true" />{deletingSessionId === session.id ? "Đang xóa…" : "Xóa kíp"}</button> : null}
            </div>
          </li>;
        })}
      </ul> : <div className="admin-session-empty"><span><CalendarClock aria-hidden="true" /></span><h3>{query || stateFilter ? "Không có kíp phù hợp" : "Chưa có kíp thi nào"}</h3><p>{query || stateFilter ? "Thử từ khóa khác hoặc xóa bộ lọc để xem toàn bộ kíp thi." : canManageExams ? "Chọn phòng và đề để tạo kíp thi đầu tiên." : "Bạn có thể xem danh sách kíp; cần thêm quyền quản lý đề thi để tạo hoặc xóa kíp."}</p>{query || stateFilter ? <button type="button" className="admin-session-primary" onClick={() => { setQuery(""); updateFilter(""); }}>Xóa bộ lọc</button> : canManageExams ? <Link className="admin-session-primary" href="/admin/sessions/new" onClick={event => openPath(event, "/admin/sessions/new")}><ClipboardCheck aria-hidden="true" />Tạo kíp thi</Link> : null}</div>}
      {!loading && resultTotal > 0 && <nav className="admin-session-pagination" aria-label="Phân trang kíp thi"><button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1}>Trang trước</button><span>Trang <b>{page}</b></span><button type="button" onClick={() => setPage(current => current + 1)} disabled={!hasNextPage}>Trang sau</button></nav>}
    </section>

    <p className="admin-session-note"><CheckCircle2 aria-hidden="true" />Sự kiện giám sát chỉ là dữ liệu kỹ thuật để giáo viên xem lại, không tự động kết luận gian lận.</p>
    {pendingDelete ? <AeckConfirmDialog
      open
      title="Xóa kíp thi này?"
      description={`Xóa vĩnh viễn “${pendingDelete.name}” cùng toàn bộ bài làm, kết quả, danh sách thí sinh và dữ liệu vận hành liên quan? Nếu kíp đang hoạt động, hãy đóng kíp trước. Thao tác này không thể hoàn tác.`}
      errorMessage={deleteError}
      secondaryAction={{ label: "Hủy", onClick: () => { setDeleteError(""); setPendingDelete(null); }, disabled: Boolean(deletingSessionId) }}
      primaryAction={{ label: deletingSessionId ? "Đang xóa…" : "Xóa kíp và dữ liệu", onClick: () => void deleteSession(pendingDelete), disabled: Boolean(deletingSessionId) }}
      onClose={() => { if (!deletingSessionId) { setDeleteError(""); setPendingDelete(null); } }}
    /> : null}
  </div>;
}
