"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, CalendarClock, CheckCircle2, ClipboardCheck, Clock3, ExternalLink, Link2, RefreshCw, Search, ShieldAlert, TimerReset, TrendingUp, UserRound, Users } from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import LoadingIndicator from "./loading-indicator";
import "./admin-session-results.css";

type SessionMode = "account" | "link_qr" | "both";
type AttemptKind = "account" | "guest";
type Attempt = {
  id: string;
  kind: AttemptKind;
  candidate_name: string;
  candidate_code?: string;
  guest_identity?: Record<string, string> | null;
  status: string;
  score?: number | null;
  correct_answers?: number | null;
  total_questions?: number | null;
  answers?: Record<string, unknown> | null;
  network_state?: string | null;
  monitor_events?: Array<{ type?: string; at?: string }>;
  started_at?: string | null;
  submitted_at?: string | null;
  duration_seconds?: number | null;
};
type Stats = { total: number; inProgress: number; submitted: number; expired: number; offline: number; autosaveErrors: number; monitorEvents: number; fullscreenExits: number; visibilityEvents: number; focusEvents: number; averageScore?: number | null; completionRate?: number };
type QuestionStat = { id: string; prompt: string; attempted: number; correct: number; accuracy: number };
type SessionMeta = { id: string; name: string; mode: SessionMode; examTitle: string; examType: string; roomId: string; startsAt: string | null; endsAt: string | null; enabled: boolean; resultsReleasedAt: string | null; tokenHint: string | null };
type ResultsPayload = { session?: SessionMeta; attempts?: Attempt[]; stats?: Stats; questionStats?: QuestionStat[]; error?: string };

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Chưa đặt";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date) : "Chưa đặt";
}

function answerCount(answers: Record<string, unknown> | null | undefined) {
  if (!answers) return 0;
  return Object.entries(answers).filter(([key, answer]) => {
    if (key === "__exam_section_progress") return false;
    if (Array.isArray(answer)) return answer.some(item => String(item ?? "").trim() !== "");
    return String(answer ?? "").trim() !== "";
  }).length;
}

function modeLabel(mode: SessionMode) {
  return mode === "account" ? "Tài khoản học viên" : mode === "both" ? "Tài khoản + Link/QR" : "Link / QR";
}

function attemptStatusLabel(status: string) {
  switch (status) {
    case "in_progress": return "Đang làm";
    case "submitted":
    case "completed":
    case "graded": return "Đã nộp";
    case "expired": return "Hết giờ";
    default: return status || "Chưa rõ";
  }
}

function statusClass(status: string) {
  if (status === "in_progress") return "live";
  if (status === "expired") return "warning";
  if (["submitted", "completed", "graded"].includes(status)) return "done";
  return "neutral";
}

function monitorLabel(type: string) {
  const labels: Record<string, string> = {
    visibility_hidden: "Rời tab",
    visibility_visible: "Quay lại tab",
    fullscreen_exit: "Thoát toàn màn hình",
    fullscreen_enter: "Vào toàn màn hình",
    window_blur: "Mất focus",
    window_focus: "Có focus",
    copy: "Sao chép",
    paste: "Dán",
    cut: "Cắt",
    context_menu: "Menu chuột phải",
  };
  return (labels[type] ?? type) || "Sự kiện";
}

function guestClass(attempt: Attempt) {
  const identity = attempt.guest_identity ?? {};
  return identity.class_name || identity.class || "";
}

function StatCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Users; label: string; value: string | number; detail: string; tone: string }) {
  return <article className={`admin-session-results-stat ${tone}`}><span className="admin-session-results-stat-icon"><Icon aria-hidden="true" /></span><div><small>{label}</small><strong>{value}</strong><span>{detail}</span></div></article>;
}

export default function AdminSessionResults({ navigate }: { navigate: (path: string) => void }) {
  const [params] = useState(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search));
  const examId = params.get("examId") ?? "";
  const slotId = params.get("slotId") ?? "";
  const mode = (params.get("mode") === "both" ? "both" : params.get("mode") === "account" ? "account" : "link_qr") as SessionMode;
  const [session, setSession] = useState<SessionMeta | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [questionStats, setQuestionStats] = useState<QuestionStat[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [releasingResults, setReleasingResults] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const releaseInFlight = useRef(false);
  const deferredQuery = useDeferredValue(query);

  const load = useCallback(async () => {
    if (!examId) {
      setError("Thiếu mã đề thi để mở kết quả kíp.");
      setLoading(false);
      return;
    }
    setRefreshing(true);
    setError("");
    try {
      const queryString = `/api/admin/exam-operations?examId=${encodeURIComponent(examId)}${slotId ? `&slotId=${encodeURIComponent(slotId)}` : ""}${mode === "both" ? "&includeAccount=true" : ""}`;
      const response = await authenticatedFetch(queryString, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as ResultsPayload;
      if (!response.ok) throw new Error(payload.error || "Không thể tải kết quả kíp thi.");
      setSession(payload.session ?? null);
      setAttempts(payload.attempts ?? []);
      setStats(payload.stats ?? null);
      setQuestionStats(payload.questionStats ?? []);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể tải kết quả kíp thi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [examId, mode, slotId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (mode !== "both" && mode !== "link_qr") return;
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load, mode]);

  async function releaseResults() {
    if (releaseInFlight.current) return;
    if (!slotId) {
      navigate(`/admin/exams/${encodeURIComponent(examId)}/policy`);
      return;
    }
    releaseInFlight.current = true;
    setReleasingResults(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/admin/exam-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "release_results", examId, slotId }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Không thể công bố kết quả.");
      setNotice("Đã công bố kết quả cho kíp thi.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể công bố kết quả.");
    } finally {
      releaseInFlight.current = false;
      setReleasingResults(false);
    }
  }

  const filteredAttempts = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("vi");
    return attempts
      .filter(attempt => statusFilter === "all" || attempt.status === statusFilter)
      .filter(attempt => !normalizedQuery || `${attempt.candidate_name} ${attempt.candidate_code ?? ""} ${guestClass(attempt)}`.toLocaleLowerCase("vi").includes(normalizedQuery))
      .slice()
      .sort((left, right) => String(left.candidate_name).localeCompare(String(right.candidate_name), "vi"));
  }, [attempts, deferredQuery, statusFilter]);

  const managePath = mode === "account"
    ? `/admin/exams/${encodeURIComponent(examId)}/policy`
    : `/admin/exams/${encodeURIComponent(examId)}/access${slotId ? `?slotId=${encodeURIComponent(slotId)}` : ""}`;
  const wizardPath = `/admin/sessions/new?roomId=${encodeURIComponent(session?.roomId ?? "")}&examId=${encodeURIComponent(examId)}`;
  const currentMode = session?.mode ?? mode;
  const displayStats = stats ?? { total: 0, inProgress: 0, submitted: 0, expired: 0, offline: 0, autosaveErrors: 0, monitorEvents: 0, fullscreenExits: 0, visibilityEvents: 0, focusEvents: 0, averageScore: null, completionRate: 0 };

  if (loading && !session) return <div className="admin-session-results-loading"><LoadingIndicator label="Đang tải kết quả kíp thi…" /></div>;

  return <div className="admin-session-results">
    <header className="admin-session-results-header">
      <div className="admin-session-results-heading">
        <button type="button" className="admin-session-results-back" onClick={() => navigate("/admin/sessions")}><ArrowLeft aria-hidden="true" />Danh sách kíp thi</button>
        <span className="admin-session-results-kicker">KẾT QUẢ KÍP THI</span>
        <h1>{session?.name ?? "Kết quả kíp thi"}</h1>
        <p>{session?.examTitle ?? "Đề thi"} · {modeLabel(currentMode)}{session?.startsAt ? ` · ${formatDateTime(session.startsAt)} – ${formatDateTime(session.endsAt)}` : ""}</p>
      </div>
      <div className="admin-session-results-header-actions">
        <button type="button" className="admin-session-results-secondary" onClick={() => void load()} disabled={refreshing}><RefreshCw aria-hidden="true" />{refreshing ? "Đang tải…" : "Làm mới"}</button>
        <button type="button" className="admin-session-results-secondary" onClick={() => navigate(managePath)}><ExternalLink aria-hidden="true" />Quản lý kíp</button>
        <button type="button" className="admin-session-results-primary" onClick={() => navigate(wizardPath)}><CalendarClock aria-hidden="true" />Tạo kíp khác</button>
      </div>
    </header>

    {error && <div className="admin-session-results-alert" role="alert"><ShieldAlert aria-hidden="true" /><span>{error}</span><button type="button" onClick={() => void load()}>Thử lại</button></div>}
    {notice && <div className="admin-session-results-notice" role="status" aria-live="polite"><CheckCircle2 aria-hidden="true" />{notice}</div>}

    <section className="admin-session-results-overview" aria-labelledby="session-overview-title">
      <div className="admin-session-results-section-heading"><div><span className="admin-session-results-kicker">TỔNG QUAN KÍP THI</span><h2 id="session-overview-title">Tình hình tham gia</h2></div><span className="admin-session-results-mode"><span aria-hidden="true">{currentMode === "account" ? <UserRound /> : currentMode === "both" ? <ClipboardCheck /> : <Link2 />}</span>{modeLabel(currentMode)}</span></div>
      <div className="admin-session-results-stat-grid">
        <StatCard icon={Users} label="Người tham gia" value={displayStats.total} detail={`${displayStats.submitted} đã nộp`} tone="blue" />
        <StatCard icon={TimerReset} label="Đã nộp bài" value={displayStats.submitted} detail={`${displayStats.completionRate ?? 0}% hoàn thành`} tone="green" />
        <StatCard icon={Clock3} label="Đang làm" value={displayStats.inProgress} detail={`${displayStats.expired} lượt hết giờ`} tone="amber" />
        <StatCard icon={TrendingUp} label="Điểm trung bình" value={displayStats.averageScore ?? "—"} detail={`${displayStats.offline} lượt có offline`} tone="purple" />
      </div>
    </section>

    <div className="admin-session-results-layout">
      <section className="admin-session-results-panel admin-session-results-participants" aria-labelledby="participants-title" aria-busy={loading || refreshing}>
        <div className="admin-session-results-panel-head"><div><span className="admin-session-results-kicker">DANH SÁCH BÀI LÀM</span><h2 id="participants-title">Người tham gia</h2><p>Chỉ hiển thị dữ liệu vận hành của kíp; đáp án và lời giải không nằm ở trang này.</p></div><span className="admin-session-results-count">{filteredAttempts.length}/{attempts.length}</span></div>
        <div className="admin-session-results-filters"><label className="admin-session-results-search"><Search aria-hidden="true" /><span className="sr-only">Tìm người tham gia</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm tên, mã hoặc lớp…" /></label><label className="admin-session-results-select"><span className="sr-only">Lọc trạng thái</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Tất cả trạng thái</option><option value="in_progress">Đang làm</option><option value="submitted">Đã nộp</option><option value="completed">Hoàn thành</option><option value="graded">Đã chấm</option><option value="expired">Hết giờ</option></select></label></div>
        {loading && !attempts.length ? <div className="admin-session-results-empty"><LoadingIndicator label="Đang tải người tham gia…" /></div> : filteredAttempts.length ? <div className="admin-session-results-participant-list" role="list">{filteredAttempts.map(attempt => <article className="admin-session-results-participant" role="listitem" key={`${attempt.kind}-${attempt.id}`}><div className="admin-session-results-participant-identity"><span className="admin-session-results-avatar">{attempt.kind === "account" ? <UserRound aria-hidden="true" /> : <Link2 aria-hidden="true" />}</span><div><b>{attempt.candidate_name || "Thí sinh"}</b><span>{attempt.candidate_code || (attempt.kind === "guest" ? "Người tham gia qua link" : "Tài khoản học viên")}{guestClass(attempt) ? ` · ${guestClass(attempt)}` : ""}</span></div></div><div className="admin-session-results-participant-progress"><small>Tiến độ</small><b>{answerCount(attempt.answers)}/{attempt.total_questions ?? 0} câu</b><span><i style={{ width: `${attempt.total_questions ? Math.min(100, Math.round(answerCount(attempt.answers) / attempt.total_questions * 100)) : 0}%` }} /></span></div><div className="admin-session-results-participant-score"><small>Điểm</small><b>{attempt.score ?? "—"}</b><span>{attempt.correct_answers ?? 0}/{attempt.total_questions ?? 0} đúng</span></div><div className="admin-session-results-participant-status"><span className={`admin-session-results-status ${statusClass(attempt.status)}`}><i aria-hidden="true" />{attemptStatusLabel(attempt.status)}</span><small>{attempt.submitted_at ? `Nộp ${formatDateTime(attempt.submitted_at)}` : attempt.started_at ? `Bắt đầu ${formatDateTime(attempt.started_at)}` : "Chưa có thời gian"}</small></div>{attempt.monitor_events?.length ? <details className="admin-session-results-monitor"><summary><Activity aria-hidden="true" />{attempt.monitor_events.length} sự kiện</summary><ul>{attempt.monitor_events.slice(-8).map((event, index) => <li key={`${event.at ?? "event"}-${index}`}>{monitorLabel(String(event.type ?? "unknown"))}<small>{event.at ? formatDateTime(event.at) : ""}</small></li>)}</ul></details> : <span className="admin-session-results-no-monitor">Không có cảnh báo</span>}</article>)}</div> : <div className="admin-session-results-empty"><Users aria-hidden="true" /><h3>{query || statusFilter !== "all" ? "Không có người phù hợp" : "Chưa có lượt tham gia"}</h3><p>{query || statusFilter !== "all" ? "Hãy thử từ khóa hoặc trạng thái khác." : "Dữ liệu sẽ xuất hiện khi học viên bắt đầu hoặc nộp bài."}</p></div>}
      </section>

      <aside className="admin-session-results-side">
        <section className="admin-session-results-panel admin-session-results-session-card" aria-busy={releasingResults}><div className="admin-session-results-panel-head"><div><span className="admin-session-results-kicker">THÔNG TIN KÍP</span><h2>Trạng thái vận hành</h2></div><CalendarClock aria-hidden="true" /></div><dl><div><dt>Trạng thái</dt><dd><span className={`admin-session-results-status ${session?.enabled === false ? "warning" : "live"}`}><i aria-hidden="true" />{session?.enabled === false ? "Đã khóa" : "Đang theo dõi"}</span></dd></div><div><dt>Mở kíp</dt><dd>{formatDateTime(session?.startsAt)}</dd></div><div><dt>Kết thúc</dt><dd>{formatDateTime(session?.endsAt)}</dd></div><div><dt>Kết quả</dt><dd>{session?.resultsReleasedAt ? "Đã công bố" : "Chưa công bố"}</dd></div></dl><div className="admin-session-results-side-actions"><button type="button" className="admin-session-results-primary" onClick={() => void releaseResults()} disabled={Boolean(session?.resultsReleasedAt) || releasingResults}>{releasingResults ? "Đang công bố…" : session?.resultsReleasedAt ? "Đã công bố kết quả" : "Công bố kết quả"}</button></div></section>
        <section className="admin-session-results-panel admin-session-results-analysis"><div className="admin-session-results-panel-head"><div><span className="admin-session-results-kicker">PHÂN TÍCH CÂU HỎI</span><h2>Câu cần xem lại</h2></div><Activity aria-hidden="true" /></div>{questionStats.length ? <div className="admin-session-results-question-list">{questionStats.slice(0, 8).map((question, index) => <div className="admin-session-results-question" key={question.id}><div><b>Câu {index + 1}</b><span title={question.prompt}>{question.prompt}</span></div><strong>{question.accuracy}%</strong><span className="admin-session-results-question-bar"><i style={{ width: `${question.accuracy}%` }} /></span><small>{question.correct}/{question.attempted} lượt đúng</small></div>)}</div> : <p className="admin-session-results-muted">Chưa đủ dữ liệu để phân tích câu hỏi.</p>}</section>
        <section className="admin-session-results-panel admin-session-results-signal"><ShieldAlert aria-hidden="true" /><div><b>Giám sát kỹ thuật</b><p>{displayStats.monitorEvents ? `${displayStats.monitorEvents} sự kiện được ghi nhận · ${displayStats.fullscreenExits} lần thoát toàn màn hình.` : "Chưa ghi nhận sự kiện giám sát."}</p><small>Dữ liệu chỉ là tín hiệu để giáo viên xem lại, không tự động kết luận vi phạm.</small></div></section>
      </aside>
    </div>
  </div>;
}
