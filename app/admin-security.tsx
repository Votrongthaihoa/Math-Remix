"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Laptop, LockKeyhole, RotateCcw, ShieldCheck, Smartphone, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import LoadingIndicator from "./loading-indicator";

type SecurityUser = { id: string; full_name: string; student_code: string; email: string; status: string; account_status: string; violation_count: number; banned_at: string | null; banned_until: string | null; ban_reason: string | null; ban_event_id: number | null };
type SecurityDevice = { id: string; device_name?: string | null; browser?: string | null; operating_system?: string | null; trusted_by_admin?: boolean; verified_at?: string | null; last_used_at?: string | null; revoked_at?: string | null };
type SecuritySession = { id: string; activity_type: string; city?: string | null; region_code?: string | null; last_seen_at: string; risk_score: number; revoked_at?: string | null };
type SecurityEvent = { id: number; event_type: string; risk_score: number; reason: string; distance_km?: number | null; created_at: string; review_result?: string | null };
type Detail = { profile: SecurityUser; devices: SecurityDevice[]; sessions: SecuritySession[]; events: SecurityEvent[]; violations: unknown[]; actions: unknown[]; serverTime: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!supabase) throw new Error("Chưa cấu hình Supabase.");
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Phiên đăng nhập đã hết hạn.");
  const response = await fetch(path, { ...init, headers: { ...init?.headers, authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" }, cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Không thể tải dữ liệu bảo mật.");
  return payload;
}

function date(value: string | null | undefined) { return value ? new Date(value).toLocaleString("vi-VN") : "—"; }
function statusLabel(user: SecurityUser) { return user.account_status === "permanently_banned" ? "Khóa vĩnh viễn" : user.account_status === "temporarily_banned" && user.banned_until && new Date(user.banned_until) > new Date() ? "Tạm khóa" : "Hoạt động"; }

export default function AdminSecurity() {
  const [users, setUsers] = useState<SecurityUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true); setError("");
    try { setUsers((await api<{ users: SecurityUser[] }>("/api/admin/security")).users); }
    catch (value) { setError(value instanceof Error ? value.message : "Không thể tải dữ liệu."); }
    finally { setLoading(false); }
  }, []);
  const loadDetail = useCallback(async (userId: string) => {
    setError("");
    try { setDetail(await api<Detail>(`/api/admin/security?userId=${encodeURIComponent(userId)}`)); }
    catch (value) { setError(value instanceof Error ? value.message : "Không thể tải chi tiết."); }
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

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!selectedId) return;
    const defaultReason = action === "unban" ? "Đã xác minh trường hợp hợp lệ." : action === "mark_false_positive" ? "Quản trị viên xác nhận phát hiện nhầm." : "Thao tác quản trị bảo mật.";
    const reason = window.prompt("Lý do thao tác (được lưu trong audit log):", defaultReason);
    if (reason === null) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/admin/security", { method: "POST", body: JSON.stringify({ action, userId: selectedId, reason, ...extra }) });
      setNotice("Đã cập nhật và ghi audit log.");
      await Promise.all([loadUsers(), loadDetail(selectedId)]);
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể thực hiện thao tác."); }
    finally { setBusy(false); }
  }
  function closeDetail() { setSelectedId(""); setDetail(null); }

  const query = search.trim().toLocaleLowerCase("vi");
  const filtered = users.filter(user => !query || `${user.full_name} ${user.student_code} ${user.email}`.toLocaleLowerCase("vi").includes(query));
  return <section className="admin-security-page">
    <header className="security-admin-head"><div><span>BẢO MẬT TÀI KHOẢN</span><h2>Phiên học và thiết bị</h2><p>IP chỉ được lưu dạng băm; vị trí chỉ là tín hiệu phụ, không tự động khóa tài khoản.</p></div><button onClick={() => void loadUsers()}><RotateCcw /> Làm mới</button></header>
    {error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}
    <label className="security-user-search">Tìm học viên<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tên, mã học viên hoặc email…" /></label>
    {loading ? <LoadingIndicator label="Đang tải dữ liệu bảo mật…" /> : <div className="security-user-grid">{filtered.map(user => <button key={user.id} className={user.account_status !== "active" ? "flagged" : ""} onClick={() => setSelectedId(user.id)}><span><b>{user.full_name}</b><small>{user.student_code} · {user.email || "Chưa có email"}</small></span><span className={`security-account-status ${user.account_status}`}>{statusLabel(user)}</span><strong>{user.violation_count} vi phạm</strong><ChevronRight /></button>)}</div>}
    {detail && <div className="security-detail-shade" onMouseDown={event => { if (event.target === event.currentTarget) closeDetail(); }}><aside className="security-detail-panel"><header><div><span>{detail.profile.student_code}</span><h2>{detail.profile.full_name}</h2><p>{detail.profile.email}</p></div><button onClick={closeDetail} aria-label="Đóng"><X /></button></header>
      <div className="security-profile-summary"><div><small>Trạng thái</small><b>{statusLabel(detail.profile)}</b></div><div><small>Số vi phạm</small><b>{detail.profile.violation_count}</b></div><div><small>Khóa đến</small><b>{date(detail.profile.banned_until)}</b></div></div>
      {detail.profile.ban_reason && <div className="security-ban-reason"><AlertTriangle /><span><b>Lý do khóa</b><small>{detail.profile.ban_reason}</small></span></div>}
      <div className="security-admin-actions"><button disabled={busy} onClick={() => void act("unban")}><CheckCircle2 />Gỡ khóa</button><button disabled={busy} onClick={() => void act("extend_ban", { durationHours: 24 })}><LockKeyhole />Khóa 24 giờ</button><button className="danger" disabled={busy} onClick={() => void act("permanent_ban")}><LockKeyhole />Khóa vĩnh viễn</button><button disabled={busy} onClick={() => void act("reset_violation_count", { violationCount: Math.max(0, detail.profile.violation_count - 1) })}><RotateCcw />Giảm mức vi phạm</button></div>
      <section><h3>Thiết bị đã xác minh ({detail.devices.length}/2)</h3>{detail.devices.length ? detail.devices.map(device => <article className="security-device" key={device.id}><span>{/mobile|android|ios/i.test(`${device.device_name} ${device.operating_system}`) ? <Smartphone /> : <Laptop />}</span><div><b>{device.device_name || "Thiết bị không tên"}</b><small>{device.browser} · {device.operating_system}</small><small>Dùng gần nhất: {date(device.last_used_at)}</small></div><i>{device.revoked_at ? "Đã thu hồi" : device.trusted_by_admin ? "Admin tin cậy" : "Đã xác minh"}</i><button disabled={busy} onClick={() => void act(device.revoked_at ? "trust_device" : "revoke_device", { deviceId: device.id })}>{device.revoked_at ? "Tin cậy" : "Thu hồi"}</button></article>) : <p className="muted">Chưa có thiết bị xác minh.</p>}</section>
      <section><h3>Sự kiện gần đây</h3>{detail.events.length ? detail.events.map(event => <article className="security-event" key={event.id}><div><span>{event.event_type}</span><b>Risk {event.risk_score}</b></div><p>{event.reason}</p><small>{date(event.created_at)}{event.distance_km != null ? ` · ${event.distance_km} km` : ""}</small>{event.review_result ? <em>{event.review_result}</em> : <button disabled={busy} onClick={() => void act("mark_false_positive", { eventId: event.id })}>Đánh dấu phát hiện nhầm</button>}</article>) : <p className="muted">Chưa có sự kiện bảo mật.</p>}</section>
      <section><h3>Phiên học gần đây</h3>{detail.sessions.slice(0, 12).map(session => <article className="security-session" key={session.id}><ShieldCheck /><span><b>{session.activity_type} · {session.city || session.region_code || "Không có vị trí"}</b><small>{date(session.last_seen_at)} · risk {session.risk_score}</small></span><i>{session.revoked_at ? "Đã dừng" : new Date(session.last_seen_at).getTime() > new Date(detail.serverTime).getTime() - 120000 ? "Active" : "Không hoạt động"}</i></article>)}</section>
    </aside></div>}
  </section>;
}
