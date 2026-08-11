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

function statusLabel(user: SecurityUser) {
  if (user.account_status === "permanently_banned") return "Khóa vĩnh viễn";
  if (user.account_status === "temporarily_banned") {
    const until = user.banned_until ? new Date(user.banned_until) : null;
    if (!until || Number.isNaN(until.getTime()) || until > new Date()) return "Tạm khóa";
  }
  return "Hoạt động";
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
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const detailRequestId = useRef(0);
  const detailAbortController = useRef<AbortController | null>(null);
  const detailDialogRef = useAdminDialogFocus<HTMLElement>(Boolean(detail) && !pendingAction, closeDetail);
  const actionDialogRef = useAdminDialogFocus<HTMLDivElement>(Boolean(pendingAction), closeActionDialog);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await api<{ users?: SecurityUser[] }>("/api/admin/security");
      setUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (userId: string) => {
    const requestId = ++detailRequestId.current;
    detailAbortController.current?.abort();
    const controller = new AbortController();
    detailAbortController.current = controller;
    setDetailLoading(true);
    setError("");
    try {
      const payload = await api<Detail>(`/api/admin/security?userId=${encodeURIComponent(userId)}`, { signal: controller.signal });
      if (payload.profile.id !== userId) throw new Error("Dữ liệu bảo mật không khớp với học viên đã chọn. Hãy tải lại.");
      if (requestId === detailRequestId.current && !controller.signal.aborted) setDetail(payload);
    } catch (value) {
      if (controller.signal.aborted) return;
      if (requestId === detailRequestId.current) setError(value instanceof Error ? value.message : "Không thể tải chi tiết.");
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote data load
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- selected user drives the remote detail query
      void loadDetail(selectedId);
    }
  }, [loadDetail, selectedId]);

  useEffect(() => () => detailAbortController.current?.abort(), []);

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
      setNotice("Đã cập nhật và ghi nhật ký quản trị.");
      await Promise.all([loadUsers(), loadDetail(targetUserId)]);
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
    if (succeeded) closeActionDialog();
  }

  function closeActionDialog() {
    if (busy) return;
    setPendingAction(null);
    setReasonDraft("");
    setActionError("");
  }

  function closeDetail() {
    if (busy) return;
    detailAbortController.current?.abort();
    detailRequestId.current += 1;
    setSelectedId("");
    setDetail(null);
    closeActionDialog();
  }

  const query = search.trim().toLocaleLowerCase("vi");
  const filtered = users.filter(user => !query || `${user.full_name} ${user.student_code} ${user.email}`.toLocaleLowerCase("vi").includes(query));

  return <section className="admin-security-page" aria-busy={loading || detailLoading || busy}>
    <header className="security-admin-head"><div><span>BẢO MẬT TÀI KHOẢN</span><h2>Phiên học và thiết bị</h2><p>IP chỉ được lưu dạng băm; vị trí chỉ là tín hiệu phụ, không tự động khóa tài khoản.</p></div><button type="button" onClick={() => void loadUsers()} disabled={loading || busy}><RotateCcw aria-hidden="true" /> {loading ? "Đang tải" : "Làm mới"}</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status" aria-live="polite">{notice}</p>}
    <label className="security-user-search" htmlFor="security-user-search-input">Tìm học viên<input id="security-user-search-input" name="securitySearch" type="search" autoComplete="off" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tên, mã học viên hoặc email…" /></label>
    {loading ? <LoadingIndicator label="Đang tải dữ liệu bảo mật…" /> : filtered.length ? <div className="security-user-grid">{filtered.map(user => <button type="button" key={user.id} className={user.account_status !== "active" ? "flagged" : ""} onClick={() => { setDetail(null); setSelectedId(user.id); }} aria-label={`Mở chi tiết bảo mật của ${user.full_name}`}><span><b>{user.full_name}</b><small>{user.student_code} · {user.email || "Chưa có email"}</small></span><span className={`security-account-status ${user.account_status}`}>{statusLabel(user)}</span><strong>{user.violation_count} vi phạm</strong><ChevronRight aria-hidden="true" /></button>)}</div> : <div className="security-empty" role="status"><ShieldCheck aria-hidden="true" /><h3>{query ? "Không tìm thấy học viên" : "Chưa có học viên cần xem xét"}</h3><p>{query ? "Thử từ khóa khác hoặc xóa bộ lọc tìm kiếm." : "Danh sách bảo mật sẽ hiển thị khi có tài khoản học viên."}</p></div>}
    {detail && <div className="security-detail-shade" role="presentation" onKeyDown={event => { if (event.key === "Escape" && !pendingAction) closeDetail(); }} onMouseDown={event => { if (event.target === event.currentTarget) closeDetail(); }}><aside ref={detailDialogRef} className="security-detail-panel" role="dialog" aria-modal={pendingAction ? undefined : "true"} aria-labelledby="security-detail-title" aria-busy={detailLoading || busy}>
      <header><div><span>{detail.profile.student_code}</span><h2 id="security-detail-title">{detail.profile.full_name}</h2><p>{detail.profile.email}</p></div><button type="button" onClick={closeDetail} aria-label="Đóng chi tiết bảo mật"><X aria-hidden="true" /></button></header>
      {detailLoading && <p className="security-detail-loading" role="status" aria-live="polite"><LoaderCircle aria-hidden="true" /> Đang cập nhật dữ liệu…</p>}
      <div className="security-profile-summary"><div><small>Trạng thái</small><b>{statusLabel(detail.profile)}</b></div><div><small>Số vi phạm</small><b>{detail.profile.violation_count}</b></div><div><small>Khóa đến</small><b>{date(detail.profile.banned_until)}</b></div></div>
      {detail.profile.ban_reason && <div className="security-ban-reason"><AlertTriangle aria-hidden="true" /><span><b>Lý do khóa</b><small>{detail.profile.ban_reason}</small></span></div>}
      <div className="security-admin-actions"><button type="button" disabled={busy} onClick={() => requestAction("unban")}><CheckCircle2 aria-hidden="true" />Gỡ khóa</button><button type="button" disabled={busy} onClick={() => requestAction("extend_ban", { durationHours: 24 })}><LockKeyhole aria-hidden="true" />Khóa 24 giờ</button><button type="button" className="danger" disabled={busy} onClick={() => requestAction("permanent_ban")}><LockKeyhole aria-hidden="true" />Khóa vĩnh viễn</button><button type="button" disabled={busy} onClick={() => requestAction("reset_violation_count", { violationCount: Math.max(0, detail.profile.violation_count - 1) })}><RotateCcw aria-hidden="true" />Giảm mức vi phạm</button></div>
      <section><h3>Thiết bị đã ghi nhận ({detail.devices.length}/2)</h3>{detail.devices.length ? detail.devices.map(device => <article className="security-device" key={device.id}><span>{/mobile|android|ios/i.test(`${device.device_name} ${device.operating_system}`) ? <Smartphone aria-hidden="true" /> : <Laptop aria-hidden="true" />}</span><div><b>{device.device_name || "Thiết bị không tên"}</b><small>{device.browser || "Trình duyệt không rõ"} · {device.operating_system || "Hệ điều hành không rõ"}</small><small>Dùng gần nhất: {date(device.last_used_at)}</small></div><i>{device.revoked_at ? "Đã thu hồi" : device.trusted_by_admin ? "Quản trị viên tin cậy" : "Đã ghi nhận"}</i><button type="button" disabled={busy} onClick={() => requestAction(device.revoked_at ? "trust_device" : "revoke_device", { deviceId: device.id })}>{device.revoked_at ? "Tin cậy" : "Thu hồi"}</button></article>) : <p className="muted">Chưa có thiết bị được ghi nhận.</p>}</section>
      <section><h3>Sự kiện gần đây</h3>{detail.events.length ? detail.events.map(event => <article className="security-event" key={event.id}><div><span>{event.event_type}</span><b>Điểm rủi ro {event.risk_score}</b></div><p>{event.reason}</p><small>{date(event.created_at)}{event.distance_km != null ? ` · ${event.distance_km} km` : ""}</small>{event.review_result ? <em>{event.review_result}</em> : <button type="button" disabled={busy} onClick={() => requestAction("mark_false_positive", { eventId: event.id })}>Đánh dấu phát hiện nhầm</button>}</article>) : <p className="muted">Chưa có sự kiện bảo mật.</p>}</section>
      <section><h3>Phiên học gần đây</h3>{detail.sessions.slice(0, 12).map(session => <article className="security-session" key={session.id}><ShieldCheck aria-hidden="true" /><span><b>{session.activity_type} · {session.city || session.region_code || "Không có vị trí"}</b><small>{date(session.last_seen_at)} · điểm rủi ro {session.risk_score}</small></span><i>{session.revoked_at ? "Đã dừng" : isRecentlyActive(session.last_seen_at, detail.serverTime) ? "Đang hoạt động" : "Không hoạt động"}</i></article>)}</section>
      {pendingAction && <div className="security-action-dialog-shade" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeActionDialog(); }}><div ref={actionDialogRef} className="security-action-dialog" role="dialog" aria-modal="true" aria-labelledby="security-action-title" aria-describedby="security-action-description" aria-busy={busy}>
        <form onSubmit={submitPendingAction}>
          <header><div><span className="security-action-kicker">XÁC NHẬN THAO TÁC</span><h2 id="security-action-title">{pendingAction.title}</h2></div><button type="button" onClick={closeActionDialog} aria-label="Đóng hộp thoại xác nhận" disabled={busy}><X aria-hidden="true" /></button></header>
          <p id="security-action-description">{pendingAction.description} Đối tượng: <b>{detail.profile.full_name}</b>.</p>
          <label htmlFor="security-action-reason">Lý do thao tác<textarea id="security-action-reason" data-dialog-autofocus value={reasonDraft} maxLength={500} rows={4} onChange={event => setReasonDraft(event.target.value)} aria-describedby="security-action-reason-help" /></label>
          <small id="security-action-reason-help">Lý do được lưu trong nhật ký quản trị · {reasonDraft.length}/500 ký tự.</small>
          {actionError && <p className="security-action-error" role="alert">{actionError}</p>}
          <div className="security-action-dialog-actions"><button type="button" className="security-action-secondary" onClick={closeActionDialog} disabled={busy}>Hủy</button><button type="submit" className="security-action-primary" disabled={busy}>{busy ? <><LoaderCircle aria-hidden="true" /> Đang lưu…</> : pendingAction.submitLabel}</button></div>
        </form>
      </div></div>}
    </aside></div>}
  </section>;
}
