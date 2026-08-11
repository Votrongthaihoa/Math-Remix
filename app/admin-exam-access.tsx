"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, Check, ClipboardList, Copy, Download, Eye, Link2, Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import { normalizeExamType } from "../lib/exam-config";
import { identityDisplayName } from "../lib/guest-identity";
import { analyzeExamMonitorEvents, examMonitorEventDuration, examMonitorEventLabel, formatExamMonitorDuration, type ExamMonitorEvent } from "../lib/exam-monitor";
import LoadingIndicator from "./loading-indicator";
import "./admin-exam-access.css";
import "./exam-themes.css";
import AdminExamOperations from "./admin-exam-operations";

type Exam = { id: string; title: string; room_id: string; exam_type: string; duration_minutes: number };
type Room = { id: string; title: string };
type Section = { id: string; title: string; duration_minutes: number | null; subject_code?: string | null; sort_order: number };
type Field = { key: string; label: string; type: "text" | "email"; required: boolean };
type Settings = { guestEnabled: boolean; maxAttempts: number; identityFields: Field[]; shuffleQuestions: boolean; shuffleAnswers: boolean; subExamCount: number; hideGroupHeaders: boolean; resetQuestionIndex: boolean; autoMonitor: "off" | "exit" | "advanced"; showScore: "never" | "after_submit" | "after_slot" | "threshold"; scoreThreshold: number; showAnswers: "never" | "after_submit" | "after_slot" | "threshold"; answerThreshold: number; hideWrongAnswers: boolean; exportWindowEnabled: boolean };
type SettingsPreset = "practice" | "mock" | "custom";
type SlotForm = { name: string; sectionId: string; startsAt: string; endsAt: string; gracePeriodMinutes: number; password: string; exportOpenAt: string; exportCloseAt: string };
type SlotFormErrorKey = keyof SlotForm | "form";
type SlotFormErrors = Partial<Record<SlotFormErrorKey, string>>;
type Slot = { id: string; name: string; exam_id: string; section_id: string | null; section_title?: string | null; token_hint: string; starts_at: string; ends_at: string; grace_period_minutes: number; enabled: boolean; results_released_at: string | null; export_open_at: string | null; export_close_at: string | null; created_at: string };
type Attempt = { id: string; guest_identity: Record<string, string>; score: number | null; correct_answers: number; total_questions: number; status: string; started_at: string; submitted_at: string | null; duration_seconds: number | null; monitor_events?: ExamMonitorEvent[] };

const defaultSettings: Settings = { guestEnabled: false, maxAttempts: 0, identityFields: [{ key: "full_name", label: "Họ và tên", type: "text", required: true }, { key: "class_name", label: "Lớp", type: "text", required: true }], shuffleQuestions: false, shuffleAnswers: false, subExamCount: 0, hideGroupHeaders: false, resetQuestionIndex: false, autoMonitor: "off", showScore: "after_submit", scoreThreshold: 0, showAnswers: "never", answerThreshold: 0, hideWrongAnswers: false, exportWindowEnabled: false };

function dateLabel(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString("vi-VN") : "—"; }
function localDateTime(value: string | Date | null | undefined) { if (!value) return ""; const date = new Date(value); if (!Number.isFinite(date.getTime())) return ""; const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
function defaultSlotTimes(durationMinutes: number) { const start = new Date(); start.setSeconds(0, 0); start.setMinutes(start.getMinutes() + 5); const end = new Date(start.getTime() + Math.max(1, durationMinutes) * 60_000); return { startsAt: localDateTime(start), endsAt: localDateTime(end) }; }
function emptySlotForm(name = "Kíp thi 1"): SlotForm { return { name, sectionId: "", startsAt: "", endsAt: "", gracePeriodMinutes: 30, password: "", exportOpenAt: "", exportCloseAt: "" }; }
function filledSlotForm(name: string, durationMinutes: number) { return { ...emptySlotForm(name), ...defaultSlotTimes(durationMinutes) }; }
function nextSlotName(slots: Array<Pick<Slot, "name">>) { return `Kíp thi ${slots.length + 1}`; }
function inferSettingsPreset(settings: Settings): SettingsPreset {
  const practice = settings.guestEnabled && settings.maxAttempts === 0 && !settings.shuffleQuestions && !settings.shuffleAnswers && settings.autoMonitor === "off" && settings.showScore === "after_submit" && settings.showAnswers === "after_submit" && !settings.hideWrongAnswers && !settings.exportWindowEnabled;
  if (practice) return "practice";
  const mock = settings.guestEnabled && settings.maxAttempts === 1 && settings.shuffleQuestions && settings.shuffleAnswers && settings.autoMonitor === "exit" && settings.showScore === "after_slot" && settings.showAnswers === "after_slot" && settings.hideWrongAnswers && settings.exportWindowEnabled;
  return mock ? "mock" : "custom";
}
function parseDateTime(value: string) { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date : null; }
function validateSlotForm(form: SlotForm, independentSubjectExam: boolean, durationMinutes: number, exportWindowEnabled: boolean): SlotFormErrors {
  const errors: SlotFormErrors = {};
  if (!form.name.trim()) errors.name = "Nhập tên kíp thi để dễ nhận biết khi theo dõi.";
  if (form.name.trim().length > 120) errors.name = "Tên kíp thi tối đa 120 ký tự.";
  if (independentSubjectExam && !form.sectionId) errors.sectionId = "Chọn môn thi áp dụng cho link này.";
  const startsAt = parseDateTime(form.startsAt);
  const endsAt = parseDateTime(form.endsAt);
  if (!startsAt) errors.startsAt = "Chọn thời điểm mở kíp.";
  if (!endsAt) errors.endsAt = "Chọn thời điểm kết thúc kíp.";
  if (startsAt && endsAt) {
    if (endsAt.getTime() <= startsAt.getTime()) errors.endsAt = "Thời điểm kết thúc phải sau thời điểm mở.";
    else if (endsAt.getTime() - startsAt.getTime() < durationMinutes * 60_000) errors.endsAt = `Khung kíp cần ít nhất ${durationMinutes} phút theo thời lượng đề.`;
  }
  if (!Number.isInteger(form.gracePeriodMinutes) || form.gracePeriodMinutes < 0 || form.gracePeriodMinutes > 1440) errors.gracePeriodMinutes = "Nhập thời gian gia hạn từ 0 đến 1.440 phút.";
  if (exportWindowEnabled && (form.exportOpenAt || form.exportCloseAt)) {
    const exportOpenAt = form.exportOpenAt ? parseDateTime(form.exportOpenAt) : endsAt;
    const exportCloseAt = form.exportCloseAt ? parseDateTime(form.exportCloseAt) : endsAt && new Date(endsAt.getTime() + Math.max(0, form.gracePeriodMinutes) * 60_000);
    if (form.exportOpenAt && !exportOpenAt) errors.exportOpenAt = "Thời điểm mở xuất không hợp lệ.";
    if (form.exportCloseAt && !exportCloseAt) errors.exportCloseAt = "Thời điểm đóng xuất không hợp lệ.";
    if (exportOpenAt && exportCloseAt && exportCloseAt.getTime() <= exportOpenAt.getTime()) errors.exportCloseAt = "Thời điểm đóng xuất phải sau thời điểm mở xuất.";
  }
  if (Object.keys(errors).length) errors.form = "Kiểm tra các trường được đánh dấu trước khi lưu thay đổi.";
  return errors;
}
function AccessMonitorDetails({ events }: { events?: ExamMonitorEvent[] }) { const analysis = analyzeExamMonitorEvents(events); if (!events?.length) return <>0</>; return <details className="access-monitor-details"><summary>{analysis.eventCount} sự kiện · {analysis.suspectedAppSwitches} nghi chuyển tab/ứng dụng</summary><ul><li><b>{analysis.tabExits} lần rời tab · {analysis.fullscreenExits} lần thoát toàn màn hình</b><small>Mất focus {formatExamMonitorDuration(analysis.attentionAwayMs)} · lâu nhất {formatExamMonitorDuration(analysis.longestAttentionAwayMs)}</small></li>{events.map((event, index) => { const duration = examMonitorEventDuration(events, index); return <li key={`${event.at ?? "event"}-${index}`}>{examMonitorEventLabel(event.type)} · {dateLabel(event.at)}{duration ? ` · kéo dài ${formatExamMonitorDuration(duration)}` : ""}</li>; })}</ul></details>; }
function slotStatus(slot: Slot, guestEnabled: boolean) { const now = Date.now(); if (!guestEnabled) return "Tắt quyền thi bằng link"; if (!slot.enabled) return "Đã khóa"; if (now < new Date(slot.starts_at).getTime()) return "Chưa mở"; if (now <= new Date(slot.ends_at).getTime()) return "Đang mở"; if (now <= new Date(slot.ends_at).getTime() + slot.grace_period_minutes * 60_000) return `Gia hạn ${slot.grace_period_minutes} phút`; return "Đã đóng"; }
function slotStatusClass(slot: Slot, guestEnabled: boolean) { const status = slotStatus(slot, guestEnabled); if (status === "Đang mở") return "open"; if (status === "Đã khóa" || status === "Tắt quyền thi bằng link") return "disabled"; if (status === "Đã đóng") return "closed"; if (status.startsWith("Gia hạn")) return "grace"; return "scheduled"; }
function isLocalDevelopment() { return typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname); }

export default function AdminExamAccess({ exam, room, navigate }: { exam: Exam; room: Room; navigate: (path: string) => void }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [sections, setSections] = useState<Section[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [slotForm, setSlotForm] = useState<SlotForm>(() => emptySlotForm());
  const [slotErrors, setSlotErrors] = useState<SlotFormErrors>({});
  const [editingSlotId, setEditingSlotId] = useState("");
  const [deletingSlotId, setDeletingSlotId] = useState("");
  const [slotScheduleMode, setSlotScheduleMode] = useState<"now" | "schedule">("now");
  const independentSubjectExam = normalizeExamType(exam.exam_type) === "VSAT" || normalizeExamType(exam.exam_type) === "THPTQG";
  const selectedSection = sections.find(section => section.id === slotForm.sectionId);
  const slotDurationMinutes = Math.max(1, Number(selectedSection?.duration_minutes ?? exam.duration_minutes) || 1);
  const editingSlot = slots.find(slot => slot.id === editingSlotId);
  const showExportWindow = settings.exportWindowEnabled || Boolean(editingSlot?.export_open_at || editingSlot?.export_close_at);
  const preset = inferSettingsPreset(settings);

  const load = useCallback(async (slotId = "") => {
    setLoading(true); setError("");
    try {
      const query = `/api/admin/exam-access?examId=${encodeURIComponent(exam.id)}${slotId ? `&slotId=${encodeURIComponent(slotId)}` : ""}`;
      const response = await authenticatedFetch(query, { cache: "no-store" });
      const payload = await response.json() as { error?: string; exam?: { settings?: Settings }; sections?: Section[]; slots?: Slot[]; attempts?: Attempt[] };
      if (!response.ok) throw new Error(payload.error || "Không thể tải cấu hình kíp thi.");
      setSettings({ ...defaultSettings, ...(payload.exam?.settings ?? {}) });
      const nextSections = payload.sections ?? [];
      const nextSlots = payload.slots ?? [];
      setSections(nextSections);
      setSlots(nextSlots); setAttempts(payload.attempts ?? []);
      setSlotForm(current => {
        const changes: Partial<SlotForm> = {};
        if (!current.name.trim() || /^Kíp thi \d+$/.test(current.name.trim())) changes.name = nextSlotName(nextSlots);
        if (!current.startsAt && !current.endsAt) Object.assign(changes, defaultSlotTimes(Math.max(1, Number(exam.duration_minutes) || 1)));
        return Object.keys(changes).length ? { ...current, ...changes } : current;
      });
      if (slotId) setSelectedSlotId(nextSlots.some(slot => slot.id === slotId) ? slotId : "");
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể tải cấu hình kíp thi."); }
    finally { setLoading(false); }
  }, [exam.duration_minutes, exam.id]);

  useEffect(() => {
    const requestedSlotId = new URLSearchParams(window.location.search).get("slotId")?.trim() ?? "";
    // Network-backed state is populated after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(requestedSlotId);
  }, [load]);

  useEffect(() => {
    document.documentElement.dataset.examType = normalizeExamType(exam.exam_type).toLowerCase();
    return () => { delete document.documentElement.dataset.examType; };
  }, [exam.exam_type]);

  async function post(body: Record<string, unknown>) {
    const response = await authenticatedFetch("/api/admin/exam-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({})) as { error?: string; shareUrl?: string; settings?: Settings; slot?: Slot };
    if (!response.ok) throw new Error(payload.error || "Không thể lưu cấu hình.");
    return payload;
  }

  async function saveSettings() {
    setSaving(true); setError("");
    try { await post({ action: "save_config", examId: exam.id, settings }); setNotice("Đã lưu cấu hình thi và hiển thị kết quả."); }
    catch (value) { setError(value instanceof Error ? value.message : "Không thể lưu cấu hình."); }
    finally { setSaving(false); }
  }

  function updateSlotForm(changes: Partial<SlotForm>) {
    setSlotForm(current => ({ ...current, ...changes }));
    setSlotErrors(current => {
      const next = { ...current };
      for (const key of Object.keys(changes) as Array<keyof SlotForm>) delete next[key];
      delete next.form;
      return next;
    });
    if ("startsAt" in changes || "endsAt" in changes) setSlotScheduleMode("schedule");
  }

  function updateSlotSection(sectionId: string) {
    const nextSection = sections.find(section => section.id === sectionId);
    const nextDuration = Math.max(1, Number(nextSection?.duration_minutes ?? exam.duration_minutes) || 1);
    const start = parseDateTime(slotForm.startsAt);
    const end = parseDateTime(slotForm.endsAt);
    const currentWindowMatchesDuration = Boolean(start && end && Math.round((end.getTime() - start.getTime()) / 60_000) === slotDurationMinutes);
    updateSlotForm({ sectionId, ...(currentWindowMatchesDuration && start ? { endsAt: localDateTime(new Date(start.getTime() + nextDuration * 60_000)) } : {}) });
  }

  function applySlotSchedule(mode: "now" | "schedule") {
    const start = new Date();
    start.setSeconds(0, 0);
    if (mode === "schedule") start.setMinutes(start.getMinutes() + 60);
    const end = new Date(start.getTime() + slotDurationMinutes * 60_000);
    updateSlotForm({ startsAt: localDateTime(start), endsAt: localDateTime(end) });
    setSlotScheduleMode(mode);
  }

  function editSlot(slot: Slot) {
    setEditingSlotId(slot.id);
    setSlotScheduleMode("schedule");
    setSlotErrors({});
    setShareUrl("");
    setSlotForm({ name: slot.name, sectionId: slot.section_id ?? "", startsAt: localDateTime(slot.starts_at), endsAt: localDateTime(slot.ends_at), gracePeriodMinutes: slot.grace_period_minutes, password: "", exportOpenAt: localDateTime(slot.export_open_at), exportCloseAt: localDateTime(slot.export_close_at) });
    window.setTimeout(() => document.getElementById("slot-name")?.focus(), 0);
  }

  function cancelEdit() {
    setEditingSlotId("");
    setSlotErrors({});
    setSlotScheduleMode("now");
    setSlotForm(filledSlotForm(nextSlotName(slots), slotDurationMinutes));
  }

  async function submitSlot(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (!editingSlotId) {
      setError("Kíp thi được tạo trong trình tạo chung. Trang này chỉ dùng để chỉnh sửa và theo dõi kíp đã có.");
      return;
    }
    const validation = validateSlotForm(slotForm, independentSubjectExam, slotDurationMinutes, showExportWindow);
    if (Object.keys(validation).length) {
      setSlotErrors(validation);
      const firstField = ["name", "sectionId", "startsAt", "endsAt", "gracePeriodMinutes", "exportOpenAt", "exportCloseAt"].find(field => validation[field as keyof SlotForm]);
      if (firstField) window.setTimeout(() => document.getElementById(`slot-${firstField}`)?.focus(), 0);
      return;
    }
    setSaving(true);
    try {
      const startsAt = parseDateTime(slotForm.startsAt)?.toISOString() ?? "";
      const endsAt = parseDateTime(slotForm.endsAt)?.toISOString() ?? "";
      const exportOpenAt = showExportWindow && slotForm.exportOpenAt ? new Date(slotForm.exportOpenAt).toISOString() : "";
      const exportCloseAt = showExportWindow && slotForm.exportCloseAt ? new Date(slotForm.exportCloseAt).toISOString() : "";
      const password = slotForm.password.trim();
      await post({ action: "update_slot", examId: exam.id, slotId: editingSlotId, name: slotForm.name, sectionId: slotForm.sectionId || null, startsAt, endsAt, gracePeriodMinutes: slotForm.gracePeriodMinutes, exportOpenAt, exportCloseAt, ...(password ? { password } : {}) });
      const savedSlotId = editingSlotId;
      setEditingSlotId(""); setSlotErrors({}); setShareUrl(""); setSlotScheduleMode("now"); setSlotForm(filledSlotForm(nextSlotName(slots), slotDurationMinutes));
      setNotice("Đã cập nhật kíp thi.");
      await load(savedSlotId);
    }
    catch (value) { setError(value instanceof Error ? value.message : "Không thể lưu kíp thi."); }
    finally { setSaving(false); }
  }

  async function rotate(slot: Slot) { if (!window.confirm("Tạo link mới sẽ làm link cũ mất hiệu lực. Tiếp tục?")) return; try { const payload = await post({ action: "rotate_slot", examId: exam.id, slotId: slot.id }); setShareUrl(payload.shareUrl ?? ""); setSelectedSlotId(slot.id); setNotice("Đã tạo link mới."); await load(slot.id); } catch (value) { setError(value instanceof Error ? value.message : "Không thể đổi link."); } }
  async function release(slot: Slot) { try { await post({ action: "release_results", examId: exam.id, slotId: slot.id }); setNotice("Đã mở kết quả cho kíp thi."); await load(selectedSlotId); } catch (value) { setError(value instanceof Error ? value.message : "Không thể mở kết quả."); } }
  async function toggle(slot: Slot) {
    if (slot.enabled && !window.confirm(`Khóa kíp “${slot.name}”? Thí sinh sẽ không thể dùng link này cho đến khi bạn mở lại.`)) return;
    try { await post({ action: "update_slot", examId: exam.id, slotId: slot.id, enabled: !slot.enabled }); await load(selectedSlotId); } catch (value) { setError(value instanceof Error ? value.message : "Không thể cập nhật kíp thi."); }
  }
  async function deleteSlot(slot: Slot) {
    const confirmed = window.confirm(`Xóa vĩnh viễn kíp “${slot.name}”?\n\nChỉ kíp chưa có bài làm hoặc dữ liệu thí sinh mới được xóa. Thao tác này không thể hoàn tác.`);
    if (!confirmed) return;
    setDeletingSlotId(slot.id);
    setError("");
    setNotice("");
    try {
      await post({ action: "delete_slot", examId: exam.id, slotId: slot.id });
      if (selectedSlotId === slot.id) { setSelectedSlotId(""); setAttempts([]); }
      if (editingSlotId === slot.id) cancelEdit();
      setShareUrl("");
      setNotice(`Đã xóa kíp “${slot.name}”.`);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể xóa kíp thi.");
    } finally {
      setDeletingSlotId("");
    }
  }
  async function showAttempts(slot: Slot) { setShareUrl(""); setSelectedSlotId(slot.id); await load(slot.id); }
  async function exportSlot(slot: Slot) {
    const response = await authenticatedFetch(`/api/admin/exam-access/export?examId=${encodeURIComponent(exam.id)}&slotId=${encodeURIComponent(slot.id)}`, { cache: "no-store" });
    if (!response.ok) { const payload = await response.json().catch(() => ({})) as { error?: string }; setError(payload.error || "Không thể xuất Excel."); return; }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${exam.title}-${slot.name}.xlsx`.replace(/[\\/:*?"<>|]+/g, "-"); anchor.click(); URL.revokeObjectURL(url); setNotice("Đã tải file Excel dữ liệu kíp thi.");
  }

  function updateField(index: number, changes: Partial<Field>) { setSettings(current => ({ ...current, identityFields: current.identityFields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...changes } : field) })); }
  function addField() { setSettings(current => ({ ...current, identityFields: [...current.identityFields, { key: `field_${current.identityFields.length + 1}`, label: "Thông tin khác", type: "text", required: false }] })); }
  function applyPreset(value: SettingsPreset) {
    setSettings(current => value === "practice"
      ? { ...current, guestEnabled: true, maxAttempts: 0, shuffleQuestions: false, shuffleAnswers: false, autoMonitor: "off", showScore: "after_submit", scoreThreshold: 0, showAnswers: "after_submit", answerThreshold: 0, hideWrongAnswers: false, exportWindowEnabled: false }
      : { ...current, guestEnabled: true, maxAttempts: 1, shuffleQuestions: true, shuffleAnswers: true, autoMonitor: "exit", showScore: "after_slot", scoreThreshold: 0, showAnswers: "after_slot", answerThreshold: 0, hideWrongAnswers: true, exportWindowEnabled: true });
  }

  if (loading && !slots.length) return <LoadingIndicator label="Đang tải cấu hình kíp thi…" />;
  if (!loading && /schema kíp thi/i.test(error)) return <div className="workspace-page admin-access-page"><header className="workspace-page-header"><div className="workspace-heading-wrap"><button className="workspace-back" onClick={() => navigate(`/admin/exams/${exam.id}`)}><ArrowLeft/>Quay lại soạn đề</button><span className="editor-eyebrow">KÍP THI · {normalizeExamType(exam.exam_type)}</span><h1>{exam.title}</h1><p>{room.title} · Cần hoàn tất schema dữ liệu trước khi tạo link.</p></div></header><section className="access-panel access-schema-block"><ShieldCheck/><h2>Chưa sẵn sàng tạo kíp thi</h2><p>{error}</p><code>supabase/migrations/017_guest_exam_slots.sql<br/>supabase/migrations/018_exam_structure_profiles.sql<br/>supabase/migrations/019_guest_progress_version.sql<br/>supabase/migrations/020_guest_slot_sections.sql</code><button className="workspace-button primary" onClick={() => void load()}>Kiểm tra lại</button></section></div>;
  return <div className="workspace-page admin-access-page">
    <header className="workspace-page-header">
      <div className="workspace-heading-wrap">
        <button className="workspace-back" onClick={() => navigate(`/admin/exams/${exam.id}`)}><ArrowLeft/>Quay lại soạn đề</button>
        <span className="editor-eyebrow">KÍP THI · {normalizeExamType(exam.exam_type)}</span>
        <h1>{exam.title}</h1>
        <p>{room.title} · Tạo thời gian và quyền truy cập cho người tham gia.</p>
      </div>
      <div className="workspace-header-actions"><button className="workspace-button ghost" onClick={() => void load(selectedSlotId)}><RefreshCw/>Làm mới</button></div>
    </header>
    {notice && <div className="admin-access-notice" role="status" aria-live="polite"><Check aria-hidden="true"/>{notice}<button type="button" onClick={() => setNotice("")} aria-label="Đóng thông báo"><X aria-hidden="true"/></button></div>}
    {error && <div className="admin-access-error" role="alert">{error}</div>}
    <section className="access-grid">
      <form className="access-panel" onSubmit={event => { event.preventDefault(); void saveSettings(); }}>
        <div className="access-panel-head"><div><span className="editor-eyebrow">NGƯỜI THAM GIA & QUY TẮC</span><h2>Người tham gia không cần tài khoản</h2></div><button className="workspace-button primary" disabled={saving}><Save/>{saving ? "Đang lưu…" : "Lưu quy tắc"}</button></div>
        <div className="access-preset-panel" aria-labelledby="access-preset-title"><div><span className="editor-eyebrow">CẤU HÌNH NHANH</span><h3 id="access-preset-title">Chọn cách tổ chức</h3><p>{preset === "practice" ? "Phản hồi ngay sau mỗi lượt làm, phù hợp ôn tập và tự học." : preset === "mock" ? "Một lượt thi có thời gian, đảo đề và công bố kết quả sau khi kíp thi kết thúc." : "Cấu hình hiện tại là tùy chỉnh. Chọn một mẫu để điền nhanh các quy tắc phổ biến."}</p></div><div className="access-preset-options"><button type="button" className={preset === "practice" ? "active" : ""} aria-pressed={preset === "practice"} onClick={() => applyPreset("practice")}><b>Luyện tập</b><small>Phản hồi sau khi nộp</small></button><button type="button" className={preset === "mock" ? "active" : ""} aria-pressed={preset === "mock"} onClick={() => applyPreset("mock")}><b>Thi thử</b><small>Khóa cấu hình theo kíp</small></button></div></div>
        <label className="access-switch"><input type="checkbox" checked={settings.guestEnabled} onChange={event => setSettings({ ...settings, guestEnabled: event.target.checked })}/><span><b>Cho phép thi bằng link</b><small>Chỉ người có link kíp và đáp ứng thời gian/mật khẩu mới vào được bài.</small></span></label>
        <div className="access-form-grid"><label>Số lượt làm<input type="number" min={0} value={settings.maxAttempts} onChange={event => setSettings({ ...settings, maxAttempts: Number(event.target.value) })}/><small>0 hoặc bỏ trống = không giới hạn.</small></label><label>Số câu đề con<input type="number" min={0} value={settings.subExamCount} onChange={event => setSettings({ ...settings, subExamCount: Number(event.target.value) })}/><small>0 = dùng toàn bộ câu hỏi.</small></label></div>
        <h3>Người tham gia</h3>
        <div className="identity-field-list">{settings.identityFields.map((field, index) => <div className="identity-field-row" key={`${field.key}-${index}`}><input aria-label={`Mã trường ${index + 1}`} name={`identity-key-${index}`} value={field.key} onChange={event => updateField(index, { key: event.target.value })} placeholder="ma_truong"/><input aria-label={`Nhãn trường ${index + 1}`} name={`identity-label-${index}`} value={field.label} onChange={event => updateField(index, { label: event.target.value })} placeholder="Tên trường"/><select aria-label={`Loại trường ${index + 1}`} name={`identity-type-${index}`} value={field.type} onChange={event => updateField(index, { type: event.target.value as Field["type"] })}><option value="text">Văn bản</option><option value="email">Email</option></select><label><input type="checkbox" checked={field.required} onChange={event => updateField(index, { required: event.target.checked })}/> Bắt buộc</label><button type="button" aria-label={`Xóa trường ${field.label}`} onClick={() => setSettings(current => ({ ...current, identityFields: current.identityFields.filter((_, fieldIndex) => fieldIndex !== index) }))}><Trash2 aria-hidden="true"/></button></div>)}</div>
        <button type="button" className="workspace-button ghost" onClick={addField}><Plus/>Thêm thông tin</button>
        <h3>Cách làm bài, giám sát và kết quả</h3>
        <div className="access-check-grid"><label><input type="checkbox" checked={settings.shuffleQuestions} onChange={event => setSettings({ ...settings, shuffleQuestions: event.target.checked })}/> Đảo câu hỏi</label><label><input type="checkbox" checked={settings.shuffleAnswers} onChange={event => setSettings({ ...settings, shuffleAnswers: event.target.checked })}/> Đảo đáp án</label><label><input type="checkbox" checked={settings.hideGroupHeaders} onChange={event => setSettings({ ...settings, hideGroupHeaders: event.target.checked })}/> Ẩn tiêu đề nhóm</label><label><input type="checkbox" checked={settings.resetQuestionIndex} onChange={event => setSettings({ ...settings, resetQuestionIndex: event.target.checked })}/> Mỗi phần bắt đầu từ câu 1</label><label><input type="checkbox" checked={settings.hideWrongAnswers} onChange={event => setSettings({ ...settings, hideWrongAnswers: event.target.checked })}/> Ẩn đáp án câu sai</label></div>
        <div className="access-form-grid"><label>Giám sát<select value={settings.autoMonitor} onChange={event => setSettings({ ...settings, autoMonitor: event.target.value as Settings["autoMonitor"] })}><option value="off">Tắt</option><option value="exit">Giám sát thoát màn hình</option><option value="advanced">Giám sát nâng cao</option></select><small>Tự động ghi nhận rời tab/toàn màn hình; mức nâng cao ghi thêm mất focus và thao tác sao chép/dán.</small></label><label>Cho xem điểm<select value={settings.showScore} onChange={event => setSettings({ ...settings, showScore: event.target.value as Settings["showScore"] })}><option value="never">Không</option><option value="after_submit">Khi làm bài xong</option><option value="after_slot">Khi kíp thi kết thúc</option><option value="threshold">Khi đạt ngưỡng điểm</option></select></label><label>Ngưỡng điểm<input type="number" min={0} max={100} value={settings.scoreThreshold} onChange={event => setSettings({ ...settings, scoreThreshold: Number(event.target.value) })}/></label><label>Cho xem đáp án<select value={settings.showAnswers} onChange={event => setSettings({ ...settings, showAnswers: event.target.value as Settings["showAnswers"] })}><option value="never">Không</option><option value="after_submit">Khi làm bài xong</option><option value="after_slot">Khi kíp thi kết thúc</option><option value="threshold">Khi đạt ngưỡng điểm</option></select></label><label>Ngưỡng xem đáp án<input type="number" min={0} max={100} value={settings.answerThreshold} onChange={event => setSettings({ ...settings, answerThreshold: Number(event.target.value) })}/></label></div>
        <p className="access-result-policy-note">Đáp án và lời giải chỉ được mở khi đồng thời đủ điều kiện xem điểm, để thí sinh không thể suy ra số câu đúng trước thời điểm công bố.</p>
        <label className="access-switch"><input type="checkbox" checked={settings.exportWindowEnabled} onChange={event => setSettings({ ...settings, exportWindowEnabled: event.target.checked })}/><span><b>Giới hạn thời gian xuất dữ liệu</b><small>Khi bật, thời gian mở/đóng xuất được cấu hình theo từng kíp.</small></span></label>
      </form>
      <section className="access-panel slot-panel">
        <div className="access-panel-head"><div><span className="editor-eyebrow">TRUY CẬP KÍP THI</span><h2>{editingSlotId ? "Chỉnh sửa kíp thi" : "Quản lý kíp đã tạo"}</h2></div><Link2 aria-hidden="true"/></div>
        {editingSlot && <div className="slot-edit-banner"><span>Đang chỉnh sửa <b>{editingSlot.name}</b>. Link hiện tại vẫn giữ nguyên.</span><button type="button" onClick={cancelEdit}>Hủy sửa</button></div>}
        {editingSlotId ? <form className="slot-edit-form" onSubmit={submitSlot} noValidate>
          <div className="slot-schedule-tools" aria-labelledby="slot-schedule-title"><div><b id="slot-schedule-title">Thời điểm mở kíp</b><small>Chọn nhanh rồi vẫn có thể tinh chỉnh ngày giờ bên dưới.</small></div><div className="slot-schedule-options" role="group" aria-label="Cách đặt thời điểm mở kíp"><button type="button" className={slotScheduleMode === "now" ? "active" : ""} aria-pressed={slotScheduleMode === "now"} onClick={() => applySlotSchedule("now")}><CalendarClock aria-hidden="true"/><span>Mở ngay</span><small>Từ thời điểm này</small></button><button type="button" className={slotScheduleMode === "schedule" ? "active" : ""} aria-pressed={slotScheduleMode === "schedule"} onClick={() => applySlotSchedule("schedule")}><CalendarClock aria-hidden="true"/><span>Đặt lịch</span><small>Sau khoảng 1 giờ</small></button></div></div>
          {slotErrors.form && <div className="slot-validation-summary" role="alert"><strong>Chưa thể lưu kíp thi</strong><span>{slotErrors.form}</span></div>}
          <label>Tên kíp thi<input id="slot-name" name="slot-name" value={slotForm.name} onChange={event => updateSlotForm({ name: event.target.value })} aria-invalid={Boolean(slotErrors.name)} aria-describedby={slotErrors.name ? "slot-name-error" : undefined} maxLength={120}/>{slotErrors.name && <span id="slot-name-error" className="slot-field-error">{slotErrors.name}</span>}</label>
          {independentSubjectExam && <label>Môn thi áp dụng<select id="slot-section" name="slot-section" value={slotForm.sectionId} onChange={event => updateSlotSection(event.target.value)} required aria-invalid={Boolean(slotErrors.sectionId)} aria-describedby={slotErrors.sectionId ? "slot-section-error" : "slot-section-help"}><option value="">Chọn một môn thi</option>{sections.map(section => <option key={section.id} value={section.id}>{section.title}{section.duration_minutes ? ` · ${section.duration_minutes} phút` : ""}</option>)}</select><small id="slot-section-help">V-SAT và THPTQG là các môn độc lập; mỗi link nên gắn với một môn.</small>{slotErrors.sectionId && <span id="slot-section-error" className="slot-field-error">{slotErrors.sectionId}</span>}</label>}
          <div className="access-form-grid"><label>Mở kíp<input id="slot-starts-at" name="slot-starts-at" type="datetime-local" value={slotForm.startsAt} onChange={event => updateSlotForm({ startsAt: event.target.value })} required aria-invalid={Boolean(slotErrors.startsAt)} aria-describedby={slotErrors.startsAt ? "slot-starts-at-error" : "slot-starts-at-help"}/><small id="slot-starts-at-help">Thí sinh chỉ vào được từ thời điểm này.</small>{slotErrors.startsAt && <span id="slot-starts-at-error" className="slot-field-error">{slotErrors.startsAt}</span>}</label><label>Kết thúc kíp<input id="slot-ends-at" name="slot-ends-at" type="datetime-local" value={slotForm.endsAt} onChange={event => updateSlotForm({ endsAt: event.target.value })} required aria-invalid={Boolean(slotErrors.endsAt)} aria-describedby={slotErrors.endsAt ? "slot-ends-at-error" : "slot-ends-at-help"}/><small id="slot-ends-at-help">Thời lượng đề hiện tại: {slotDurationMinutes} phút.</small>{slotErrors.endsAt && <span id="slot-ends-at-error" className="slot-field-error">{slotErrors.endsAt}</span>}</label><label>Đóng sau thời gian kết thúc (phút)<input id="slot-grace-period" name="slot-grace-period" type="number" min={0} max={1440} value={slotForm.gracePeriodMinutes} onChange={event => updateSlotForm({ gracePeriodMinutes: Number(event.target.value) })} aria-invalid={Boolean(slotErrors.gracePeriodMinutes)} aria-describedby={slotErrors.gracePeriodMinutes ? "slot-grace-period-error" : "slot-grace-period-help"}/><small id="slot-grace-period-help">Khuyến nghị 30 phút để hoàn tất lượt đang làm.</small>{slotErrors.gracePeriodMinutes && <span id="slot-grace-period-error" className="slot-field-error">{slotErrors.gracePeriodMinutes}</span>}</label></div>
          {showExportWindow && <div className="access-form-grid"><label>Mở xuất Excel (tùy chọn)<input id="slot-export-open" name="slot-export-open" type="datetime-local" value={slotForm.exportOpenAt} onChange={event => updateSlotForm({ exportOpenAt: event.target.value })} aria-invalid={Boolean(slotErrors.exportOpenAt)} aria-describedby={slotErrors.exportOpenAt ? "slot-export-open-error" : "slot-export-open-help"}/><small id="slot-export-open-help">Bỏ trống = từ lúc kết thúc kíp.</small>{slotErrors.exportOpenAt && <span id="slot-export-open-error" className="slot-field-error">{slotErrors.exportOpenAt}</span>}</label><label>Đóng xuất Excel (tùy chọn)<input id="slot-export-close" name="slot-export-close" type="datetime-local" value={slotForm.exportCloseAt} onChange={event => updateSlotForm({ exportCloseAt: event.target.value })} aria-invalid={Boolean(slotErrors.exportCloseAt)} aria-describedby={slotErrors.exportCloseAt ? "slot-export-close-error" : "slot-export-close-help"}/><small id="slot-export-close-help">Bỏ trống = sau thời gian gia hạn.</small>{slotErrors.exportCloseAt && <span id="slot-export-close-error" className="slot-field-error">{slotErrors.exportCloseAt}</span>}</label></div>}
          <label>Mật khẩu mới (tùy chọn)<input id="slot-password" name="slot-password" type="password" autoComplete="new-password" value={slotForm.password} onChange={event => updateSlotForm({ password: event.target.value })} placeholder="Bỏ trống để giữ mật khẩu hiện tại"/></label>
          <div className="slot-form-actions"><button type="submit" className="workspace-button primary" disabled={saving || (independentSubjectExam && !sections.length)}><Save aria-hidden="true"/>{saving ? "Đang lưu…" : "Lưu thay đổi"}</button><button type="button" className="workspace-button ghost" onClick={cancelEdit} disabled={saving}>Hủy sửa</button></div>
        </form> : <div className="slot-management-guidance"><div className="slot-management-guidance-icon"><CalendarClock aria-hidden="true"/></div><div><h3>Kíp thi được tạo từ trình tạo chung</h3><p>Trang này chỉ dùng để theo dõi, vận hành và chỉnh sửa các kíp đã có. Muốn tạo kíp mới, hãy chọn đề từ phòng trong một luồng riêng.</p>{!slots.length && <button type="button" className="workspace-button ghost" onClick={() => navigate(`/admin/sessions/new?roomId=${encodeURIComponent(room.id)}&examId=${encodeURIComponent(exam.id)}`)}><ArrowLeft aria-hidden="true"/>Mở trình tạo chung</button>}</div></div>}
        {independentSubjectExam && !sections.length && <p className="access-empty">Đề chưa có môn để gắn vào link kíp.</p>}
        {shareUrl && <div className="share-url-box"><small>LINK VỪA TẠO</small><code>{shareUrl}</code>{isLocalDevelopment() && <small className="share-url-warning">Đang chạy local: link chỉ mở được khi server này còn chạy và không dùng được trên máy học sinh khác. Hãy deploy ứng dụng hoặc dùng domain công khai trước khi gửi link.</small>}<button type="button" onClick={() => void navigator.clipboard?.writeText(shareUrl)}><Copy aria-hidden="true"/>Sao chép link</button></div>}
        <div className="slot-list">{slots.length ? slots.map(slot => <article className={`slot-card${selectedSlotId === slot.id ? " is-selected" : ""}`} key={slot.id}><div className="slot-card-head"><div><b>{slot.name}</b><small>{slot.section_title ? `${slot.section_title} · ` : ""}<span className={`slot-state slot-state-${slotStatusClass(slot, settings.guestEnabled)}`}>{slotStatus(slot, settings.guestEnabled)}</span> · {dateLabel(slot.starts_at)} → {dateLabel(slot.ends_at)} · đóng sau {slot.grace_period_minutes} phút</small></div><span className="slot-token"><small>Mã link</small><code>{slot.token_hint}</code></span></div><div className="slot-card-actions"><button type="button" onClick={() => editSlot(slot)}><Pencil aria-hidden="true"/>Chỉnh sửa</button><button type="button" aria-label={`Dữ liệu ${slot.name}`} onClick={() => void showAttempts(slot)}><ClipboardList aria-hidden="true"/>Xem dữ liệu</button><button type="button" onClick={() => void exportSlot(slot)}><Download aria-hidden="true"/>Tải Excel</button><button type="button" onClick={() => void rotate(slot)}><RefreshCw aria-hidden="true"/>Đổi link</button><button type="button" onClick={() => void release(slot)} disabled={Boolean(slot.results_released_at)}><Eye aria-hidden="true"/>{slot.results_released_at ? "Đã công bố kết quả" : "Công bố kết quả"}</button><button type="button" onClick={() => void toggle(slot)}><ShieldCheck aria-hidden="true"/>{slot.enabled ? "Đóng kíp thi" : "Mở kíp thi"}</button><button type="button" className="slot-delete-button" onClick={() => void deleteSlot(slot)} disabled={deletingSlotId === slot.id} aria-label={`Xóa kíp ${slot.name}`}><Trash2 aria-hidden="true"/>{deletingSlotId === slot.id ? "Đang xóa…" : "Xóa kíp"}</button></div></article>) : <div className="slot-empty-state"><b>Chưa có kíp thi</b><span>Chưa có kíp nào cho đề này. Hãy mở trình tạo chung để tạo kíp đầu tiên.</span></div>}</div>
      </section>
    </section>
    {selectedSlotId && slots.find(slot => slot.id === selectedSlotId) && <AdminExamOperations examId={exam.id} slot={{ id: selectedSlotId, name: slots.find(slot => slot.id === selectedSlotId)?.name ?? "Kíp thi" }} shareUrl={shareUrl} />}
    {selectedSlotId && <section className="access-panel access-attempt-panel"><div className="access-panel-head"><div><span className="editor-eyebrow">DỮ LIỆU ĐỢT THI</span><h2>{slots.find(slot => slot.id === selectedSlotId)?.name ?? "Đợt thi"}</h2></div><button className="workspace-button ghost" onClick={() => { setSelectedSlotId(""); setAttempts([]); }}><X/>Đóng</button></div>{attempts.length ? <div className="access-table-wrap"><table><thead><tr><th>Thí sinh</th><th>Lớp</th><th>Điểm</th><th>Đúng</th><th>Thoát toàn màn hình</th><th>Trạng thái</th><th>Nộp lúc</th><th>Giám sát</th></tr></thead><tbody>{attempts.map(attempt => <tr key={attempt.id}><td>{identityDisplayName(attempt.guest_identity, settings.identityFields)}</td><td>{attempt.guest_identity?.class_name || attempt.guest_identity?.class || "—"}</td><td>{attempt.score ?? "—"}</td><td>{attempt.correct_answers}/{attempt.total_questions}</td><td>{analyzeExamMonitorEvents(attempt.monitor_events).fullscreenExits}</td><td>{attempt.status}</td><td>{dateLabel(attempt.submitted_at)}</td><td><AccessMonitorDetails events={attempt.monitor_events} /></td></tr>)}</tbody></table></div> : <p className="access-empty">Chưa có học sinh nộp bài trong đợt thi này.</p>}</section>}
  </div>;
}
