"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Laptop, LoaderCircle, LockKeyhole, RotateCcw, ShieldCheck, Smartphone, X } from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import LoadingIndicator from "./loading-indicator";
import { useAdminDialogFocus } from "./admin-dialog";
import "./admin-security.css";

type SecurityUser = { id: string; full_name: string; student_code: string; email: string; status: string; account_status: string; violation_count: number; banned_at: string | null; banned_until: string | null; ban_reason: string | null; ban_event_id: number | null };
type SecurityDevice = { id: string; device_name?: string | null; browser?: string | null; operating_system?: string | null; trusted_by_admin?: boolean; verified_at?: string | null; last_used_at?: string | null; revoked_at?: string | null };
type SecuritySession = { id: string; activity_type: string; city?: string | null; region_code?: string | null; last_seen_at: string; risk_score: number; revoked_at?: string | null };
type SecurityEvent = { id: number; event_type: string; risk_score: number; reason: string; distance_km?: number | null; created_at: string; review_result?: string | null };
type Detail = { profile: SecurityUser; devices: SecurityDevice[]; sessions: SecuritySession[]; events: SecurityEvent[]; violations: unknown[]; actions: unknown[]; serverTime: string };
type SecurityStatus = "all" | "active" | "temporarily_banned" | "permanently_banned" | "violations";
type SecurityListResponse = { items?: SecurityUser[]; total?: number; page?: number; limit?: number; hasNextPage?: boolean; serverTime?: string };
type SecurityListState = { q: string; status: SecurityStatus; page: number; limit: number };
type SecurityAction = "unban" | "extend_ban" | "permanent_ban" | "mark_false_positive" | "trust_device" | "revoke_device" | "reset_violation_count";
type ActionCopy = { title: string; description: string; defaultReason: string; submitLabel: string };
type PendingAction = ActionCopy & { action: SecurityAction; extra: Record<string, unknown>; userId: string };

const ACTION_COPY: Record<SecurityAction, ActionCopy> = {
  unban: { title: "Gỡ khóa tài khoản?", description: "Tài khoản sẽ được mở lại và các phiên học hiện tại sẽ bị kết thúc.", defaultReason: "Đã xác minh trường hợp hợp lệ.", submitLabel: "Gỡ khóa" },
  extend_ban: { title: "Khóa tài khoản 24 giờ?", description: "Tài khoản sẽ bị tạm khóa trong 24 giờ và các phiên học hiện tại sẽ bị kết thúc.", defaultReason: "Thao tác quản trị bảo mật.", submitLabel: "Khóa 24 giờ" },
  permanent_ban: { title: "Khóa tài khoản vĩnh viễn?", description: "Tài khoản sẽ không thể truy cập lại cho đến khi quản trị viên can thiệp.", defaultReason: "Thao tác quản trị bảo mật.", submitLabel: "Khóa vĩnh viễn" },
  mark_false_positive: { title: "Đánh dấu phát hiện nhầm?", description: "Sự kiện này sẽ được ghi nhận là false positive trong nhật ký bảo mật.", defaultReason: "Quản trị viên xác nhận phát hiện nhầm.", submitLabel: "Xác nhận" },
  trust_device: { title: "Tin cậy thiết bị này?", description: "Thiết bị sẽ được khôi phục quyền tin cậy cho học viên.", defaultReason: "Thiết bị đã được quản trị viên xác minh.", submitLabel: "Tin cậy thiết bị" },
  revoke_device: { title: "Thu hồi thiết bị này?", description: "Thiết bị và các phiên học đang dùng thiết bị này sẽ bị dừng.", defaultReason: "Thu hồi thiết bị theo kiểm tra bảo mật.", submitLabel: "Thu hồi thiết bị" },
  reset_violation_count: { title: "Giảm một mức vi phạm?", description: "Số lần vi phạm của học viên sẽ giảm một mức và được ghi vào audit log.", defaultReason: "Quản trị viên xác nhận cần điều chỉnh mức vi phạm.", submitLabel: "Giảm mức vi phạm" },
};

const SECURITY_STATUSES = new Set<SecurityStatus>(["all", "active", "temporarily_banned", "permanently_banned", "violations"]);
const SECURITY_PAGE_SIZES = new Set([20, 50]);
const SECURITY_DRAWER_STATE_KEY = "adminSecurityUserId";
const SECURITY_USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function listNumber(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readListState(): SecurityListState {
  if (typeof window === "undefined") return { q: "", status: "all", page: 1, limit: 20 };
  const params = new URLSearchParams(window.location.search);
  const requestedStatus = params.get("status") as SecurityStatus | null;
  const requestedLimit = listNumber(params.get("limit"), 20);
  return {
    q: params.get("q")?.trim().slice(0, 100) ?? "",
    status: requestedStatus && SECURITY_STATUSES.has(requestedStatus) ? requestedStatus : "all",
    page: Math.min(listNumber(params.get("page"), 1), 10_000),
    limit: SECURITY_PAGE_SIZES.has(requestedLimit) ? requestedLimit : 20,
  };
}

function readSelectedUserId() {
  if (typeof window === "undefined") return "";
  const userId = new URLSearchParams(window.location.search).get("userId")?.trim() ?? "";
  return SECURITY_USER_ID_PATTERN.test(userId) ? userId : "";
}

function securityUrlWithSelectedUser(userId: string) {
  const params = new URLSearchParams(window.location.search);
  if (userId) params.set("userId", userId); else params.delete("userId");
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  const response = await authenticatedFetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Không thể tải dữ liệu bảo mật.");
  return payload;
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Chưa rõ thời gian";
  return parsed.toLocaleString("vi-VN");
}

function statusLabel(user: SecurityUser, serverTime = "") {
  if (user.account_status === "permanently_banned") return "Khóa vĩnh viễn";
  if (user.account_status === "temporarily_banned") {
    const until = user.banned_until ? new Date(user.banned_until) : null;
    const serverNow = serverTime ? new Date(serverTime) : new Date();
    if (!until || Number.isNaN(until.getTime()) || Number.isNaN(serverNow.getTime()) || until > serverNow) return "Tạm khóa";
  }
  return "Hoạt động";
}

function effectiveAccountStatus(user: SecurityUser, serverTime = "") {
  return statusLabel(user, serverTime) === "Hoạt động" ? "active" : user.account_status;
}

function isRecentlyActive(lastSeen: string, serverTime: string) {
  const seen = new Date(lastSeen).getTime();
  const server = new Date(serverTime).getTime();
  return Number.isFinite(seen) && Number.isFinite(server) && seen > server - 120_000;
}

export default function AdminSecurity() {
  const [users, setUsers] = useState<SecurityUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [search, setSearch] = useState("");
  const [listState, setListState] = useState<SecurityListState>({ q: "", status: "all", page: 1, limit: 20 });
  const [listReady, setListReady] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [listServerTime, setListServerTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const listRequestId = useRef(0);
  const listAbortController = useRef<AbortController | null>(null);
  const hasLoadedList = useRef(false);
  const detailRequestId = useRef(0);
  const detailAbortController = useRef<AbortController | null>(null);
  const pageContentRef = useRef<HTMLDivElement | null>(null);
  const detailContentRef = useRef<HTMLDivElement | null>(null);
  const detailDialogRef = useAdminDialogFocus<HTMLElement>(Boolean(selectedId) && !pendingAction, closeDetail);
  const actionDialogRef = useAdminDialogFocus<HTMLDivElement>(Boolean(pendingAction), closeActionDialog);

  const loadUsers = useCallback(async (state: SecurityListState) => {
    const requestId = ++listRequestId.current;
    listAbortController.current?.abort();
    const controller = new AbortController();
    listAbortController.current = controller;
    if (hasLoadedList.current) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: state.q, status: state.status, page: String(state.page), limit: String(state.limit) });
      const payload = await api<SecurityListResponse>(`/api/admin/security?${params.toString()}`, { signal: controller.signal });
      if (requestId !== listRequestId.current || controller.signal.aborted) return;
      setUsers(Array.isArray(payload.items) ? payload.items : []);
      setTotal(typeof payload.total === "number" ? payload.total : 0);
      setHasNextPage(Boolean(payload.hasNextPage));
      setListServerTime(typeof payload.serverTime === "string" ? payload.serverTime : "");
      if (typeof payload.page === "number" && payload.page !== state.page) {
        setListState(current => current.q === state.q && current.status === state.status && current.limit === state.limit ? { ...current, page: payload.page! } : current);
      }
    } catch (value) {
      if (controller.signal.aborted) return;
      if (requestId === listRequestId.current) setError(value instanceof Error ? value.message : "Không thể tải dữ liệu.");
    } finally {
      if (requestId === listRequestId.current) {
        hasLoadedList.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadDetail = useCallback(async (userId: string) => {
    const requestId = ++detailRequestId.current;
    detailAbortController.current?.abort();
    const controller = new AbortController();
    detailAbortController.current = controller;
    setDetailLoading(true);
    setDetailError("");
    try {
      const payload = await api<Detail>(`/api/admin/security?userId=${encodeURIComponent(userId)}`, { signal: controller.signal });
      if (payload.profile.id !== userId) throw new Error("Dữ liệu bảo mật không khớp với học viên đã chọn. Hãy tải lại.");
      if (requestId === detailRequestId.current && !controller.signal.aborted) setDetail(payload);
    } catch (value) {
      if (controller.signal.aborted) return;
      if (requestId === detailRequestId.current) setDetailError(value instanceof Error ? value.message : "Không thể tải chi tiết.");
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const next = readListState();
      const nextSelectedId = readSelectedUserId();
      detailAbortController.current?.abort();
      detailRequestId.current += 1;
      setDetail(null);
      setDetailError("");
      setPendingAction(null);
      setReasonDraft("");
      setActionError("");
      setSelectedId(nextSelectedId);
      setSearch(next.q);
      setListState(next);
      setListReady(true);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    if (!listReady) return;
    const timeout = window.setTimeout(() => {
      const q = search.trim().slice(0, 100);
      setListState(current => current.q === q ? current : { ...current, q, page: 1 });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [listReady, search]);

  useEffect(() => {
    if (!listReady) return;
    const params = new URLSearchParams(window.location.search);
    if (listState.q) params.set("q", listState.q); else params.delete("q");
    if (listState.status !== "all") params.set("status", listState.status); else params.delete("status");
    if (listState.page !== 1) params.set("page", String(listState.page)); else params.delete("page");
    if (listState.limit !== 20) params.set("limit", String(listState.limit)); else params.delete("limit");
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL-backed list state drives a cancellable remote query
    void loadUsers(listState);
  }, [listReady, listState, loadUsers]);

  useEffect(() => {
    if (selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- selected user drives the remote detail query
      void loadDetail(selectedId);
    }
  }, [loadDetail, selectedId]);

  useEffect(() => {
    const content = pageContentRef.current;
    if (!selectedId || !content) return;
    const previousOverflow = document.body.style.overflow;
    content.inert = true;
    document.body.style.overflow = "hidden";
    return () => {
      content.inert = false;
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedId]);

  useEffect(() => {
    const detailContent = detailContentRef.current;
    if (!detailContent) return;
    detailContent.inert = Boolean(pendingAction);
    return () => {
      detailContent.inert = false;
    };
  }, [pendingAction]);

  useEffect(() => () => {
    listAbortController.current?.abort();
    detailAbortController.current?.abort();
  }, []);

  async function act(targetUserId: string, action: SecurityAction, extra: Record<string, unknown> = {}, reasonOverride = "") {
    if (!targetUserId || selectedId !== targetUserId || detail?.profile.id !== targetUserId) {
      setActionError("Học viên đã chọn đã thay đổi. Hãy mở lại thao tác.");
      return false;
    }
    const reason = reasonOverride.trim().slice(0, 500) || ACTION_COPY[action].defaultReason;
    setBusy(true);
    setActionError("");
    setError("");
    setNotice("");
    try {
      await api("/api/admin/security", { method: "POST", body: JSON.stringify({ action, userId: targetUserId, reason, ...extra }) });
      await Promise.all([loadUsers(listState), loadDetail(targetUserId)]);
      return true;
    } catch (value) {
      setActionError(value instanceof Error ? value.message : "Không thể thực hiện thao tác.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function requestAction(action: SecurityAction, extra: Record<string, unknown> = {}) {
    if (!selectedId || detail?.profile.id !== selectedId || busy || detailLoading) return;
    setActionError("");
    setReasonDraft(ACTION_COPY[action].defaultReason);
    setPendingAction({ action, extra, userId: selectedId, ...ACTION_COPY[action] });
  }

  async function submitPendingAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingAction || busy) return;
    const request = pendingAction;
    const succeeded = await act(request.userId, request.action, request.extra, reasonDraft);
    if (succeeded) {
      closeActionDialog();
      window.requestAnimationFrame(() => setNotice("Đã cập nhật và ghi nhật ký quản trị."));
    }
  }

  function closeActionDialog() {
    if (busy) return;
    setPendingAction(null);
    setReasonDraft("");
    setActionError("");
  }

  function closeDetail() {
    if (busy) return;
    const drawerHistoryOwned = window.history.state?.[SECURITY_DRAWER_STATE_KEY] === selectedId;
    detailAbortController.current?.abort();
    detailRequestId.current += 1;
    setSelectedId("");
    setDetail(null);
    setDetailError("");
    closeActionDialog();
    if (drawerHistoryOwned) window.history.back();
    else window.history.replaceState(window.history.state, "", securityUrlWithSelectedUser(""));
  }

  function openDetail(userId: string) {
    if (busy) return;
    window.history.pushState({ ...window.history.state, [SECURITY_DRAWER_STATE_KEY]: userId }, "", securityUrlWithSelectedUser(userId));
    setDetail(null);
    setDetailError("");
    setSelectedId(userId);
  }

  const pageCount = Math.max(1, Math.ceil(total / listState.limit));
  const firstResult = total ? (listState.page - 1) * listState.limit + 1 : 0;
  const lastResult = total ? Math.min(total, firstResult + users.length - 1) : 0;
  const hasFilters = Boolean(listState.q || listState.status !== "all");
  const selectedUser = users.find(user => user.id === selectedId);

  return <section className="admin-security-page" aria-busy={loading || refreshing || detailLoading || busy}>
    <div ref={pageContentRef} className="security-page-content">
    <header className="security-admin-head"><div><span>BẢO MẬT TÀI KHOẢN</span><h1>Phiên học và thiết bị</h1><p>IP chỉ được lưu dạng băm; vị trí chỉ là tín hiệu phụ, không tự động khóa tài khoản.</p></div><button type="button" onClick={() => void loadUsers(listState)} disabled={loading || refreshing || busy}><RotateCcw aria-hidden="true" /> {loading || refreshing ? "Đang tải…" : "Làm mới"}</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && !selectedId && <p className="form-success" role="status" aria-live="polite">{notice}</p>}
    <div className="security-list-toolbar">
      <label className="security-user-search" htmlFor="security-user-search-input">Tìm học viên<input id="security-user-search-input" name="securitySearch" type="search" autoComplete="off" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tên, mã học viên hoặc email đầy đủ…" /></label>
      <label className="security-status-filter" htmlFor="security-status-filter">Trạng thái<select id="security-status-filter" name="securityStatus" value={listState.status} onChange={event => setListState(current => ({ ...current, status: event.target.value as SecurityStatus, page: 1 }))}><option value="all">Tất cả trạng thái</option><option value="active">Hoạt động</option><option value="temporarily_banned">Tạm khóa</option><option value="permanently_banned">Khóa vĩnh viễn</option><option value="violations">Có vi phạm</option></select></label>
    </div>
    <p className="security-list-status" role="status" aria-live="polite">{loading ? "Đang tải danh sách học viên…" : refreshing ? "Đang cập nhật danh sách…" : total ? `Hiển thị ${firstResult}–${lastResult} trong ${total} học viên.` : hasFilters ? "Không có học viên phù hợp với bộ lọc." : "Chưa có học viên trong danh sách."}</p>
    {loading ? <LoadingIndicator label="Đang tải dữ liệu bảo mật…" /> : users.length ? <div className="security-user-grid">{users.map(user => { const effectiveStatus = effectiveAccountStatus(user, listServerTime); return <button type="button" key={user.id} className={`${effectiveStatus !== "active" ? "flagged " : ""}${selectedId === user.id ? "selected" : ""}`.trim()} aria-pressed={selectedId === user.id} onClick={() => openDetail(user.id)}><span><span className="sr-only">Mở chi tiết bảo mật của </span><b>{user.full_name}</b><small>{user.student_code} · {user.email || "Chưa có email"}</small></span><span className={`security-account-status ${effectiveStatus}`}>{statusLabel(user, listServerTime)}</span><strong>{user.violation_count} vi phạm</strong><ChevronRight aria-hidden="true" /></button>; })}</div> : <div className="security-empty" role="status"><ShieldCheck aria-hidden="true" /><h3>{hasFilters ? "Không tìm thấy học viên" : "Chưa có học viên cần xem xét"}</h3><p>{hasFilters ? "Thử từ khóa khác hoặc xóa các bộ lọc để xem toàn bộ danh sách." : "Danh sách bảo mật sẽ hiển thị khi có tài khoản học viên."}</p>{hasFilters && <button type="button" onClick={() => { setSearch(""); setListState(current => ({ ...current, q: "", status: "all", page: 1 })); }}>Xóa bộ lọc</button>}</div>}
    {!loading && total > 0 && <nav className="security-pagination" aria-label="Phân trang danh sách học viên"><button type="button" onClick={() => setListState(current => ({ ...current, page: Math.max(1, current.page - 1) }))} disabled={listState.page <= 1 || refreshing}>Trang trước</button><span>Trang <b>{listState.page}</b> / {pageCount}</span><label htmlFor="security-page-size">Số dòng<select id="security-page-size" name="securityPageSize" value={listState.limit} onChange={event => setListState(current => ({ ...current, limit: Number(event.target.value), page: 1 }))}><option value="20">20</option><option value="50">50</option></select></label><button type="button" onClick={() => setListState(current => ({ ...current, page: current.page + 1 }))} disabled={!hasNextPage || refreshing}>Trang sau</button></nav>}
    </div>
    {selectedId && <div className="security-detail-shade" role="presentation" onKeyDown={event => { if (event.key === "Escape" && !pendingAction) closeDetail(); }} onMouseDown={event => { if (event.target === event.currentTarget) closeDetail(); }}><aside ref={detailDialogRef} className="security-detail-panel" role="dialog" aria-modal={pendingAction ? undefined : "true"} aria-labelledby="security-detail-title" aria-busy={detailLoading || busy}>
      <div ref={detailContentRef} className="security-detail-content">
      <header><div><span>{detail?.profile.student_code ?? selectedUser?.student_code ?? "Đang tải"}</span><h2 id="security-detail-title">{detail?.profile.full_name ?? selectedUser?.full_name ?? "Chi tiết bảo mật"}</h2><p>{detail?.profile.email ?? selectedUser?.email ?? ""}</p></div><button type="button" onClick={closeDetail} aria-label="Đóng chi tiết bảo mật"><X aria-hidden="true" /></button></header>
      {notice && <p className="form-success security-detail-notice" role="status" aria-live="polite">{notice}</p>}
      {detailLoading && !detail && <p className="security-detail-loading" role="status" aria-live="polite"><LoaderCircle aria-hidden="true" /> Đang tải chi tiết bảo mật…</p>}
      {detailError && <div className="security-detail-error" role="alert"><b>Không thể tải chi tiết</b><p>{detailError}</p><button type="button" onClick={() => void loadDetail(selectedId)}>Thử lại</button></div>}
      {detail && <><div className="security-profile-summary"><div><small>Trạng thái</small><b>{statusLabel(detail.profile, detail.serverTime)}</b></div><div><small>Số vi phạm</small><b>{detail.profile.violation_count}</b></div><div><small>Khóa đến</small><b>{date(detail.profile.banned_until)}</b></div></div>
      {detail.profile.ban_reason && <div className="security-ban-reason"><AlertTriangle aria-hidden="true" /><span><b>Lý do khóa</b><small>{detail.profile.ban_reason}</small></span></div>}
      <div className="security-admin-actions"><button type="button" disabled={busy} onClick={() => requestAction("unban")}><CheckCircle2 aria-hidden="true" />Gỡ khóa</button><button type="button" disabled={busy} onClick={() => requestAction("extend_ban", { durationHours: 24 })}><LockKeyhole aria-hidden="true" />Khóa 24 giờ</button><button type="button" className="danger" disabled={busy} onClick={() => requestAction("permanent_ban")}><LockKeyhole aria-hidden="true" />Khóa vĩnh viễn</button><button type="button" disabled={busy} onClick={() => requestAction("reset_violation_count", { violationCount: Math.max(0, detail.profile.violation_count - 1) })}><RotateCcw aria-hidden="true" />Giảm mức vi phạm</button></div>
      <section><h3>Thiết bị đã ghi nhận ({detail.devices.length}/2)</h3>{detail.devices.length ? detail.devices.map(device => <article className="security-device" key={device.id}><span>{/mobile|android|ios/i.test(`${device.device_name} ${device.operating_system}`) ? <Smartphone aria-hidden="true" /> : <Laptop aria-hidden="true" />}</span><div><b>{device.device_name || "Thiết bị không tên"}</b><small>{device.browser || "Trình duyệt không rõ"} · {device.operating_system || "Hệ điều hành không rõ"}</small><small>Dùng gần nhất: {date(device.last_used_at)}</small></div><i>{device.revoked_at ? "Đã thu hồi" : device.trusted_by_admin ? "Quản trị viên tin cậy" : "Đã ghi nhận"}</i><button type="button" disabled={busy} onClick={() => requestAction(device.revoked_at ? "trust_device" : "revoke_device", { deviceId: device.id })}>{device.revoked_at ? "Tin cậy" : "Thu hồi"}</button></article>) : <p className="muted">Chưa có thiết bị được ghi nhận.</p>}</section>
      <section><h3>Sự kiện gần đây</h3>{detail.events.length ? detail.events.map(event => <article className="security-event" key={event.id}><div><span>{event.event_type}</span><b>Điểm rủi ro {event.risk_score}</b></div><p>{event.reason}</p><small>{date(event.created_at)}{event.distance_km != null ? ` · ${event.distance_km} km` : ""}</small>{event.review_result ? <em>{event.review_result}</em> : <button type="button" disabled={busy} onClick={() => requestAction("mark_false_positive", { eventId: event.id })}>Đánh dấu phát hiện nhầm</button>}</article>) : <p className="muted">Chưa có sự kiện bảo mật.</p>}</section>
      <section><h3>Phiên học gần đây</h3>{detail.sessions.length ? detail.sessions.slice(0, 12).map(session => <article className="security-session" key={session.id}><ShieldCheck aria-hidden="true" /><span><b>{session.activity_type} · {session.city || session.region_code || "Không có vị trí"}</b><small>{date(session.last_seen_at)} · điểm rủi ro {session.risk_score}</small></span><i>{session.revoked_at ? "Đã dừng" : isRecentlyActive(session.last_seen_at, detail.serverTime) ? "Đang hoạt động" : "Không hoạt động"}</i></article>) : <p className="muted">Chưa có phiên học được ghi nhận.</p>}</section></>}
      </div>
      {pendingAction && <div className="security-action-dialog-shade" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeActionDialog(); }}><div ref={actionDialogRef} className="security-action-dialog" role="dialog" aria-modal="true" aria-labelledby="security-action-title" aria-describedby="security-action-description" aria-busy={busy}>
        <form onSubmit={submitPendingAction}>
          <header><div><span className="security-action-kicker">XÁC NHẬN THAO TÁC</span><h2 id="security-action-title">{pendingAction.title}</h2></div><button type="button" onClick={closeActionDialog} aria-label="Đóng hộp thoại xác nhận" disabled={busy}><X aria-hidden="true" /></button></header>
          <p id="security-action-description">{pendingAction.description} Đối tượng: <b>{detail?.profile.full_name ?? selectedUser?.full_name ?? "học viên đã chọn"}</b>.</p>
          <label htmlFor="security-action-reason">Lý do thao tác<textarea id="security-action-reason" data-dialog-autofocus value={reasonDraft} maxLength={500} rows={4} onChange={event => setReasonDraft(event.target.value)} aria-describedby="security-action-reason-help" /></label>
          <small id="security-action-reason-help">Lý do được lưu trong nhật ký quản trị · {reasonDraft.length}/500 ký tự.</small>
          {actionError && <p className="security-action-error" role="alert">{actionError}</p>}
          <div className="security-action-dialog-actions"><button type="button" className="security-action-secondary" onClick={closeActionDialog} disabled={busy}>Hủy</button><button type="submit" className="security-action-primary" disabled={busy}>{busy ? <><LoaderCircle aria-hidden="true" /> Đang lưu…</> : pendingAction.submitLabel}</button></div>
        </form>
      </div></div>}
    </aside></div>}
  </section>;
}
