"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Clock3, FileUp, RefreshCw, RotateCcw, ShieldAlert, TimerReset, Upload, Users } from "lucide-react";
import QRCode from "qrcode";
import { authenticatedFetch } from "../lib/auth-client";
import { analyzeExamMonitorEvents, examMonitorEventDuration, examMonitorEventLabel, formatExamMonitorDuration, type ExamMonitorEvent } from "../lib/exam-monitor";
import "./admin-exam-operations.css";
import "./admin-operation-polish.css";

type Slot = { id: string; name: string };
type Attempt = { id: string; kind: "account" | "guest"; candidate_name: string; candidate_code?: string; status: string; score?: number | null; correct_answers?: number | null; total_questions?: number | null; answers?: Record<string, unknown> | null; network_state?: string; time_extension_seconds?: number; monitor_events?: ExamMonitorEvent[] };
type Stats = { total: number; inProgress: number; submitted: number; expired: number; offline: number; autosaveErrors: number; monitorEvents: number; fullscreenExits: number; visibilityEvents: number; focusEvents: number; tabExits: number; suspectedAppSwitches: number; attentionAwaySeconds: number; longestAwaySeconds: number; fullscreenAwaySeconds: number; averageScore?: number | null; completionRate?: number };
type QuestionStat = { id: string; prompt: string; attempted: number; correct: number; accuracy: number };

function answerCount(value: Record<string, unknown> | null | undefined) {
  if (!value) return 0;
  return Object.entries(value).filter(([key, answer]) => {
    if (key === "__exam_section_progress") return false;
    if (Array.isArray(answer)) return answer.some(item => String(item ?? "").trim() !== "");
    return String(answer ?? "").trim() !== "";
  }).length;
}

function OperationMonitorDetails({ events }: { events?: ExamMonitorEvent[] }) {
  const analysis = analyzeExamMonitorEvents(events);
  if (!events?.length) return <>0</>;
  const rows = events.map((event, index) => ({ event, index })).slice(-12);
  return <details className="operation-monitor-details"><summary>{analysis.eventCount} sự kiện · {analysis.suspectedAppSwitches} nghi chuyển tab/ứng dụng</summary><ol><li><b>{analysis.tabExits} lần rời tab · {analysis.fullscreenExits} lần thoát toàn màn hình</b><small>Mất focus {formatExamMonitorDuration(analysis.attentionAwayMs)} · lâu nhất {formatExamMonitorDuration(analysis.longestAttentionAwayMs)}</small></li>{rows.map(({ event, index }) => { const duration = examMonitorEventDuration(events, index); return <li key={`${event.at ?? "event"}-${index}`}><b>{examMonitorEventLabel(event.type)}</b><small>{event.at ? new Date(event.at).toLocaleString("vi-VN") : ""}{duration ? ` · kéo dài ${formatExamMonitorDuration(duration)}` : ""}</small></li>; })}</ol></details>;
}

function csvRows(value: string) {
  const lines = value.split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [] as Array<Record<string, string>>;
  const split = (line: string) => line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(item => item.trim().replace(/^\"|\"$/g, ""));
  const headers = split(lines[0]);
  return lines.slice(1).map(line => Object.fromEntries(split(line).map((item, index) => [headers[index] || `column_${index + 1}`, item])));
}

export default function AdminExamOperations({ examId, slot, shareUrl }: { examId: string; slot: Slot; shareUrl?: string }) {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [questionStats, setQuestionStats] = useState<QuestionStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [candidateText, setCandidateText] = useState("");
  const [candidatePreview, setCandidatePreview] = useState<{ validCount: number; errorCount: number; errors?: Array<{ row: number; message: string }> } | null>(null);
  const [qrData, setQrData] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await authenticatedFetch(`/api/admin/exam-operations?examId=${encodeURIComponent(examId)}&slotId=${encodeURIComponent(slot.id)}`, { cache: "no-store" });
      const payload = await response.json() as { error?: string; attempts?: Attempt[]; stats?: Stats; questionStats?: QuestionStat[] };
      if (!response.ok) throw new Error(payload.error || "Không thể tải giám sát.");
      setAttempts(payload.attempts ?? []); setStats(payload.stats ?? null); setQuestionStats(payload.questionStats ?? []);
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể tải giám sát."); }
    finally { setLoading(false); }
  }, [examId, slot.id]);

  // The first fetch is an intentional synchronization with the admin API;
  // subsequent refreshes are driven by the polling timer below.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 5000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => {
    let active = true;
    if (!shareUrl) {
      // QR state is derived from an external URL and must be cleared when the
      // selected slot no longer has a share URL.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQrData("");
      return () => { active = false; };
    }
    void QRCode.toDataURL(shareUrl, { width: 180, margin: 1, errorCorrectionLevel: "M" }).then(value => { if (active) setQrData(value); }).catch(() => { if (active) setQrData(""); });
    return () => { active = false; };
  }, [shareUrl]);

  async function mutate(body: Record<string, unknown>) {
    const response = await authenticatedFetch("/api/admin/exam-operations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Không thể thực hiện thao tác.");
  }

  async function extend(attempt: Attempt) {
    const reason = window.prompt("Lý do gia hạn thời gian:", "Hỗ trợ thí sinh gặp sự cố kỹ thuật");
    if (!reason) return;
    setBusyId(attempt.id);
    try { await mutate({ action: "extend_time", examId, attemptId: attempt.id, attemptKind: attempt.kind, extensionSeconds: 300, reason }); setNotice("Đã cộng 5 phút cho lượt thi."); await load(); }
    catch (value) { setError(value instanceof Error ? value.message : "Không thể gia hạn."); }
    finally { setBusyId(""); }
  }

  async function retry(attempt: Attempt) {
    const reason = window.prompt("Lý do cấp lượt thi lại:", "Thí sinh cần làm lại do sự cố");
    if (!reason) return;
    setBusyId(attempt.id);
    try { await mutate({ action: "grant_retry", examId, attemptId: attempt.id, attemptKind: attempt.kind, additionalAttempts: 1, reason }); setNotice("Đã cấp thêm một lượt thi."); }
    catch (value) { setError(value instanceof Error ? value.message : "Không thể cấp lượt thi lại."); }
    finally { setBusyId(""); }
  }

  async function previewCandidates() {
    const rows = csvRows(candidateText);
    try {
      const response = await authenticatedFetch("/api/admin/exam-candidates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "preview", examId, slotId: slot.id, rows }) });
      const payload = await response.json() as { error?: string; validCount?: number; errorCount?: number; errors?: Array<{ row: number; message: string }> };
      if (!response.ok) throw new Error(payload.error || "Không thể kiểm tra file.");
      setCandidatePreview({ validCount: payload.validCount ?? 0, errorCount: payload.errorCount ?? 0, errors: payload.errors });
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể kiểm tra file."); }
  }

  async function importCandidates() {
    const rows = csvRows(candidateText);
    try {
      const response = await authenticatedFetch("/api/admin/exam-candidates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "import", examId, slotId: slot.id, rows }) });
      const payload = await response.json() as { error?: string; imported?: number };
      if (!response.ok) throw new Error(payload.error || "Không thể import danh sách.");
      setNotice(`Đã import ${payload.imported ?? 0} thí sinh.`); setCandidateText(""); setCandidatePreview(null);
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể import danh sách."); }
  }

  const visibleAttempts = useMemo(() => attempts.slice().sort((left, right) => String(left.candidate_name).localeCompare(String(right.candidate_name), "vi")), [attempts]);
  return <section className="access-panel access-operations-panel" aria-labelledby="live-monitoring-title">
    <div className="access-panel-head"><div><span className="editor-eyebrow">THEO DÕI ĐỢT THI</span><h2 id="live-monitoring-title">{slot.name}</h2></div><button type="button" className="workspace-button ghost" onClick={() => void load()}><RefreshCw aria-hidden="true"/>Làm mới</button></div>
    {error && <p className="admin-access-error" role="alert">{error}</p>}{notice && <p className="admin-access-notice" role="status" aria-live="polite">{notice}</p>}
    <div className="operation-stats">{[
      { Icon: Users, label: "Tổng", value: stats?.total ?? 0 }, { Icon: Activity, label: "Đang thi", value: stats?.inProgress ?? 0 }, { Icon: TimerReset, label: "Đã nộp", value: stats?.submitted ?? 0 }, { Icon: Clock3, label: "Hết hạn", value: stats?.expired ?? 0 }, { Icon: ShieldAlert, label: "Sự kiện", value: stats?.monitorEvents ?? 0 }, { Icon: ShieldAlert, label: "Nghi chuyển tab/app", value: stats?.suspectedAppSwitches ?? 0 }, { Icon: Activity, label: "Rời tab", value: stats?.tabExits ?? 0 }, { Icon: ShieldAlert, label: "Thoát full", value: stats?.fullscreenExits ?? 0 }, { Icon: Clock3, label: "Mất focus", value: formatExamMonitorDuration((stats?.attentionAwaySeconds ?? 0) * 1_000) }, { Icon: Activity, label: "Offline", value: stats?.offline ?? 0 }, { Icon: RotateCcw, label: "Autosave lỗi", value: stats?.autosaveErrors ?? 0 }, { Icon: Activity, label: "Điểm TB", value: stats?.averageScore === null || stats?.averageScore === undefined ? "—" : stats.averageScore }, { Icon: TimerReset, label: "Hoàn thành", value: `${stats?.completionRate ?? 0}%` },
    ].map(({ Icon, label, value }) => <div key={label}><Icon/><span><small>{label}</small><b>{String(value)}</b></span></div>)}</div>
    {questionStats.length > 0 && <details className="operation-item-analysis"><summary><span><Activity aria-hidden="true" /> Phân tích câu hỏi</span><small>{questionStats.length} câu có dữ liệu</small></summary><div className="operation-item-analysis-list">{questionStats.slice(0, 12).map((question, index) => <div key={question.id}><span><b>Câu {index + 1}</b><small>{question.prompt}</small></span><strong>{question.accuracy}%</strong><em>{question.correct}/{question.attempted}</em></div>)}</div></details>}
    {loading && !attempts.length ? <p className="access-empty">Đang tải dữ liệu giám sát…</p> : visibleAttempts.length ? <div className="access-table-wrap"><table><thead><tr><th>Thí sinh</th><th>SBD</th><th>Trạng thái</th><th>Mạng</th><th>Tiến độ</th><th>Giám sát</th><th>Thao tác</th></tr></thead><tbody>{visibleAttempts.map(attempt => <tr key={`${attempt.kind}-${attempt.id}`}><td><b>{attempt.candidate_name}</b><small>{attempt.kind === "guest" ? "Link kíp" : "Tài khoản"}</small></td><td>{attempt.candidate_code || "—"}</td><td>{attempt.status}</td><td>{attempt.network_state || "online"}</td><td>{answerCount(attempt.answers)}/{attempt.total_questions ?? 0}</td><td><OperationMonitorDetails events={attempt.monitor_events} /></td><td><button className="operation-action" disabled={busyId === attempt.id || attempt.status !== "in_progress"} onClick={() => void extend(attempt)}>+5 phút</button><button className="operation-action" disabled={busyId === attempt.id} onClick={() => void retry(attempt)}><RotateCcw/>Thi lại</button></td></tr>)}</tbody></table></div> : <p className="access-empty">Chưa có lượt thi trong kíp.</p>}
    <div className="operation-import"><div><span className="editor-eyebrow">NGƯỜI THAM GIA</span><h3>Nhập danh sách người tham gia</h3><p>Kiểm tra dữ liệu trước khi nhập. Các dòng lỗi sẽ được liệt kê và không được nhập một phần.</p></div><label htmlFor="candidate-csv-input">Dán CSV <textarea id="candidate-csv-input" name="candidateCsv" spellCheck={false} value={candidateText} onChange={event => setCandidateText(event.target.value)} placeholder="candidate_code,full_name,class_name,school\nA001,Nguyen Van A,12A1,THPT…" rows={5}/></label><div><button type="button" className="workspace-button ghost" disabled={!candidateText.trim()} onClick={() => void previewCandidates()}><FileUp aria-hidden="true"/>Kiểm tra</button><button type="button" className="workspace-button primary" disabled={!candidatePreview || Boolean(candidatePreview.errorCount)} onClick={() => void importCandidates()}><Upload aria-hidden="true"/>Nhập dữ liệu</button></div>{candidatePreview && <small role="status" aria-live="polite">Hợp lệ: {candidatePreview.validCount} · Lỗi: {candidatePreview.errorCount}{candidatePreview.errors?.slice(0, 3).map(error => ` · dòng ${error.row}: ${error.message}`)}</small>}</div>
    {shareUrl && <div className="operation-qr">{qrData && <img src={qrData} alt="QR tham gia kíp thi" width={180} height={180}/>}<div><span className="editor-eyebrow">THAM GIA KÍP</span><h3>Link mới nhất</h3><code>{shareUrl}</code><p>QR không chứa mật khẩu. Hãy dùng QR này trong thời gian link còn hiệu lực.</p><a href={shareUrl} target="_blank" rel="noreferrer">Mở link</a></div></div>}
  </section>;
}
