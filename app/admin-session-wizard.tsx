"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { ArrowLeft, ArrowRight, CalendarClock, Check, CheckCircle2, ClipboardCheck, Copy, ExternalLink, FileText, Link2, LockKeyhole, QrCode, ShieldCheck, UserRound } from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import type { ExamPolicy } from "../lib/exam-policy";
import { normalizeExamType } from "../lib/exam-config";
import LoadingIndicator from "./loading-indicator";
import "./admin-session-wizard.css";

type Room = {
  id: string;
  title: string;
  description: string | null;
  exam_type: string;
  access_mode: "open" | "assigned";
};

type Exam = {
  id: string;
  room_id: string;
  title: string;
  description: string | null;
  exam_type: string;
  duration_minutes: number;
};

type Section = { id: string; exam_id: string; title: string; duration_minutes: number | null; subject_code: string | null; sort_order: number };
type Step = 1 | 2 | 3 | 4;
type SessionMode = "account" | "link_qr" | "both";
type RosterMode = "open" | "enrolled";
type MonitorMode = "off" | "exit" | "advanced";
type ReleaseMode = "after_submit" | "after_slot" | "manual" | "never";

type WizardForm = {
  roomId: string;
  examId: string;
  mode: SessionMode;
  name: string;
  startsAt: string;
  endsAt: string;
  gracePeriodMinutes: number | "";
  maxAttempts: number | "";
  rosterMode: RosterMode;
  sectionId: string;
  password: string;
  monitorMode: MonitorMode;
  releaseMode: ReleaseMode;
};

type CatalogPayload = { rooms?: Room[]; exams?: Exam[]; sections?: Section[]; error?: string };
type GuestSettings = Record<string, unknown>;
type CreatedResult = { mode: SessionMode; examTitle: string; shareUrl?: string; tokenHint?: string };
type NumericField = "gracePeriodMinutes" | "maxAttempts";

const steps: Array<{ id: Step; label: string }> = [
  { id: 1, label: "Chọn đề" },
  { id: 2, label: "Cách tham gia" },
  { id: 3, label: "Thời gian" },
  { id: 4, label: "Xác nhận" },
];

const defaultGuestSettings: GuestSettings = {
  guestEnabled: true,
  maxAttempts: 1,
  identityFields: [
    { key: "full_name", label: "Họ và tên", type: "text", required: true },
    { key: "class_name", label: "Lớp", type: "text", required: true },
  ],
  shuffleQuestions: false,
  shuffleAnswers: false,
  subExamCount: 0,
  hideGroupHeaders: false,
  resetQuestionIndex: false,
  autoMonitor: "exit",
  showScore: "after_slot",
  scoreThreshold: 0,
  showAnswers: "never",
  answerThreshold: 0,
  hideWrongAnswers: true,
  exportWindowEnabled: false,
};

function localDateTime(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function parseDateTime(value: string) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function initialTimes(durationMinutes: number) {
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 5);
  return { startsAt: localDateTime(start), endsAt: localDateTime(new Date(start.getTime() + Math.max(1, durationMinutes) * 60_000)) };
}

function isIndependentSubjectExam(exam: Exam | null) {
  const type = exam ? normalizeExamType(exam.exam_type) : "";
  return type === "VSAT" || type === "THPTQG";
}

function formatDateTime(value: string) {
  const date = parseDateTime(value);
  return date ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date) : "Chưa đặt";
}

function formatDuration(value: number) {
  return `${Math.max(1, Math.round(value || 1))} phút`;
}

function modeLabel(mode: SessionMode) {
  return mode === "account" ? "Tài khoản học viên" : mode === "both" ? "Tài khoản + Link/QR" : "Link / QR";
}

export default function AdminSessionWizard({ navigate }: { navigate: (path: string) => void }) {
  const [step, setStep] = useState<Step>(1);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [policy, setPolicy] = useState<ExamPolicy | null>(null);
  const [guestSettings, setGuestSettings] = useState<GuestSettings | null>(null);
  const [form, setForm] = useState<WizardForm>(() => {
    const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
    return {
      roomId: params.get("roomId") ?? "",
      examId: params.get("examId") ?? "",
      mode: "link_qr",
      name: "Kíp thi 1",
      ...initialTimes(90),
      gracePeriodMinutes: 30,
      maxAttempts: 1,
      rosterMode: "open",
      sectionId: "",
      password: "",
      monitorMode: "exit",
      releaseMode: "after_slot",
    };
  });
  const [roomQuery, setRoomQuery] = useState("");
  const [examQuery, setExamQuery] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingExam, setLoadingExam] = useState(false);
  const [loadingGuestSettings, setLoadingGuestSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedResult | null>(null);
  const [qrData, setQrData] = useState("");
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<NumericField, string>>>({});

  const selectedRoom = useMemo(() => rooms.find(room => room.id === form.roomId) ?? null, [form.roomId, rooms]);
  const selectedExam = useMemo(() => exams.find(exam => exam.id === form.examId) ?? null, [exams, form.examId]);
  const selectedSection = useMemo(() => sections.find(section => section.id === form.sectionId) ?? null, [form.sectionId, sections]);
  const independentSubjectExam = isIndependentSubjectExam(selectedExam);
  const availableExams = useMemo(() => exams.filter(exam => exam.room_id === form.roomId && `${exam.title} ${exam.description ?? ""}`.toLocaleLowerCase("vi").includes(examQuery.trim().toLocaleLowerCase("vi"))), [examQuery, exams, form.roomId]);
  const visibleRooms = useMemo(() => rooms.filter(room => `${room.title} ${room.description ?? ""} ${room.exam_type}`.toLocaleLowerCase("vi").includes(roomQuery.trim().toLocaleLowerCase("vi"))), [roomQuery, rooms]);

  const updateForm = useCallback((changes: Partial<WizardForm>) => {
    setForm(current => {
      const next = { ...current, ...changes };
      // Guest settings support release-after-slot, not a manual visibility
      // mode. Keep the form honest when switching from an account session.
      if (next.mode !== "account" && next.releaseMode === "manual") next.releaseMode = "after_slot";
      return next;
    });
    setError("");
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/admin/session-catalog", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as CatalogPayload;
      if (!response.ok) throw new Error(payload.error || "Không thể tải danh mục phòng và đề thi.");
      const nextRooms = payload.rooms ?? [];
      const nextExams = payload.exams ?? [];
      setRooms(nextRooms);
      setExams(nextExams);
      setForm(current => {
        const roomId = current.roomId && nextRooms.some(room => room.id === current.roomId) ? current.roomId : nextRooms[0]?.id ?? "";
        const roomExams = nextExams.filter(exam => exam.room_id === roomId);
        const examId = current.examId && roomExams.some(exam => exam.id === current.examId) ? current.examId : roomExams[0]?.id ?? "";
        return { ...current, roomId, examId };
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể tải danh mục phòng và đề thi.");
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    // Network-backed state is populated after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!form.examId) return undefined;
    let active = true;
    // Network-backed state is populated after the requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingExam(true);
    setError("");
    Promise.all([
      authenticatedFetch(`/api/admin/session-catalog?examId=${encodeURIComponent(form.examId)}`, { cache: "no-store" }),
      authenticatedFetch(`/api/admin/exam-policy?examId=${encodeURIComponent(form.examId)}`, { cache: "no-store" }),
    ]).then(async ([catalogResponse, policyResponse]) => {
      const catalog = await catalogResponse.json().catch(() => ({})) as CatalogPayload;
      const policyPayload = await policyResponse.json().catch(() => ({})) as { policy?: ExamPolicy; error?: string };
      if (!catalogResponse.ok) throw new Error(catalog.error || "Không thể tải phần thi của đề.");
      if (!policyResponse.ok || !policyPayload.policy) throw new Error(policyPayload.error || "Không thể tải cấu hình đề thi.");
      if (!active) return;
      const nextExam = exams.find(exam => exam.id === form.examId);
      const nextDuration = Math.max(1, Number(nextExam?.duration_minutes) || policyPayload.policy.timing.durationMinutes || 1);
      setSections(catalog.sections ?? []);
      setPolicy(policyPayload.policy);
      setForm(current => {
        const times = initialTimes(nextDuration);
        const shouldRefreshTimes = !current.startsAt || !current.endsAt;
        return {
          ...current,
          ...(shouldRefreshTimes ? times : {}),
          name: current.name === "Kíp thi 1" && nextExam ? `${nextExam.title} · Kíp 1` : current.name,
          sectionId: isIndependentSubjectExam(nextExam ?? null) && !((catalog.sections ?? []).some(section => section.id === current.sectionId)) ? "" : current.sectionId,
        };
      });
    }).catch(value => {
      if (active) setError(value instanceof Error ? value.message : "Không thể tải cấu hình đề thi.");
    }).finally(() => { if (active) setLoadingExam(false); });
    return () => { active = false; };
  }, [exams, form.examId]);

  useEffect(() => {
    if (form.mode === "account" || !form.examId) return undefined;
    let active = true;
    // Network-backed state is populated after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingGuestSettings(true);
    authenticatedFetch(`/api/admin/exam-access?examId=${encodeURIComponent(form.examId)}`, { cache: "no-store" })
      .then(async response => {
        const payload = await response.json().catch(() => ({})) as { exam?: { settings?: GuestSettings }; error?: string };
        if (!response.ok) throw new Error(payload.error || "Không thể tải cấu hình link/QR của đề.");
        if (active) setGuestSettings(payload.exam?.settings ?? null);
      })
      .catch(value => { if (active) setError(value instanceof Error ? value.message : "Không thể tải cấu hình link/QR của đề."); })
      .finally(() => { if (active) setLoadingGuestSettings(false); });
    return () => { active = false; };
  }, [form.examId, form.mode]);

  useEffect(() => {
    if (!created?.shareUrl) return undefined;
    let active = true;
    void QRCode.toDataURL(created.shareUrl, { width: 220, margin: 1, errorCorrectionLevel: "M" })
      .then(value => { if (active) setQrData(value); })
      .catch(() => { if (active) setQrData(""); });
    return () => { active = false; };
  }, [created]);

  function selectRoom(roomId: string) {
    const nextExam = exams.find(exam => exam.room_id === roomId);
    setSections([]);
    setPolicy(null);
    updateForm({ roomId, examId: nextExam?.id ?? "", sectionId: "" });
    setExamQuery("");
    setStep(1);
  }

  function selectExam(examId: string) {
    const exam = exams.find(item => item.id === examId);
    const times = initialTimes(Math.max(1, Number(exam?.duration_minutes) || 90));
    setSections([]);
    setPolicy(null);
    updateForm({ examId, ...times, sectionId: "" });
  }

  function updateSchedule(mode: "now" | "later") {
    const duration = selectedSection?.duration_minutes ?? selectedExam?.duration_minutes ?? 90;
    const times = initialTimes(duration);
    if (mode === "later") {
      const start = parseDateTime(times.startsAt);
      if (start) start.setHours(start.getHours() + 1);
      updateForm({ startsAt: start ? localDateTime(start) : times.startsAt, endsAt: start ? localDateTime(new Date(start.getTime() + duration * 60_000)) : times.endsAt });
    } else updateForm(times);
  }

  function parseBoundedInteger(field: NumericField, label: string, maximum: number) {
    const raw = String(form[field]).trim();
    if (!raw) return { error: `Nhập ${label.toLocaleLowerCase("vi")}.` } as const;
    const value = Number(raw);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > maximum) {
      return { error: `${label} phải là số nguyên từ 0 đến ${maximum.toLocaleString("vi-VN")}.` } as const;
    }
    return { value } as const;
  }

  function updateNumericField(field: NumericField, raw: string, maximum: number) {
    setFieldErrors(current => ({ ...current, [field]: undefined }));
    if (!raw) {
      updateForm({ [field]: "" });
      return;
    }
    if (!/^\d+$/.test(raw)) return;
    const value = Number(raw);
    if (Number.isSafeInteger(value) && value >= 0 && value <= maximum) updateForm({ [field]: value });
  }

  function captureNumericChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "number") return;
    const field: NumericField | null = target.max === "1440" ? "gracePeriodMinutes" : target.max === "1000" ? "maxAttempts" : null;
    if (!field) return;
    event.stopPropagation();
    const label = field === "gracePeriodMinutes" ? "Thời gian gia hạn" : "Số lượt làm tối đa";
    const maximum = field === "gracePeriodMinutes" ? 1440 : 1000;
    const raw = target.value.trim();
    const value = Number(raw);
    const message = !raw
      ? `Nhập ${label.toLocaleLowerCase("vi")}.`
      : !Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > maximum
        ? `${label} phải là số nguyên từ 0 đến ${maximum.toLocaleString("vi-VN")}.`
        : "";
    target.setCustomValidity(message);
    target.setAttribute("aria-invalid", message ? "true" : "false");
    setFieldErrors(current => ({ ...current, [field]: message || undefined }));
    updateNumericField(field, raw, maximum);
  }

  function validateNumericFields() {
    const grace = parseBoundedInteger("gracePeriodMinutes", "Thời gian gia hạn", 1440);
    const attempts = parseBoundedInteger("maxAttempts", "Số lượt làm tối đa", 1000);
    const nextErrors: Partial<Record<NumericField, string>> = {
      gracePeriodMinutes: "error" in grace ? grace.error : undefined,
      maxAttempts: "error" in attempts ? attempts.error : undefined,
    };
    setFieldErrors(nextErrors);
    if ("error" in grace) return grace.error;
    if ("error" in attempts) return attempts.error;
    updateForm({ gracePeriodMinutes: grace.value, maxAttempts: attempts.value });
    return "";
  }

  function validateCurrentStep(currentStep: Step) {
    if (currentStep === 1) {
      if (!form.roomId || !selectedRoom) return "Chọn một phòng thi.";
      if (!form.examId || !selectedExam) return "Chọn một đề đã xuất bản trong phòng.";
    }
    if (currentStep === 2 && !form.mode) return "Chọn cách tham gia.";
    if (currentStep === 3) {
      if (!form.name.trim()) return "Nhập tên kíp thi.";
      if (form.name.trim().length > 120) return "Tên kíp thi tối đa 120 ký tự.";
      const startsAt = parseDateTime(form.startsAt);
      const endsAt = parseDateTime(form.endsAt);
      const duration = Math.max(1, Number(selectedSection?.duration_minutes ?? selectedExam?.duration_minutes) || 1);
      if (!startsAt || !endsAt) return "Chọn đủ thời gian mở và kết thúc kíp.";
      if (endsAt.getTime() <= startsAt.getTime()) return "Thời điểm kết thúc phải sau thời điểm mở.";
      if (endsAt.getTime() - startsAt.getTime() < duration * 60_000) return `Khung kíp cần ít nhất ${duration} phút theo thời lượng đề.`;
      const numericError = validateNumericFields();
      if (numericError) return numericError;
      if (independentSubjectExam && !form.sectionId) return "Chọn môn thi áp dụng cho kíp này.";
      if (form.password.length > 120) return "Mật khẩu kíp tối đa 120 ký tự.";
    }
    return "";
  }

  function nextStep() {
    const validation = validateCurrentStep(step);
    if (validation) { setError(validation); return; }
    setError("");
    setStep(current => Math.min(4, current + 1) as Step);
  }

  function previousStep() {
    setError("");
    setStep(current => Math.max(1, current - 1) as Step);
  }

  async function post(path: string, body: Record<string, unknown>) {
    const response = await authenticatedFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({})) as { error?: string; shareUrl?: string; tokenHint?: string; policy?: ExamPolicy };
    if (!response.ok) throw new Error(payload.error || "Không thể lưu kíp thi.");
    return payload;
  }

  async function submit() {
    const validation = validateCurrentStep(3);
    if (validation || !selectedExam) { setError(validation || "Chọn một đề thi trước khi tạo kíp."); setStep(3); return; }
    setSaving(true);
    setError("");
    setQrData("");
    try {
      const startsAt = parseDateTime(form.startsAt)?.toISOString() ?? "";
      const endsAt = parseDateTime(form.endsAt)?.toISOString() ?? "";
      const hasAccountAccess = form.mode === "account" || form.mode === "both";
      const hasLinkAccess = form.mode === "link_qr" || form.mode === "both";
      if (hasAccountAccess) {
        const currentPolicy = policy ?? (await (async () => {
          const response = await authenticatedFetch(`/api/admin/exam-policy?examId=${encodeURIComponent(selectedExam.id)}`, { cache: "no-store" });
          const payload = await response.json().catch(() => ({})) as { policy?: ExamPolicy; error?: string };
          if (!response.ok || !payload.policy) throw new Error(payload.error || "Không thể tải quy tắc đề thi.");
          return payload.policy;
        })());
        const nextPolicy: ExamPolicy = {
          ...currentPolicy,
          mode: "official",
          access: {
            ...currentPolicy.access,
            audience: form.mode === "both" ? "both" : "account",
            accountRequired: form.mode === "both" ? false : true,
            rosterMode: form.rosterMode,
            maxAttempts: Number(form.maxAttempts),
            passwordRequired: false,
          },
          timing: {
            ...currentPolicy.timing,
            opensAt: startsAt,
            closesAt: endsAt,
            durationMinutes: Math.max(1, Number(selectedSection?.duration_minutes ?? selectedExam.duration_minutes) || 1),
            gracePeriodMinutes: Number(form.gracePeriodMinutes),
          },
          release: {
            ...currentPolicy.release,
            score: form.releaseMode,
            answers: form.releaseMode === "after_slot" ? "after_slot" : form.releaseMode === "after_submit" ? "after_submit" : "manual",
            solutions: "never",
          },
        };
        await post("/api/admin/exam-policy", { action: "save_policy", examId: selectedExam.id, policy: nextPolicy });
        if (!hasLinkAccess) {
          setCreated({ mode: "account", examTitle: selectedExam.title });
          return;
        }
      }

      const settings = {
        ...defaultGuestSettings,
        ...(guestSettings ?? {}),
        guestEnabled: true,
        maxAttempts: Number(form.maxAttempts),
        autoMonitor: form.monitorMode,
        showScore: form.releaseMode,
        showAnswers: "never",
        hideWrongAnswers: true,
      };
      await post("/api/admin/exam-access", { action: "save_config", examId: selectedExam.id, settings });
      const payload = await post("/api/admin/exam-access", {
        action: "create_slot",
        examId: selectedExam.id,
        name: form.name.trim(),
        sectionId: form.sectionId || null,
        startsAt,
        endsAt,
        gracePeriodMinutes: Number(form.gracePeriodMinutes),
        password: form.password,
      });
      setCreated({ mode: form.mode, examTitle: selectedExam.title, shareUrl: payload.shareUrl, tokenHint: payload.tokenHint });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể tạo kíp thi.");
    } finally {
      setSaving(false);
    }
  }

  async function copyShareUrl() {
    if (!created?.shareUrl) return;
    setCopied(false);
    setError("");
    try {
      await navigator.clipboard.writeText(created.shareUrl);
      setCopied(true);
    } catch {
      setError("Không thể sao chép link. Hãy chọn và sao chép thủ công.");
    }
  }

  if (created) return <section className="admin-session-wizard admin-session-wizard-success">
    <header className="admin-session-wizard-header"><div><span className="admin-session-wizard-kicker">ĐÃ TẠO KÍP THI</span><h1>{created.mode === "account" ? "Lịch thi tài khoản đã được lưu" : "Kíp thi đã sẵn sàng"}</h1><p>{created.examTitle} · {modeLabel(created.mode)}. {created.mode === "account" ? "Học viên sẽ vào bằng tài khoản theo lịch và quyền đã chọn." : "Bạn có thể chia sẻ link/QR cho người chưa có tài khoản."}</p></div></header>
    {error && <div className="admin-session-wizard-error" role="alert">{error}</div>}
    {created.mode !== "account" && created.shareUrl ? <section className="admin-session-result-card"><div className="admin-session-qr">{qrData ? <img src={qrData} alt="Mã QR tham gia kíp thi" width={220} height={220} /> : <QrCode aria-hidden="true" />}</div><div className="admin-session-result-copy"><span className="admin-session-wizard-kicker">MÃ LINK · {created.tokenHint ?? "mới tạo"}</span><h2>Gửi link này cho người chưa có tài khoản</h2><p>QR không chứa mật khẩu. Nếu bạn đặt mật khẩu, hãy gửi mật khẩu qua kênh riêng.</p><code>{created.shareUrl}</code><div className="admin-session-result-actions"><button type="button" className="admin-session-wizard-primary" onClick={() => void copyShareUrl()}><Copy aria-hidden="true" />Sao chép link</button><a className="admin-session-wizard-secondary" href={created.shareUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Mở link</a></div>{copied && <p className="admin-session-copy-status" role="status">Đã sao chép link.</p>}</div></section> : null}
    {created.mode === "account" && <section className="admin-session-account-success"><CheckCircle2 aria-hidden="true" /><div><h2>Kíp tài khoản đã hoạt động theo lịch</h2><p>Học viên thuộc phạm vi “{form.rosterMode === "enrolled" ? "được phân quyền" : "mở"}” có thể tham gia trong khoảng {formatDateTime(form.startsAt)} đến {formatDateTime(form.endsAt)}.</p></div></section>}
    {created.mode === "both" && <section className="admin-session-account-success"><CheckCircle2 aria-hidden="true" /><div><h2>Học viên có tài khoản có thể vào thẳng</h2><p>Người có tài khoản dùng hồ sơ sẵn có; người chưa có tài khoản dùng link/QR và chỉ điền các trường được yêu cầu.</p></div></section>}
    <div className="admin-session-wizard-footer"><button type="button" className="admin-session-wizard-secondary" onClick={() => navigate("/admin/sessions")}><ArrowLeft aria-hidden="true" />Về danh sách kíp thi</button>{created.mode !== "account" && <button type="button" className="admin-session-wizard-primary" onClick={() => navigate(`/admin/exams/${encodeURIComponent(selectedExam?.id ?? form.examId)}/access`)}>Quản lý kíp thi<ArrowRight aria-hidden="true" /></button>}</div>
  </section>;

  if (loadingCatalog) return <div className="admin-session-wizard-loading"><LoadingIndicator label="Đang tải phòng và đề thi…" /></div>;

  return <section className="admin-session-wizard">
    <header className="admin-session-wizard-header"><div><button type="button" className="admin-session-wizard-back" onClick={() => navigate("/admin/sessions")}><ArrowLeft aria-hidden="true" />Đợt thi</button><span className="admin-session-wizard-kicker">TỔ CHỨC KỲ THI</span><h1>Tạo kíp thi</h1><p>Chọn đề trước, sau đó thiết lập thời gian và cách tham gia trong một luồng duy nhất.</p></div><div className="admin-session-wizard-header-icon" aria-hidden="true"><CalendarClock /></div></header>
    <nav className="admin-session-stepper" aria-label="Các bước tạo kíp thi">{steps.map(item => <div className={step === item.id ? "active" : step > item.id ? "completed" : ""} aria-current={step === item.id ? "step" : undefined} key={item.id}><span>{step > item.id ? <Check aria-hidden="true" /> : item.id}</span><b>{item.label}</b></div>)}</nav>
    {error && <div className="admin-session-wizard-error" role="alert">{error}</div>}
    {Object.values(fieldErrors).some(Boolean) && <div className="admin-session-field-error-summary" role="alert"><b>Kiểm tra lại thông tin:</b><ul>{Object.entries(fieldErrors).filter((entry): entry is [string, string] => Boolean(entry[1])).map(([field, message]) => <li key={field}>{message}</li>)}</ul></div>}

    <form onChangeCapture={captureNumericChange} onSubmit={event => { event.preventDefault(); if (step === 4) void submit(); else nextStep(); }}>
      {step === 1 && <section className="admin-session-wizard-panel" aria-labelledby="wizard-select-title"><div className="admin-session-panel-heading"><div><span className="admin-session-wizard-kicker">BƯỚC 1 / 4</span><h2 id="wizard-select-title">Chọn đề từ phòng thi</h2><p>Luồng bắt đầu từ phòng và đề đã xuất bản, không cần mở phòng trước.</p></div><FileText aria-hidden="true" /></div><div className="admin-session-selection-grid"><div className="admin-session-selection-column"><label className="admin-session-field"><span>Phòng thi</span><div className="admin-session-search-field"><FileText aria-hidden="true" /><input type="search" value={roomQuery} onChange={event => setRoomQuery(event.target.value)} placeholder="Tìm phòng thi…" aria-label="Tìm phòng thi" /></div></label><div className="admin-session-choice-list" role="listbox" aria-label="Chọn phòng thi">{visibleRooms.length ? visibleRooms.map(room => <button type="button" role="option" aria-selected={room.id === form.roomId} className={room.id === form.roomId ? "selected" : ""} key={room.id} onClick={() => selectRoom(room.id)}><span className="admin-session-choice-icon"><ClipboardCheck aria-hidden="true" /></span><span><b>{room.title}</b><small>{normalizeExamType(room.exam_type)} · {room.access_mode === "open" ? "Mở cho học viên" : "Theo phân quyền"}</small></span><ArrowRight aria-hidden="true" /></button>) : <p className="admin-session-muted">Không tìm thấy phòng phù hợp.</p>}</div></div><div className="admin-session-selection-column"><label className="admin-session-field"><span>Đề thi trong phòng {selectedRoom ? `· ${selectedRoom.title}` : ""}</span><div className="admin-session-search-field"><SearchIcon /><input type="search" value={examQuery} onChange={event => setExamQuery(event.target.value)} placeholder={selectedRoom ? "Tìm đề thi…" : "Chọn phòng trước"} aria-label="Tìm đề thi" disabled={!selectedRoom} /></div></label><div className="admin-session-exam-list" role="listbox" aria-label="Chọn đề thi">{availableExams.length ? availableExams.map(exam => <button type="button" role="option" aria-selected={exam.id === form.examId} className={exam.id === form.examId ? "selected" : ""} key={exam.id} onClick={() => selectExam(exam.id)}><span><b>{exam.title}</b><small>{normalizeExamType(exam.exam_type)} · {formatDuration(exam.duration_minutes)}</small></span><ArrowRight aria-hidden="true" /></button>) : <p className="admin-session-muted">{selectedRoom ? "Phòng này chưa có đề đã xuất bản." : "Chọn phòng để xem các đề."}</p>}</div></div></div></section>}

      {step === 2 && <section className="admin-session-wizard-panel" aria-labelledby="wizard-mode-title"><div className="admin-session-panel-heading"><div><span className="admin-session-wizard-kicker">BƯỚC 2 / 4</span><h2 id="wizard-mode-title">Chọn cách người tham gia vào kíp</h2><p>Cho phép học viên có tài khoản vào nhanh; người chưa có tài khoản chỉ điền thông tin cần thiết qua link.</p></div><ShieldCheck aria-hidden="true" /></div><div className="admin-session-mode-grid"><button type="button" className={form.mode === "account" ? "selected" : ""} aria-pressed={form.mode === "account"} onClick={() => updateForm({ mode: "account" })}><span className="admin-session-mode-icon"><UserRound aria-hidden="true" /></span><span><b>Tài khoản học viên</b><small>Học viên đăng nhập bằng tài khoản được cấp. Phù hợp thi nội bộ, theo lớp hoặc theo phân quyền.</small></span><i>{form.mode === "account" ? <Check aria-hidden="true" /> : null}</i></button><button type="button" className={form.mode === "link_qr" ? "selected" : ""} aria-pressed={form.mode === "link_qr"} onClick={() => updateForm({ mode: "link_qr" })}><span className="admin-session-mode-icon"><Link2 aria-hidden="true" /></span><span><b>Link / QR không cần tài khoản</b><small>Người tham gia mở link rồi điền các trường thông tin được yêu cầu.</small></span><i>{form.mode === "link_qr" ? <Check aria-hidden="true" /> : null}</i></button><button type="button" className={form.mode === "both" ? "selected" : ""} aria-pressed={form.mode === "both"} onClick={() => updateForm({ mode: "both" })}><span className="admin-session-mode-icon"><ClipboardCheck aria-hidden="true" /></span><span><b>Tài khoản + Link/QR</b><small>Học viên có tài khoản đăng nhập như bình thường; người chưa có tài khoản dùng link và chỉ nhập thông tin còn thiếu.</small></span><i>{form.mode === "both" ? <Check aria-hidden="true" /> : null}</i></button></div><div className="admin-session-info-callout"><CheckCircle2 aria-hidden="true" /><p><b>{selectedExam?.title}</b> · {selectedRoom?.title}. Hai cách tham gia dùng chung thời gian kíp và được theo dõi trong cùng trang kết quả.</p></div></section>}

      {step === 3 && <section className="admin-session-wizard-panel" aria-labelledby="wizard-time-title"><div className="admin-session-panel-heading"><div><span className="admin-session-wizard-kicker">BƯỚC 3 / 4</span><h2 id="wizard-time-title">Thiết lập thời gian và quy tắc</h2><p>Thời lượng đề là thời gian làm bài; thời gian kíp là khoảng cho phép người tham gia bắt đầu.</p></div><CalendarClock aria-hidden="true" /></div><div className="admin-session-form-section"><div className="admin-session-section-title"><b>Lịch mở kíp</b><span>Thời lượng đề: {formatDuration(selectedSection?.duration_minutes ?? selectedExam?.duration_minutes ?? 90)}</span></div><div className="admin-session-quick-actions"><button type="button" className="admin-session-quick-option" onClick={() => updateSchedule("now")}><CalendarClock aria-hidden="true" /><span><b>Mở sau 5 phút</b><small>Phù hợp khi cần chia sẻ ngay</small></span></button><button type="button" className="admin-session-quick-option" onClick={() => updateSchedule("later")}><CalendarClock aria-hidden="true" /><span><b>Đặt lịch sau 1 giờ</b><small>Có thể chỉnh lại ngày giờ bên dưới</small></span></button></div><div className="admin-session-field-grid"><label className="admin-session-field"><span>Thời điểm mở</span><input type="datetime-local" value={form.startsAt} onChange={event => updateForm({ startsAt: event.target.value })} required /></label><label className="admin-session-field"><span>Thời điểm kết thúc nhận bài</span><input type="datetime-local" value={form.endsAt} onChange={event => updateForm({ endsAt: event.target.value })} required /></label><label className="admin-session-field"><span>Gia hạn sau giờ kết thúc (phút)</span><input type="number" min={0} max={1440} value={form.gracePeriodMinutes} onChange={event => updateForm({ gracePeriodMinutes: Number(event.target.value) })} /><small>Khuyến nghị 30 phút để lượt đang làm có thể hoàn tất.</small></label></div></div><div className="admin-session-form-section"><div className="admin-session-section-title"><b>Thông tin kíp</b><span>{form.mode === "account" ? "Tên kíp giúp nhận biết lịch tài khoản." : form.mode === "both" ? "Một kíp, hai cách tham gia; người có tài khoản không cần điền lại thông tin." : "Tên này sẽ xuất hiện trong danh sách link."}</span></div><div className="admin-session-field-grid"><label className="admin-session-field"><span>Tên kíp thi</span><input value={form.name} maxLength={120} onChange={event => updateForm({ name: event.target.value })} placeholder="Ví dụ: Kíp sáng · Lớp 12A1" required /><small>Dùng tên ngắn, dễ phân biệt khi theo dõi.</small></label><label className="admin-session-field"><span>Số lượt làm tối đa</span><input type="number" min={0} max={1000} value={form.maxAttempts} onChange={event => updateForm({ maxAttempts: Number(event.target.value) })} /><small>0 = không giới hạn.</small></label></div>{(form.mode === "account" || form.mode === "both") && <div className="admin-session-rule-group"><div className="admin-session-rule-group-heading"><b>Người có tài khoản</b><small>Đăng nhập để dùng thông tin đã có trong hồ sơ.</small></div><label><span>Phạm vi học viên</span><select value={form.rosterMode} onChange={event => updateForm({ rosterMode: event.target.value as RosterMode })}><option value="open">Tất cả học viên có quyền vào phòng</option><option value="enrolled">Chỉ học viên được phân quyền</option></select></label></div>}{(form.mode === "link_qr" || form.mode === "both") && <div className="admin-session-rule-group"><div className="admin-session-rule-group-heading"><b>Người chưa có tài khoản</b><small>Vào bằng link/QR và chỉ điền thông tin được yêu cầu.</small></div><label><span>Giám sát kỹ thuật</span><select value={form.monitorMode} onChange={event => updateForm({ monitorMode: event.target.value as MonitorMode })}><option value="off">Tắt</option><option value="exit">Ghi nhận rời tab / toàn màn hình</option><option value="advanced">Nâng cao: thêm mất focus, copy/dán</option></select></label>{independentSubjectExam && <label className="admin-session-field admin-session-subject-field"><span>Môn thi áp dụng cho link</span><select value={form.sectionId} onChange={event => updateForm({ sectionId: event.target.value })} required><option value="">Chọn môn thi</option>{sections.map(section => <option value={section.id} key={section.id}>{section.title}{section.duration_minutes ? ` · ${section.duration_minutes} phút` : ""}</option>)}</select><small>Đề {normalizeExamType(selectedExam?.exam_type)} gồm các phần độc lập; mỗi link nên gắn với một môn.</small></label>}<label className="admin-session-field admin-session-password-field"><span><LockKeyhole aria-hidden="true" /> Mật khẩu kíp (tùy chọn)</span><input type="password" autoComplete="new-password" value={form.password} maxLength={120} onChange={event => updateForm({ password: event.target.value })} placeholder="Bỏ trống nếu không dùng" /></label></div>}<div className="admin-session-rule-group"><div className="admin-session-rule-group-heading"><b>Công bố kết quả</b><small>Chọn thời điểm công bố điểm thi cho thí sinh.</small></div><label><span>Công bố điểm</span><select value={form.releaseMode} onChange={event => updateForm({ releaseMode: event.target.value as ReleaseMode })}><option value="after_submit">Ngay sau khi nộp bài</option><option value="after_slot">Sau khi kíp kết thúc</option><option value="manual">Giáo viên công bố thủ công</option><option value="never">Không công bố điểm</option></select></label></div></div></section>}

      {step === 4 && <section className="admin-session-wizard-panel" aria-labelledby="wizard-review-title"><div className="admin-session-panel-heading"><div><span className="admin-session-wizard-kicker">BƯỚC 4 / 4</span><h2 id="wizard-review-title">Kiểm tra trước khi tạo</h2><p>Kiểm tra nhanh các thông tin chính. Bạn vẫn có thể quay lại chỉnh sửa.</p></div><CheckCircle2 aria-hidden="true" /></div><div className="admin-session-review"><div className="admin-session-review-hero"><span className="admin-session-review-type">{form.mode === "account" ? <UserRound aria-hidden="true" /> : form.mode === "both" ? <ClipboardCheck aria-hidden="true" /> : <Link2 aria-hidden="true" />}{modeLabel(form.mode)}</span><h3>{form.name || selectedExam?.title}</h3><p>{selectedExam?.title} · {selectedRoom?.title}</p></div><dl><div><dt>Thời gian kíp</dt><dd>{formatDateTime(form.startsAt)} → {formatDateTime(form.endsAt)}</dd></div><div><dt>Thời lượng mỗi lượt</dt><dd>{formatDuration(selectedSection?.duration_minutes ?? selectedExam?.duration_minutes ?? 90)}</dd></div><div><dt>Gia hạn</dt><dd>{form.gracePeriodMinutes} phút</dd></div><div><dt>Lượt làm tối đa</dt><dd>{form.maxAttempts === 0 ? "Không giới hạn" : `${form.maxAttempts} lượt`}</dd></div><div><dt>Người có tài khoản</dt><dd>{form.mode === "link_qr" ? "Không áp dụng" : form.rosterMode === "enrolled" ? "Học viên được phân quyền" : "Học viên có quyền vào phòng"}</dd></div><div><dt>Người chưa có tài khoản</dt><dd>{form.mode === "account" ? "Không áp dụng" : "Điền thông tin qua link / QR"}</dd></div><div><dt>Giám sát kỹ thuật</dt><dd>{form.mode === "account" ? "Không áp dụng" : form.monitorMode === "advanced" ? "Nâng cao (Rời tab, focus, copy/dán)" : form.monitorMode === "exit" ? "Ghi nhận rời tab / toàn màn hình" : "Tắt"}</dd></div><div><dt>Kết quả</dt><dd>{form.releaseMode === "manual" ? "Giáo viên công bố thủ công" : form.releaseMode === "after_submit" ? "Ngay sau khi nộp bài" : form.releaseMode === "never" ? "Không công bố điểm" : "Sau khi kíp kết thúc"}</dd></div></dl></div><div className="admin-session-review-note"><ShieldCheck aria-hidden="true" /><p>{form.mode === "account" ? "Hệ thống sẽ lưu lịch vào quy tắc tài khoản của đề. Các lượt thi mới dùng snapshot quy tắc này." : loadingGuestSettings ? "Đang kiểm tra cấu hình link hiện tại…" : form.mode === "both" ? "Hệ thống sẽ lưu cùng thời gian cho tài khoản và link/QR, sau đó tạo token chia sẻ. Người có tài khoản không cần nhập lại thông tin hồ sơ." : "Hệ thống sẽ lưu cấu hình link trước rồi tạo token mới. Link cũ của các kíp khác không bị ảnh hưởng."}</p></div></section>}

      <footer className="admin-session-wizard-footer"><button type="button" className="admin-session-wizard-secondary" onClick={step === 1 ? () => navigate("/admin/sessions") : previousStep}><ArrowLeft aria-hidden="true" />{step === 1 ? "Hủy" : "Quay lại"}</button><span className="admin-session-wizard-footer-hint">{step < 4 ? "Bạn có thể kiểm tra lại ở bước cuối." : "Các thay đổi chỉ áp dụng cho lượt thi mới."}</span>{step < 4 ? <button type="submit" className="admin-session-wizard-primary" disabled={loadingExam || !selectedExam}>{step === 1 ? "Tiếp tục" : "Tiếp tục"}<ArrowRight aria-hidden="true" /></button> : <button type="submit" className="admin-session-wizard-primary" disabled={saving || loadingGuestSettings}>{saving ? "Đang tạo…" : form.mode === "account" ? "Lưu lịch tài khoản" : "Tạo kíp & sinh link"}<Check aria-hidden="true" /></button>}</footer>
    </form>
  </section>;
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}
