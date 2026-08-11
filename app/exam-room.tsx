"use client";
/* eslint-disable @next/next/no-img-element -- exam media URLs are dynamic author content */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  ArrowLeft, BarChart3, BookOpenCheck, Check, ChevronLeft, ChevronRight, ClipboardList,
  CircleAlert, Clock3, FileText, Fingerprint, Flag, GripVertical, Grid3X3,
  Maximize2, Play, RotateCcw, Search, Send, Timer, UserRound, X
} from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import { retryWithBackoff } from "../lib/request-retry";
import { answersMatch, hasAnswerValue } from "../lib/exam-answers";
import {
  createExamClientKeyPair,
  createExamRequestNonce,
  decryptExamPayload,
  exportExamPublicKey,
  type EncryptedExamEnvelope,
} from "../lib/exam-content-crypto";
import { EXAM_ROOM_TYPE_OPTIONS, isIndependentSubjectExamType, normalizeExamType, roomTypeLabel } from "../lib/exam-config";
import { getHsaCombination, HSA_PART3_SELECTION_PENDING_KEY, HSA_SELECTION_ANSWER_KEY, resolveHsaCombination } from "../lib/hsa-exam";
import { loadCandidateIdentity } from "../lib/exam-identity";
import type { ExamPolicy } from "../lib/exam-policy";
import { formatLatexAnswerForDisplay, parseLatexQuestion, questionToLatex, type LatexMatchingData } from "../lib/exam-latex";
import LoadingIndicator from "./loading-indicator";
import AccountSecurityGuard from "./account-security-guard";
import ExamFullscreenGuard, { enterExamFullscreen, leaveExamFullscreen } from "./exam-fullscreen-guard";
import RemixStudyEduExamRenderer from "../components/remixstudyedu/ExamRendererAdapter";
import HsaCombinationPicker from "../components/remixstudyedu/HsaCombinationPicker";
import HsaConfirmation from "../components/remixstudyedu/HsaConfirmation";
import ThptqgExamRenderer, { type ThptqgProgress } from "../components/thptqg/ThptqgExamRenderer";
import ThptqgSubjectDashboard from "../components/thptqg/ThptqgSubjectDashboard";
import ThptqgConfirmation from "../components/thptqg/ThptqgConfirmation";
import ThptqgResult from "../components/thptqg/ThptqgResult";
import LearnerExamPreview, { type PreviewItem } from "../components/remixstudyedu/LearnerExamPreview";
import RemixStudyEduReviewPreview from "../components/remixstudyedu/RemixStudyEduReviewPreview";
import "./exam-room.css";
import "./exam-themes.css";
import "./exam-catalog-redesign.css";
import "./exam-result-product.css";

type Room = { id: string; title: string; description: string; exam_type: string; access_mode: string; registration_start: string | null; registration_end: string | null; exam_start: string | null; exam_end: string | null; published: boolean; sort_order: number };
type Exam = { id: string; room_id: string; title: string; description: string; dashboard_title?: string | null; exam_type: string; mode: string; duration_minutes: number; published: boolean; sort_order: number; created_at?: string | null };
type Section = { id: string; exam_id: string; title: string; duration_minutes: number | null; sort_order: number; subject_code?: string | null };
type OptionValue = string | { id?: string; value?: string; label?: string; text?: string; slot?: string };
type QuestionType = "single" | "multiple" | "text" | "inline" | "true_false" | "ordering" | "drag_drop";
type Question = { id: string; section_id: string; prompt: string; question_type: QuestionType; options: OptionValue[]; points: number; sort_order: number; passage?: string | null; media_url?: string | null; instruction?: string | null; latex_source?: string | null; option_order?: string[]; option_columns?: number; matching?: LatexMatchingData; part?: 1 | 2 | 3; index?: number; _displayNumber?: number; _partInstruction?: string; _loading?: boolean; _loadError?: string };
type AnswerValue = string | string[];
type Attempt = { id: string; exam_id: string; mode: "practice" | "exam"; section_id?: string | null; student_id?: string; status: string; score: number; correct_answers: number; total_questions: number; submitted_at: string | null; started_at?: string; deadline_at?: string | null; answers?: Record<string, AnswerValue>; flagged_questions?: string[]; exam_code?: string | null; progress_version?: number; time_extension_seconds?: number; network_state?: string; monitor_events?: Array<unknown>; duration_seconds?: number | null; current_section_id?: string | null; section_started_at?: string | null; policy?: ExamPolicy };
type AnswerKey = { question_id: string; correct_answer: AnswerValue | null; explanation: string; voided?: boolean };
// The server may intentionally send null for unreleased values. Keep the
// renderer's historical numeric contract here and use resultVisibility to
// control presentation; runtime nulls are handled by the guarded UI.
type ResultAttempt = Omit<Attempt, "score" | "correct_answers"> & { score: number | null; correct_answers: number | null };
type ExamRouteStep = "list" | "confirm" | "take";
type RouteState = { page: "rooms" | "room" | "exam" | "result"; id?: string; mode?: "practice" | "exam"; sectionId?: string; examStep?: ExamRouteStep; hsaSelectionCode?: string };
type ThptqgProgressSnapshot = { attemptId: string; sectionId: string; answers: Record<string, AnswerValue>; flaggedQuestions: string[]; progressVersion: number; networkState: string; monitorEvents?: string[] };
type ExamContentManifest = { activeSectionId: string | null; questionCounts: Record<string, number> };
type QuestionGroupPayload = { kind: "question-group"; attemptId: string; sectionId: string; requestedIndex: number; questionCount: number; questions: Question[]; serverTime: string };
type ExamBundle = { room: Room; exam: Exam; sections: Section[]; questions: Question[]; questionCounts: Record<string, number>; policy?: ExamPolicy; activeAttempt?: Attempt | null; subjectAttempts?: Attempt[] };

const EXAM_API_TIMEOUT_MS = 20_000;
const THPTQG_PROGRESS_DEBOUNCE_MS = 700;
const CONTENT_REQUEST_WINDOW = 5;

class ExamApiError extends Error {
  status: number;
  retryAfter: number;
  retryAfterMs: number;
  constructor(message: string, status: number, retryAfter = 0) {
    super(message);
    this.name = "ExamApiError";
    this.status = status;
    this.retryAfter = retryAfter;
    this.retryAfterMs = Math.max(0, retryAfter * 1000);
  }
}

function resultPreviewItem(question: Question, key?: AnswerKey): PreviewItem {
  const fallbackOptions = question.options.map((option, index) => {
    if (typeof option === "string") return { value: String.fromCharCode(65 + index), label: option };
    return {
      value: option.value ?? option.id ?? String.fromCharCode(65 + index),
      label: option.label ?? option.text ?? option.value ?? `Phương án ${index + 1}`,
    };
  });
  const fallbackSource = questionToLatex({
    prompt: question.prompt,
    question_type: question.question_type,
    options: fallbackOptions,
    option_columns: question.option_columns,
    matching: question.matching,
  }, key?.correct_answer ?? undefined, key?.explanation ?? "");
  let parsed;
  try {
    parsed = parseLatexQuestion(question.latex_source?.trim() || fallbackSource);
  } catch {
    parsed = parseLatexQuestion(fallbackSource);
  }
  const effectiveOptions = parsed.options.length ? parsed.options : fallbackOptions;
  const correctAnswer = hasAnswerValue(key?.correct_answer) ? key?.correct_answer : parsed.correctAnswer;
  const parsedQuestionType = parsed.matching || parsed.options.length || parsed.questionType !== "text"
    ? parsed.questionType
    : question.question_type;
  return {
    parsed: {
      ...parsed,
      questionType: parsedQuestionType,
      optionColumns: question.option_columns ?? parsed.optionColumns,
      part: question.part ?? parsed.part,
      options: effectiveOptions,
      correctAnswer,
      solution: parsed.solution.trim() || key?.explanation || "",
    },
    instruction: question.instruction ?? undefined,
    passage: question.passage ?? undefined,
    mediaUrl: question.media_url ?? undefined,
    correctAnswer,
    displayNumber: question._displayNumber,
    partInstruction: question._partInstruction,
  };
}

function routeState(): RouteState {
  if (typeof window === "undefined") return { page: "rooms" };
  const segments = window.location.pathname.split("/").filter(Boolean);
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") === "exam" ? "exam" : "practice";
  const hsaSelectionCode = getHsaCombination(params.get("selection"))?.code;
  if (segments[0] === "exam" && segments[1] === "result" && segments[2]) return { page: "result", id: decodeURIComponent(segments[2]) };
  if (segments[0] === "exam" && segments[1] && segments[2] === "section" && segments[3]) {
    return {
      page: "exam",
      id: decodeURIComponent(segments[1]),
      sectionId: decodeURIComponent(segments[3]),
      examStep: segments[4] === "confirm" ? "confirm" : "take",
      mode,
      hsaSelectionCode,
    };
  }
  if (segments[0] === "exam" && segments[1]) return { page: "exam", id: decodeURIComponent(segments[1]), mode, examStep: "list", hsaSelectionCode };
  if (segments[0] === "exam-room" && segments[1]) return { page: "room", id: decodeURIComponent(segments[1]) };
  return { page: "rooms" };
}

function examListPath(examId: string, mode: "practice" | "exam", hsaSelectionCode?: string) {
  const params = new URLSearchParams({ mode });
  const combination = getHsaCombination(hsaSelectionCode);
  if (combination) params.set("selection", combination.code);
  return `/exam/${encodeURIComponent(examId)}?${params.toString()}`;
}

function examSectionPath(examId: string, sectionId: string, mode: "practice" | "exam", step: "confirm" | "take", hsaSelectionCode?: string) {
  const params = new URLSearchParams({ mode });
  const combination = getHsaCombination(hsaSelectionCode);
  if (combination) params.set("selection", combination.code);
  return `/exam/${encodeURIComponent(examId)}/section/${encodeURIComponent(sectionId)}${step === "confirm" ? "/confirm" : ""}?${params.toString()}`;
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "Không giới hạn";
  return new Intl.DateTimeFormat("vi-VN", includeTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(new Date(value));
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor(safe % 3600 / 60);
  const rest = safe % 60;
  return `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function completedAttempts(attempts: Attempt[]) {
  return [...attempts]
    .filter(attempt => attempt.status !== "in_progress" && Boolean(attempt.submitted_at))
    .sort((left, right) => new Date(right.submitted_at ?? right.started_at ?? 0).getTime() - new Date(left.submitted_at ?? left.started_at ?? 0).getTime());
}

function optionParts(option: OptionValue, index: number) {
  if (typeof option === "string") return { value: option, label: option };
  return { value: option.value ?? option.id ?? String(index), label: option.label ?? option.text ?? option.value ?? `Phương án ${index + 1}` };
}

function sectionDurationMinutes(exam: Exam, section: Section | undefined, policy?: ExamPolicy) {
  // A THPTQG subject keeps its section-specific duration. Other runners use
  // the immutable attempt policy when one exists, falling back to the exam
  // metadata for legacy attempts.
  return Math.max(1, section?.duration_minutes ?? policy?.timing.durationMinutes ?? exam.duration_minutes);
}

function sectionSecondsLeft(exam: Exam, section: Section | undefined, attempt: Attempt, policy?: ExamPolicy) {
  const durationMinutes = sectionDurationMinutes(exam, section, policy);
  const total = durationMinutes * 60 + Math.max(0, Number(attempt.time_extension_seconds) || 0);
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(attempt.section_started_at ?? attempt.started_at ?? Date.now()).getTime()) / 1000));
  const sectionRemaining = Math.max(0, total - elapsed);
  const serverDeadline = new Date(attempt.deadline_at ?? "").getTime();
  if (!Number.isFinite(serverDeadline)) return sectionRemaining;
  const serverRemaining = Math.max(0, Math.ceil((serverDeadline - Date.now()) / 1000));
  return Math.min(sectionRemaining, serverRemaining);
}

function answerComplete(question: Question, value: AnswerValue | undefined) {
  if (Array.isArray(value)) {
    if (!value.length || value.some(item => !String(item).trim())) return false;
    if (question.question_type === "true_false" || question.question_type === "ordering") return value.length >= question.options.length;
    if (question.question_type === "inline" || question.question_type === "drag_drop") return value.length >= Math.max(1, (question.prompt.match(/___+/g) ?? []).length);
    return true;
  }
  return typeof value === "string" && value.trim().length > 0;
}

async function examApiOnce<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const callerSignal = init?.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new Error("Máy chủ phản hồi quá lâu. Vui lòng kiểm tra kết nối và thử nộp lại.");
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timeoutError);
    }, EXAM_API_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([
      authenticatedFetch(path, {
        ...init,
        signal: controller.signal,
        cache: "no-store",
        headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
      }),
      timeout,
    ]);
    const payload = await response.json().catch(() => null) as T & { error?: string } | null;
    if (!response.ok) throw new ExamApiError(payload?.error || "Không thể tải dữ liệu khảo thí.", response.status, Number(response.headers.get("retry-after")) || 0);
    return payload as T;
  } catch (value) {
    if (timedOut) throw timeoutError;
    throw value;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

async function examApi<T>(path: string, init?: RequestInit): Promise<T> {
  let action = "";
  if (typeof init?.body === "string") {
    try { action = String((JSON.parse(init.body) as { action?: unknown }).action ?? ""); } catch { action = ""; }
  }
  return retryWithBackoff(() => examApiOnce<T>(path, init), {
    // Progress snapshots are monotonic and safe to retry; start/submit also
    // get one bounded retry for a transient gateway/network failure.
    maxRetries: action === "progress" ? 3 : 1,
  });
}

function MathContent({ children, className = "", autoMath = true }: { children: string; className?: string; autoMath?: boolean }) {
  const content = autoMath ? String(formatLatexAnswerForDisplay(children)) : children;
  const pieces = useMemo(() => {
    const tokens: Array<{ text: string; math: boolean; display: boolean }> = [];
    const expression = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;
    let cursor = 0;
    for (const match of content.matchAll(expression)) {
      const index = match.index ?? 0;
      if (index > cursor) tokens.push({ text: content.slice(cursor, index), math: false, display: false });
      const raw = match[0];
      const display = raw.startsWith("$$") || raw.startsWith("\\[");
      tokens.push({ text: raw.replace(/^\$\$|\$\$$|^\$|\$$|^\\\[|\\\]$|^\\\(|\\\)$/g, ""), math: true, display });
      cursor = index + raw.length;
    }
    if (cursor < content.length) tokens.push({ text: content.slice(cursor), math: false, display: false });
    return tokens.length ? tokens : [{ text: content, math: false, display: false }];
  }, [content]);
  return <span className={`exam-math-content ${className}`}>{pieces.map((piece, index) => piece.math
    ? <span key={index} className={piece.display ? "exam-formula display" : "exam-formula"} dangerouslySetInnerHTML={{ __html: katex.renderToString(piece.text, { displayMode: piece.display, throwOnError: false, trust: false, strict: false }) }} />
    : <span key={index}>{piece.text}</span>)}</span>;
}

export default function ExamRoomModule() {
  const [route, setRoute] = useState<RouteState>({ page: "rooms" });
  useEffect(() => {
    const sync = () => setRoute(routeState());
    sync(); window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const navigate = useCallback((path: string) => { window.history.pushState({}, "", path); setRoute(routeState()); window.dispatchEvent(new PopStateEvent("popstate")); window.scrollTo({ top: 0, behavior: "smooth" }); }, []);
  if (route.page === "room" && route.id) return <ExamList roomId={route.id} navigate={navigate} />;
  if (route.page === "exam" && route.id) return <ExamRunner examId={route.id} mode={route.mode ?? "practice"} sectionId={route.sectionId} routeStep={route.examStep ?? "list"} hsaSelectionCode={route.hsaSelectionCode} navigate={navigate} />;
  if (route.page === "result" && route.id) return <ExamResult attemptId={route.id} navigate={navigate} />;
  return <ExamRoomCatalog />;
}

function PageState({ loading, error, empty, onRetry }: { loading?: boolean; error?: string; empty?: string; onRetry?: () => void }) {
  if (loading) return <div className="exam-page-state"><LoadingIndicator label="Đang tải dữ liệu khảo thí…" /></div>;
  if (error) return <div className="exam-page-state error"><CircleAlert/><h3>Không thể tải dữ liệu</h3><p>{error}</p>{onRetry && <button onClick={onRetry}><RotateCcw/>Thử lại</button>}</div>;
  return <div className="exam-page-state"><BookOpenCheck/><h3>Chưa có phòng thi</h3><p>{empty}</p></div>;
}

function ExamRoomCatalog() {
  const [data, setData] = useState<{ rooms: Room[]; exams: Exam[]; attempts: Attempt[] } | null>(null);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [error, setError] = useState("");
  const load = useCallback(async () => { setError(""); setData(null); try { setData(await examApi("/api/exams?scope=rooms")); } catch (value) { setError(value instanceof Error ? value.message : "Không thể tải phòng thi."); } }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  if (!data) return <PageState loading={!error} error={error} onRetry={load} />;
  if (!data.rooms.length) return <PageState empty="Phòng thi sẽ xuất hiện sau khi quản trị viên xuất bản và cấp quyền cho bạn." />;
  const availableTypes = Array.from(new Set(data.rooms.map(room => normalizeExamType(room.exam_type)))).sort((left, right) => {
    const leftIndex = EXAM_ROOM_TYPE_OPTIONS.findIndex(option => option.value === left);
    const rightIndex = EXAM_ROOM_TYPE_OPTIONS.findIndex(option => option.value === right);
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
  const visibleRooms = data.rooms.filter(room => typeFilter === "ALL" || normalizeExamType(room.exam_type) === typeFilter);
  return <div className="exam-page exam-room-page">
    <header className="exam-page-heading reference-room-heading"><span>PHÒNG KHẢO THÍ</span><h1>Chọn loại phòng và đề thi</h1><p>Mỗi phòng có nhiều đề; chọn đúng loại kỳ thi trước khi bắt đầu.</p></header>
    <div className="exam-room-type-filters" role="tablist" aria-label="Loại phòng khảo thí">
      <button type="button" role="tab" aria-selected={typeFilter === "ALL"} className={typeFilter === "ALL" ? "active" : ""} onClick={() => setTypeFilter("ALL")}>Tất cả</button>
      {availableTypes.map(type => <button type="button" role="tab" aria-selected={typeFilter === type} key={type} className={typeFilter === type ? "active" : ""} onClick={() => setTypeFilter(type)}>{roomTypeLabel(type)}</button>)}
    </div>
    {!visibleRooms.length ? <PageState empty="Chưa có phòng thuộc loại này." /> : <div className="exam-room-grid">{visibleRooms.map(room => {
      const exams = data.exams.filter(exam => exam.room_id === room.id);
      const examIds = exams.map(exam => exam.id);
      const completed = new Set(data.attempts.filter(attempt => examIds.includes(attempt.exam_id) && attempt.status !== "in_progress").map(attempt => attempt.exam_id)).size;
      return <article className={`exam-room-card reference-room-card exam-theme-${normalizeExamType(room.exam_type).toLowerCase()}`} data-exam-type={normalizeExamType(room.exam_type).toLowerCase()} key={room.id}>
        <div className="reference-room-card-title"><span className="exam-type-badge">{roomTypeLabel(room.exam_type)}</span><h2>{room.title}</h2></div>
        <div className="reference-room-card-body">
          {room.description && <p className="reference-room-description">{room.description}</p>}
          <Meta icon={Clock3} label="Đăng ký" value={`${formatDate(room.registration_start, true)} - ${formatDate(room.registration_end, true)}`} />
          <Meta icon={Timer} label="Thời gian thi" value={`${formatDate(room.exam_start, true)} - ${formatDate(room.exam_end, true)}`} />
          <Meta icon={ClipboardList} label="Số lượng đề" value={`${exams.length} đề`} />
          <Meta icon={FileText} label="Cấu trúc" value={exams.length ? (isIndependentSubjectExamType(room.exam_type) ? "Các môn độc lập / đề" : "Các phần / đề") : "Chưa có đề"} />
        </div>
        <div className="reference-room-card-footer"><div className="reference-room-completion"><div><span>Hoàn thành</span><b>{completed}/{exams.length} đề</b></div><div className="exam-progress"><span style={{ width: `${exams.length ? completed / exams.length * 100 : 0}%` }} /></div></div><a href={`/exam-room/${encodeURIComponent(room.id)}`}>Xem các đề trong gói</a></div>
      </article>;
    })}</div>}
  </div>;
}

function Meta({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return <div className="exam-meta-item"><span><Icon/><small>{label}</small></span><b>{value}</b></div>;
}

function ExamList({ roomId, navigate }: { roomId: string; navigate: (path: string) => void }) {
  const [data, setData] = useState<{ room: Room; exams: Exam[]; sections: Section[]; attempts: Attempt[] } | null>(null);
  const [modeExam, setModeExam] = useState<Exam | null>(null);
  const [historyExam, setHistoryExam] = useState<Exam | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const historyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const load = useCallback(async () => { setError(""); setData(null); try { setData(await examApi(`/api/exams?scope=room&roomId=${encodeURIComponent(roomId)}`)); } catch (value) { setError(value instanceof Error ? value.message : "Không thể tải danh sách đề thi."); } }, [roomId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  if (!data) return <PageState loading={!error} error={error} onRetry={load} />;
  const visibleExams = data.exams.filter(exam => `${exam.title} ${exam.description}`.toLowerCase().includes(searchTerm.trim().toLowerCase()));
  return <div className={`exam-page exam-list-page exam-theme-${normalizeExamType(data.room.exam_type).toLowerCase()}`} data-exam-type={normalizeExamType(data.room.exam_type).toLowerCase()}>
    <button className="exam-back" onClick={() => navigate("/exam-room")}><ArrowLeft/>Quay lại phòng thi</button>
    <div className="exam-package-toolbar"><header className="exam-page-heading compact"><span>{roomTypeLabel(data.room.exam_type)} · GÓI ĐỀ</span><h1>Gói đề: {data.room.title}</h1><p>{data.exams.length} đề trong phòng · {isIndependentSubjectExamType(data.room.exam_type) ? "mỗi đề có các môn được cấu hình riêng." : "mỗi đề có thể gồm một hoặc nhiều phần thi."}</p></header><label className="exam-package-search"><Search/><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Tìm kiếm đề thi..." aria-label="Tìm kiếm đề thi"/></label></div>
    {!data.exams.length ? <PageState empty="Phòng này chưa có đề thi đã xuất bản." /> : !visibleExams.length ? <PageState empty="Không tìm thấy đề phù hợp với từ khóa." /> : <div className="exam-list-grid">{visibleExams.map(exam => {
      const attempts = data.attempts.filter(attempt => attempt.exam_id === exam.id);
      const history = completedAttempts(attempts);
      const active = attempts.filter(attempt => attempt.status === "in_progress").sort((left, right) => new Date(right.started_at ?? 0).getTime() - new Date(left.started_at ?? 0).getTime())[0];
      return <article className="exam-paper-card reference-exam-card" key={exam.id}>
        <div className="reference-exam-card-head"><h3 title={exam.title}>{exam.title}</h3></div>
        <div className="reference-exam-card-body">
          <div><span>Trạng thái:</span><b className="reference-exam-status">{exam.published ? "Đang mở" : "Chưa mở"}</b></div>
          <div><span>{isIndependentSubjectExamType(data.room.exam_type) ? "Môn thi:" : "Số phần thi:"}</span><strong>{data.sections.filter(section => section.exam_id === exam.id).length} {isIndependentSubjectExamType(data.room.exam_type) ? "môn" : "phần"}</strong></div>
          <div><span>Hình thức:</span><strong>{exam.mode === "scheduled" ? "Theo lịch" : "Miễn phí"}</strong></div>
          <div><span>Ngày tạo:</span><strong>{exam.created_at ? formatDate(exam.created_at) : "—"}</strong></div>
        </div>
        <div className="reference-exam-card-footer"><button type="button" className="reference-exam-history" disabled={!history.length} onClick={event => { historyTriggerRef.current = event.currentTarget; setHistoryExam(exam); }}>{history.length ? `Xem lịch sử (${history.length})` : "Chưa có lịch sử"}</button><button type="button" className="reference-exam-start" onClick={() => active ? navigate(`/exam/${encodeURIComponent(exam.id)}?mode=practice`) : setModeExam(exam)}>{active ? "Tiếp tục" : "Vào làm"}<Play/></button></div>
      </article>;
    })}</div>}
    {modeExam && <ModeDialog exam={modeExam} onClose={() => setModeExam(null)} onChoose={mode => navigate(`/exam/${encodeURIComponent(modeExam.id)}?mode=${mode}`)} />}
    {historyExam && <ExamAttemptHistoryDialog exam={historyExam} attempts={completedAttempts(data.attempts.filter(attempt => attempt.exam_id === historyExam.id))} onClose={() => { setHistoryExam(null); requestAnimationFrame(() => historyTriggerRef.current?.focus()); }} onOpen={attemptId => navigate(`/exam/result/${encodeURIComponent(attemptId)}`)} />}
  </div>;
}

function ExamAttemptHistoryDialog({ exam, attempts, onClose, onOpen }: { exam: Exam; attempts: Attempt[]; onClose: () => void; onOpen: (attemptId: string) => void }) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const page = dialog.closest(".exam-list-page");
    const background = page ? Array.from(page.children).filter(element => !element.contains(dialog)) : [];
    const previousOverflow = document.body.style.overflow;
    background.forEach(element => { if (element instanceof HTMLElement) element.inert = true; });
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')).filter(element => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      background.forEach(element => { if (element instanceof HTMLElement) element.inert = false; });
    };
  }, [onClose]);

  const formatAttemptDate = (value: string | null | undefined) => value
    ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "Chưa có thời gian";
  const statusLabel = (status: string) => status === "graded" ? "Đã chấm" : status === "completed" ? "Đã hoàn thành" : "Đã nộp";
  const openAttempt = (event: React.MouseEvent<HTMLAnchorElement>, attemptId: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(attemptId);
  };

  return <div className="exam-history-shade" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="exam-attempt-history-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-attempt-history-title">
      <header><div><span>Lịch sử làm bài</span><h2 id="exam-attempt-history-title">{exam.title}</h2><p>{attempts.length} lượt đã hoàn thành</p></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng lịch sử"><X aria-hidden="true" /></button></header>
      <div className="exam-attempt-history-list" role="list">
        {attempts.map((attempt, index) => <a role="listitem" href={`/exam/result/${encodeURIComponent(attempt.id)}`} className="exam-attempt-history-item" key={attempt.id} onClick={event => openAttempt(event, attempt.id)}>
          <div className="exam-attempt-history-item-head"><div><b>Lần thi {attempts.length - index}</b><time dateTime={attempt.submitted_at ?? undefined}>{formatAttemptDate(attempt.submitted_at ?? attempt.started_at)}</time></div>{index === 0 && <span>Mới nhất</span>}</div>
          <div className="exam-attempt-history-summary">
            <div className="exam-attempt-history-score"><small>Điểm</small><strong>{attempt.score == null ? "—" : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(attempt.score))}</strong></div>
            <dl><div><dt>Số câu đúng</dt><dd>{attempt.correct_answers == null ? "Chưa công bố" : `${attempt.correct_answers}/${attempt.total_questions}`}</dd></div><div><dt>Thời gian làm</dt><dd>{formatDuration(attempt.duration_seconds ?? 0)}</dd></div><div><dt>Trạng thái</dt><dd>{statusLabel(attempt.status)}</dd></div></dl>
            <ChevronRight aria-hidden="true" />
          </div>
        </a>)}
      </div>
    </section>
  </div>;
}

function ModeDialog({ exam, onClose, onChoose }: { exam: Exam; onClose: () => void; onChoose: (mode: "practice" | "exam") => void }) {
  return <div className="exam-modal-shade" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="exam-mode-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-mode-title"><button className="exam-modal-close" onClick={onClose} aria-label="Đóng"><X/></button><span>CHỌN CHẾ ĐỘ</span><h2 id="exam-mode-title">{exam.title}</h2><p>Luyện tập vẫn tính giờ theo từng phần và cho phép xem lại đáp án; thực chiến mô phỏng thời gian thi thật.</p><div className="exam-mode-options"><button onClick={() => onChoose("practice")}><BookOpenCheck/><b>Luyện tập</b><small>Có thời gian theo từng phần</small></button><button onClick={() => onChoose("exam")}><Timer/><b>Thực chiến</b><small>{exam.duration_minutes} phút</small></button></div><button className="exam-cancel" onClick={onClose}>Hủy</button></section></div>;
}

function ExamRunner({ examId, mode, sectionId, routeStep, hsaSelectionCode, navigate }: { examId: string; mode: "practice" | "exam"; sectionId?: string; routeStep: ExamRouteStep; hsaSelectionCode?: string; navigate: (path: string) => void }) {
  const [bundle, setBundle] = useState<ExamBundle | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<string[]>([]);
  const [networkState, setNetworkState] = useState("online");
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [, setSecondsLeft] = useState(0);
  const [candidateName, setCandidateName] = useState("Thí sinh");
  const [candidateId, setCandidateId] = useState("");
  const [, setConfirmSubmit] = useState(false);
  const [, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [selectedHsaCombinationCode, setSelectedHsaCombinationCode] = useState(() => resolveHsaCombination(hsaSelectionCode).code);
  const [loadedQuestions, setLoadedQuestions] = useState<Record<number, Question>>({});
  const [questionLoadErrors, setQuestionLoadErrors] = useState<Record<number, string>>({});
  const submittingRef = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressRef = useRef<ThptqgProgressSnapshot | null>(null);
  const progressVersionRef = useRef(0);
  const answersRef = useRef<Record<string, AnswerValue>>({});
  const flaggedQuestionsRef = useRef<string[]>([]);
  const attemptRef = useRef<Attempt | null>(null);
  const progressSavingRef = useRef(false);
  const flushProgressRef = useRef<() => void>(() => undefined);
  const loadedQuestionsRef = useRef<Record<number, Question>>({});
  const contentKeyPairRef = useRef<Promise<CryptoKeyPair> | null>(null);
  const contentInFlightRef = useRef<Map<number, Promise<void>>>(new Map());
  const activeContentLoadsRef = useRef(0);
  const contentLoadWaitersRef = useRef<Array<() => void>>([]);
  const contentContextRef = useRef("");
  const load = useCallback(async () => {
    setError(""); setBundle(null); setAttempt(null); setAnswers({}); setFlaggedQuestions([]); setNetworkState("online"); setActiveSectionIndex(0); setStarting(false);
    try {
      const query = new URLSearchParams({ scope: "exam", examId, mode });
      if (sectionId) query.set("sectionId", sectionId);
      else query.set("includeQuestions", "false");
      const loaded = await examApi<ExamBundle>(`/api/exams?${query.toString()}`);
      const isHsa = normalizeExamType(loaded.room.exam_type) === "HSA" || normalizeExamType(loaded.exam.exam_type) === "HSA";
      const part3Pending = isHsa && Boolean(loaded.activeAttempt?.answers?.[HSA_PART3_SELECTION_PENDING_KEY]);
      if (sectionId && !part3Pending && !(loaded.questionCounts?.[sectionId] ?? 0)) throw new Error("Phần thi chưa có câu hỏi đã xuất bản.");
      const requestedSectionIndex = sectionId ? loaded.sections.findIndex(section => section.id === sectionId) : -1;
      if (sectionId && requestedSectionIndex < 0) throw new Error("Phần thi không hợp lệ.");
      const restoredSectionIndex = loaded.sections.findIndex(section => section.id === loaded.activeAttempt?.current_section_id);
      const activeAttemptMode = loaded.activeAttempt?.mode ? (loaded.activeAttempt.mode === "exam" ? "exam" : "practice") : mode;
      if (loaded.activeAttempt && sectionId && restoredSectionIndex >= 0 && restoredSectionIndex !== requestedSectionIndex) {
        navigate(examListPath(examId, activeAttemptMode, getHsaCombination(loaded.activeAttempt.answers?.[HSA_SELECTION_ANSWER_KEY])?.code ?? hsaSelectionCode));
        return;
      }
      setBundle(loaded);
      const isThptqg = isIndependentSubjectExamType(loaded.room.exam_type) || isIndependentSubjectExamType(loaded.exam.exam_type);
      if (isHsa) {
        const storedCombination = getHsaCombination(loaded.activeAttempt?.answers?.[HSA_SELECTION_ANSWER_KEY]);
        setSelectedHsaCombinationCode(storedCombination?.code ?? resolveHsaCombination(hsaSelectionCode).code);
      }
      const candidate = await loadCandidateIdentity({ fallbackName: "Thí sinh" });
      setCandidateName(candidate.candidateName);
      setCandidateId(candidate.candidateId);
      if (requestedSectionIndex >= 0) setActiveSectionIndex(requestedSectionIndex);
      if (isThptqg && !sectionId) {
        setAttempt(null);
        setAnswers({});
        return;
      }
      if (loaded.activeAttempt) {
        const nextSectionIndex = requestedSectionIndex >= 0 ? requestedSectionIndex : restoredSectionIndex >= 0 ? restoredSectionIndex : 0;
        setAttempt(loaded.activeAttempt);
        setAnswers(loaded.activeAttempt.answers ?? {});
        setFlaggedQuestions(loaded.activeAttempt.flagged_questions ?? []);
        setNetworkState(loaded.activeAttempt.network_state ?? "online");
        progressVersionRef.current = loaded.activeAttempt.progress_version ?? 0;
        setActiveSectionIndex(nextSectionIndex);
        setSecondsLeft(sectionSecondsLeft(loaded.exam, loaded.sections[nextSectionIndex], loaded.activeAttempt, loaded.activeAttempt.policy ?? loaded.policy));
        if (activeAttemptMode !== mode) {
          navigate(examSectionPath(examId, sectionId || loaded.sections[nextSectionIndex]?.id, activeAttemptMode, routeStep === "take" ? "take" : "confirm", getHsaCombination(loaded.activeAttempt.answers?.[HSA_SELECTION_ANSWER_KEY])?.code ?? hsaSelectionCode));
          return;
        }
      }
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể mở đề thi."); }
  }, [examId, hsaSelectionCode, mode, navigate, sectionId]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { flaggedQuestionsRef.current = flaggedQuestions; }, [flaggedQuestions]);
  useEffect(() => { attemptRef.current = attempt; }, [attempt]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const examType = normalizeExamType(bundle?.room.exam_type || bundle?.exam.exam_type);
    document.documentElement.dataset.examType = examType.toLowerCase();
    return () => { delete document.documentElement.dataset.examType; };
  }, [bundle?.exam.exam_type, bundle?.room.exam_type]);
  const activeSection = bundle?.sections[activeSectionIndex];
  const activeQuestionCount = activeSection ? bundle?.questionCounts?.[activeSection.id] ?? 0 : 0;
  const contentContextKey = `${attempt?.id ?? "none"}:${activeSection?.id ?? "none"}`;

  useEffect(() => {
    contentContextRef.current = contentContextKey;
    loadedQuestionsRef.current = {};
    contentKeyPairRef.current = null;
    contentInFlightRef.current.clear();
    activeContentLoadsRef.current = 0;
    contentLoadWaitersRef.current.splice(0).forEach(resolve => resolve());
    setLoadedQuestions({});
    setQuestionLoadErrors({});
  }, [contentContextKey]);

  const acquireContentLoad = useCallback(async () => {
    if (activeContentLoadsRef.current < 2) {
      activeContentLoadsRef.current += 1;
      return;
    }
    await new Promise<void>(resolve => contentLoadWaitersRef.current.push(resolve));
    activeContentLoadsRef.current += 1;
  }, []);
  const releaseContentLoad = useCallback(() => {
    activeContentLoadsRef.current = Math.max(0, activeContentLoadsRef.current - 1);
    contentLoadWaitersRef.current.shift()?.();
  }, []);

  const loadQuestion = useCallback((index: number) => {
    if (!attempt?.id || !activeSection?.id || index < 0 || index >= activeQuestionCount) return Promise.resolve();
    if (loadedQuestionsRef.current[index]) return Promise.resolve();
    // The server responds with a five-question encrypted window. Share one
    // in-flight request across placeholders in that same window so list view
    // cannot create duplicate network work while the first response is pending.
    const requestSlot = Math.floor(index / CONTENT_REQUEST_WINDOW) * CONTENT_REQUEST_WINDOW;
    const existing = contentInFlightRef.current.get(requestSlot);
    if (existing) return existing;
    const requestContext = `${attempt.id}:${activeSection.id}`;
    const workRef: { current: Promise<void> | null } = { current: null };
    const work = (async () => {
      await acquireContentLoad();
      try {
        setQuestionLoadErrors(previous => { const next = { ...previous }; delete next[index]; return next; });
        if (!contentKeyPairRef.current) contentKeyPairRef.current = createExamClientKeyPair();
        const keyPair = await contentKeyPairRef.current;
        const clientPublicKey = await exportExamPublicKey(keyPair);
        const requestOnce = async () => {
          const nonce = createExamRequestNonce();
          const envelope = await examApi<EncryptedExamEnvelope>("/api/exams/content", {
            method: "POST",
            body: JSON.stringify({ attemptId: attempt.id, sectionId: activeSection.id, index, clientPublicKey, nonce }),
          });
          return decryptExamPayload<QuestionGroupPayload>(envelope, keyPair.privateKey, {
            kind: "question",
            attemptId: attempt.id,
            sectionId: activeSection.id,
            index,
            nonce,
          });
        };
        let payload: QuestionGroupPayload;
        try {
          payload = await requestOnce();
        } catch (value) {
          if (!(value instanceof ExamApiError) || value.status !== 429 || value.retryAfter <= 0) throw value;
          await new Promise(resolve => setTimeout(resolve, Math.min(10, value.retryAfter) * 1000));
          payload = await requestOnce();
        }
        if (contentContextRef.current !== requestContext || payload.attemptId !== attempt.id || payload.sectionId !== activeSection.id) return;
        const additions = Object.fromEntries(payload.questions
          .filter(question => Number.isInteger(question.index) && Number(question.index) >= 0 && Number(question.index) < activeQuestionCount)
          .map(question => [Number(question.index), question]));
        loadedQuestionsRef.current = { ...loadedQuestionsRef.current, ...additions };
        setLoadedQuestions(loadedQuestionsRef.current);
      } catch (value) {
        if (contentContextRef.current !== requestContext) return;
        const message = value instanceof Error ? value.message : "Không thể tải câu hỏi.";
        setQuestionLoadErrors(previous => {
          const next = { ...previous };
          for (let offset = 0; offset < CONTENT_REQUEST_WINDOW; offset += 1) {
            const questionIndex = requestSlot + offset;
            if (questionIndex < activeQuestionCount) next[questionIndex] = message;
          }
          return next;
        });
      } finally {
        releaseContentLoad();
        if (contentInFlightRef.current.get(requestSlot) === workRef.current) contentInFlightRef.current.delete(requestSlot);
      }
    })();
    workRef.current = work;
    contentInFlightRef.current.set(requestSlot, work);
    return work;
  }, [acquireContentLoad, activeQuestionCount, activeSection?.id, attempt?.id, releaseContentLoad]);

  const activeQuestions = useMemo(() => Array.from({ length: activeQuestionCount }, (_, index) => {
    const loaded = loadedQuestions[index];
    if (loaded) {
      let parsed: ReturnType<typeof parseLatexQuestion> | null = null;
      try { parsed = loaded.latex_source?.trim() ? parseLatexQuestion(loaded.latex_source) : null; } catch { parsed = null; }
      return { ...loaded, option_columns: parsed?.optionColumns ?? loaded.option_columns ?? 1, part: parsed?.part ?? loaded.part };
    }
    return {
      id: `encrypted-slot-${activeSection?.id ?? "section"}-${index}`,
      section_id: activeSection?.id ?? "",
      prompt: "",
      question_type: "text" as const,
      options: [],
      points: 0,
      sort_order: index,
      index,
      _loading: true,
      _loadError: questionLoadErrors[index],
    };
  }), [activeQuestionCount, activeSection?.id, loadedQuestions, questionLoadErrors]);
  const beginAttempt = async () => {
    if (!bundle || starting) return;
    setStarting(true); setError("");
    try {
      const isHsa = normalizeExamType(bundle.room.exam_type) === "HSA" || normalizeExamType(bundle.exam.exam_type) === "HSA";
      const isThptqg = isIndependentSubjectExamType(bundle.room.exam_type) || isIndependentSubjectExamType(bundle.exam.exam_type);
      if (mode === "exam" && !isHsa && !await enterExamFullscreen()) {
        setError("Hãy cho phép trình duyệt mở toàn màn hình để bắt đầu chế độ thi.");
        setStarting(false);
        return;
      }
      const selectedCombination = resolveHsaCombination(selectedHsaCombinationCode);
      const pendingHsaPart3Start = isHsa && Boolean(attempt?.answers?.[HSA_PART3_SELECTION_PENDING_KEY]);
      const effectiveMode = attempt?.mode ? (attempt.mode === "exam" ? "exam" : "practice") : mode;
      const started = await examApi<{ attempt: Attempt; contentManifest?: ExamContentManifest }>("/api/exams", { method: "POST", body: JSON.stringify({ action: "start", examId, sectionId: isThptqg ? activeSection?.id : undefined, mode: effectiveMode, hsaSelectionCode: pendingHsaPart3Start ? selectedCombination.code : undefined }) });
      if (started.contentManifest) setBundle(previous => previous ? { ...previous, questionCounts: started.contentManifest!.questionCounts } : previous);
      setAttempt(started.attempt);
      setAnswers(started.attempt.answers ?? {});
      const startedHsaCombination = getHsaCombination(started.attempt.answers?.[HSA_SELECTION_ANSWER_KEY]);
      if (isHsa) setSelectedHsaCombinationCode(startedHsaCombination?.code ?? selectedCombination.code);
      setFlaggedQuestions(started.attempt.flagged_questions ?? []);
      setNetworkState(started.attempt.network_state ?? "online");
      progressVersionRef.current = started.attempt.progress_version ?? 0;
      const startedSectionIndex = bundle.sections.findIndex(section => section.id === started.attempt.current_section_id);
      const nextSectionIndex = startedSectionIndex >= 0 ? startedSectionIndex : 0;
      setActiveSectionIndex(nextSectionIndex);
      setSecondsLeft(sectionSecondsLeft(bundle.exam, bundle.sections[nextSectionIndex], started.attempt, started.attempt.policy ?? bundle.policy));
      setStarting(false);
      navigate(examSectionPath(examId, bundle.sections[nextSectionIndex].id, mode, "take", startedHsaCombination?.code));
    } catch (value) {
      if (mode === "exam") await leaveExamFullscreen();
      setError(value instanceof Error ? value.message : "Không thể bắt đầu bài thi.");
      setStarting(false);
    }
  };
  const scheduleProgress = useCallback(() => {
    if (submittingRef.current || progressTimerRef.current !== null) return;
    progressTimerRef.current = setTimeout(() => {
      progressTimerRef.current = null;
      flushProgressRef.current();
    }, THPTQG_PROGRESS_DEBOUNCE_MS);
  }, []);
  const flushProgress = useCallback(() => {
    if (submittingRef.current) return;
    if (progressSavingRef.current) {
      scheduleProgress();
      return;
    }
    const snapshot = pendingProgressRef.current;
    if (!snapshot) return;
    pendingProgressRef.current = null;
    progressSavingRef.current = true;
    const request = examApi<{ saved?: boolean; stale?: boolean; networkState?: string; deadlineAt?: string | null }>("/api/exams", {
      method: "POST",
      body: JSON.stringify({ action: "progress", attemptId: snapshot.attemptId, sectionId: snapshot.sectionId, answers: snapshot.answers, flaggedQuestions: snapshot.flaggedQuestions, progressVersion: snapshot.progressVersion, networkState: "saving", monitorEvents: snapshot.monitorEvents }),
    });
    void request.then(response => {
      if (response?.deadlineAt) setAttempt(current => current ? { ...current, deadline_at: response.deadlineAt } : current);
      if (response?.networkState === "saved" || response?.saved) setNetworkState("saved");
    }).catch(value => {
      if (value instanceof ExamApiError && (value.status === 410 || /kết thúc/i.test(value.message))) {
        pendingProgressRef.current = null;
        setSecondsLeft(0);
        return;
      }
      // Keep the failed snapshot for an online retry unless a newer snapshot
      // has already replaced it while this request was in flight.
      if (!pendingProgressRef.current) pendingProgressRef.current = snapshot;
      else if (snapshot.monitorEvents?.length) {
        pendingProgressRef.current = {
          ...pendingProgressRef.current,
          monitorEvents: [...snapshot.monitorEvents, ...(pendingProgressRef.current.monitorEvents ?? [])].slice(-20),
        };
      }
      setNetworkState(typeof navigator !== "undefined" && navigator.onLine ? "failed" : "offline");
    }).finally(() => {
      progressSavingRef.current = false;
      if (pendingProgressRef.current && !submittingRef.current) scheduleProgress();
    });
  }, [scheduleProgress]);
  useEffect(() => { flushProgressRef.current = flushProgress; }, [flushProgress]);
  useEffect(() => {
    const retryPendingProgress = () => {
      if (!pendingProgressRef.current || progressSavingRef.current || submittingRef.current) return;
      setNetworkState("retrying");
      scheduleProgress();
    };
    window.addEventListener("online", retryPendingProgress);
    return () => window.removeEventListener("online", retryPendingProgress);
  }, [scheduleProgress]);
  useEffect(() => () => {
    if (progressTimerRef.current !== null) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = null;
    pendingProgressRef.current = null;
  }, []);
  const enqueueProgress = useCallback((sectionId: string, nextAnswers: Record<string, AnswerValue>, nextFlags: string[], monitorEvent?: string) => {
    const currentAttempt = attemptRef.current;
    if (!currentAttempt?.id) return;
    const progressVersion = ++progressVersionRef.current;
    const pendingMonitorEvents = pendingProgressRef.current?.monitorEvents ?? [];
    const monitorEvents = monitorEvent ? [...pendingMonitorEvents, monitorEvent].slice(-20) : pendingMonitorEvents;
    setNetworkState("saving");
    pendingProgressRef.current = { attemptId: currentAttempt.id, sectionId, answers: nextAnswers, flaggedQuestions: nextFlags, progressVersion, networkState: "saving", ...(monitorEvents.length ? { monitorEvents } : {}) };
    scheduleProgress();
  }, [scheduleProgress]);
  const saveThptqgProgress = useCallback((progress: ThptqgProgress) => {
    if (!attempt?.id || !activeSection?.id) return;
    setAnswers(progress.answers);
    setFlaggedQuestions(progress.marked);
    void enqueueProgress(activeSection.id, progress.answers, progress.marked);
  }, [activeSection?.id, attempt?.id, enqueueProgress]);
  const saveRemixProgress = useCallback((progress: { answers: Record<string, unknown>; marked: string[] }) => {
    if (!activeSection?.id) return;
    const nextAnswers = Object.fromEntries(Object.entries(progress.answers).map(([questionId, value]) => [questionId, value as AnswerValue]));
    setAnswers(nextAnswers);
    setFlaggedQuestions(progress.marked);
    enqueueProgress(activeSection.id, nextAnswers, progress.marked);
  }, [activeSection?.id, enqueueProgress]);
  useEffect(() => {
    if (mode !== "exam" || !attempt || !bundle) return undefined;
    const integrity = (attempt.policy ?? bundle.policy)?.integrity;
    if (!integrity) return undefined;
    const sectionId = activeSection?.id ?? attempt.section_id ?? bundle.sections[0]?.id;
    if (!sectionId) return undefined;
    const send = (event: string) => enqueueProgress(sectionId, answersRef.current, flaggedQuestionsRef.current, event);
    const onVisibility = () => { if (integrity.visibilityMonitoring) send(document.hidden ? "visibility_hidden" : "visibility_visible"); };
    const onFullscreen = () => { if (integrity.warnOnExit) send(document.fullscreenElement ? "fullscreen_enter" : "fullscreen_exit"); };
    const onBlur = () => { if (integrity.focusMonitoring) send("window_blur"); };
    const onFocus = () => { if (integrity.focusMonitoring) send("window_focus"); };
    const onCopy = () => { if (integrity.copyProtection) send("copy"); };
    const onPaste = () => { if (integrity.pasteProtection) send("paste"); };
    const onCut = () => { if (integrity.copyProtection) send("cut"); };
    const onContextMenu = () => { if (integrity.contextMenuProtection) send("context_menu"); };
    const onNetwork = () => setNetworkState(navigator.onLine ? "online" : "offline");
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
    };
  }, [activeSection?.id, attempt, bundle, enqueueProgress, mode]);
  const submit = useCallback(async (nextAnswers: Record<string, unknown>) => {
    if (!attempt || !bundle || submittingRef.current) return;
    submittingRef.current = true;
    if (progressTimerRef.current !== null) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = null;
    pendingProgressRef.current = null;
    setSubmitting(true); setError(""); setConfirmSubmit(false);
    try {
      const sectionAnswers = Object.fromEntries(Object.entries(nextAnswers).map(([questionId, value]) => [questionId, value as AnswerValue]));
      const response = await examApi<{ completed: boolean; result?: Attempt; attempt?: Attempt; nextSectionId?: string; contentManifest?: ExamContentManifest }>("/api/exams", {
        method: "POST",
        body: JSON.stringify({ action: isIndependentSubjectExamType(bundle.room.exam_type) || isIndependentSubjectExamType(bundle.exam.exam_type) ? "submit" : activeSection ? "submit_section" : "submit", attemptId: attempt.id, sectionId: activeSection?.id, answers: sectionAnswers, flaggedQuestions, progressVersion: progressVersionRef.current }),
      });
       if (response.result) {
         navigate("/exam/result/" + encodeURIComponent(response.result.id));
         return;
       }
      const nextIndex = response.nextSectionId ? bundle.sections.findIndex(section => section.id === response.nextSectionId) : activeSectionIndex + 1;
      if (nextIndex < 0 || nextIndex >= bundle.sections.length || !response.attempt) throw new Error("Không xác định được phần thi tiếp theo.");
      const mergedAnswers = response.attempt.answers ?? { ...answers, ...sectionAnswers };
      if (response.contentManifest) setBundle(previous => previous ? { ...previous, questionCounts: response.contentManifest!.questionCounts } : previous);
      setAnswers(mergedAnswers);
      setAttempt({ ...attempt, ...response.attempt, answers: mergedAnswers });
      setActiveSectionIndex(nextIndex);
      setSecondsLeft(sectionSecondsLeft(bundle.exam, bundle.sections[nextIndex], response.attempt, response.attempt.policy ?? bundle.policy));
      const isHsa = normalizeExamType(bundle.room.exam_type) === "HSA" || normalizeExamType(bundle.exam.exam_type) === "HSA";
      navigate(examListPath(examId, mode, isHsa ? selectedHsaCombinationCode : undefined));
    }
    catch (value) {
      const submissionError = value instanceof Error ? value : new Error("Không thể nộp bài.");
      setError(submissionError.message);
      setConfirmSubmit(false);
      throw submissionError;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
 }, [activeSection, activeSectionIndex, answers, attempt, bundle, examId, flaggedQuestions, mode, navigate, selectedHsaCombinationCode]);
  if (!bundle) return <PageState loading={!error} error={error} onRetry={load} />;
   const isThptqg = isIndependentSubjectExamType(bundle.room.exam_type) || isIndependentSubjectExamType(bundle.exam.exam_type);
   const isHsa = normalizeExamType(bundle.room.exam_type) === "HSA" || normalizeExamType(bundle.exam.exam_type) === "HSA";
   const activeHsaCombination = resolveHsaCombination(selectedHsaCombinationCode);
   const hsaPart3SelectionPending = isHsa && Boolean(attempt?.answers?.[HSA_PART3_SELECTION_PENDING_KEY]);
   if (routeStep === "list") {
     if (isThptqg) return <ExamLayout><ThptqgSubjectDashboard room={bundle.room} exam={bundle.exam} sections={bundle.sections} attempts={bundle.subjectAttempts ?? []} candidateName={candidateName} candidateId={candidateId} dashboardTitle={bundle.exam.dashboard_title} mode={mode} onChoose={section => navigate(examSectionPath(examId, section.id, mode, "confirm"))} onContinue={section => navigate(examSectionPath(examId, section.id, mode, "take"))} onResult={attemptId => navigate(`/exam-result/${encodeURIComponent(attemptId)}`)} onExit={() => navigate(`/exam-room/${encodeURIComponent(bundle.room.id)}`)} /></ExamLayout>;
     if (isHsa) return <ExamLayout><div className="hsa-session-page"><ExamSessionList exam={bundle.exam} sections={bundle.sections} visibleFromIndex={attempt ? activeSectionIndex : 0} candidateName={candidateName} candidateId={candidateId} onContinue={section => navigate(examSectionPath(examId, section.id, mode, "confirm"))} onExit={() => navigate(`/exam-room/${encodeURIComponent(bundle.room.id)}`)} /></div></ExamLayout>;
     return <ExamLayout><ExamSessionList exam={bundle.exam} sections={bundle.sections} visibleFromIndex={attempt ? activeSectionIndex : 0} candidateName={candidateName} candidateId={candidateId} onContinue={section => navigate(examSectionPath(examId, section.id, mode, "confirm"))} onExit={() => navigate(`/exam-room/${encodeURIComponent(bundle.room.id)}`)} /></ExamLayout>;
   }
   if (!activeSection) return <PageState error="Không xác định được phần thi đang hoạt động." onRetry={load} />;
    if (!attempt || routeStep === "confirm") {
      if (isThptqg) return <ThptqgConfirmation room={bundle.room} exam={bundle.exam} section={activeSection} questionCount={activeQuestionCount} candidateName={candidateName} mode={mode} starting={starting} error={error} onStart={() => void beginAttempt()} onExit={() => navigate(examListPath(examId, mode))} />;
      if (isHsa) return <ExamLayout><HsaConfirmation examTitle={bundle.exam.title} sectionTitle={activeSection.title} durationMinutes={activeSection.duration_minutes ?? bundle.exam.duration_minutes} starting={starting} error={error} onStart={() => void beginAttempt()} combinationCode={activeHsaCombination.code} onCombinationChange={code => { setSelectedHsaCombinationCode(code); navigate(examSectionPath(examId, activeSection.id, mode, "confirm", code)); }} showCombinationPicker={hsaPart3SelectionPending || (activeSectionIndex >= 2)} /></ExamLayout>;
      return <ExamLayout><ExamConfirmation room={bundle.room} exam={bundle.exam} sections={bundle.sections} section={activeSection} candidateName={candidateName} mode={mode} starting={starting} error={error} onStart={() => void beginAttempt()} onExit={() => navigate(examListPath(examId, mode))} /></ExamLayout>;
    }
   if (isThptqg) return <ExamLayout>
     {mode === "exam" && <><AccountSecurityGuard activityType="exam" resourceId={examId} />{!isHsa && <ExamFullscreenGuard />}</>}
    <ThptqgExamRenderer
     examTitle={bundle.exam.title}
     subjectTitle={activeSection?.title ?? bundle.exam.title}
     candidateName={candidateName}
     candidateId={candidateId}
     mode={mode}
     questions={activeQuestions}
       initialAnswers={attempt.answers}
       initialMarked={flaggedQuestions}
       initialRemainingSeconds={sectionSecondsLeft(bundle.exam, activeSection, attempt, attempt.policy ?? bundle.policy)}
      onQuestionRequest={loadQuestion}
      onExit={() => navigate(examListPath(examId, mode))}
       onProgress={saveThptqgProgress}
       networkState={networkState}
       navigationPolicy={attempt.policy?.navigation ?? bundle.policy?.navigation}
      onSubmit={submission => submit(submission)}
    />
   </ExamLayout>;
   return <ExamLayout>
     {mode === "exam" && <><AccountSecurityGuard activityType="exam" resourceId={examId} />{!isHsa && <ExamFullscreenGuard />}</>}
    <RemixStudyEduExamRenderer
      key={attempt.id + "-" + (activeSection?.id ?? "all")}
      examTitle={bundle.exam.title}
      examType={roomTypeLabel(bundle.room.exam_type)}
      sectionTitle={isHsa && activeSection ? `${activeSection.title} · ${activeHsaCombination.code} · ${activeHsaCombination.shortLabel}` : activeSection?.title}
      durationMinutes={sectionDurationMinutes(bundle.exam, activeSection, attempt.policy ?? bundle.policy)}
       questions={activeQuestions}
       initialAnswers={attempt.answers}
       initialMarked={flaggedQuestions}
      initialRemainingSeconds={sectionSecondsLeft(bundle.exam, activeSection, attempt, attempt.policy ?? bundle.policy)}
      candidateName={candidateName}
       candidateId={candidateId}
       timed
       onQuestionRequest={loadQuestion}
       onProgress={saveRemixProgress}
       navigationPolicy={attempt.policy?.navigation ?? bundle.policy?.navigation}
       headerExtras={<ExamSaveState state={networkState} />}
      onSubmit={submission => submit(submission.answers)}
    />
  </ExamLayout>;
}

function FormattedMathContent({ children }: { children: string }) {
  const pieces = useMemo(() => children.split(/(\*{3}[\s\S]+?\*{3}|\*{2}[\s\S]+?\*{2}|\*[^*\n]+?\*)/g).filter(Boolean), [children]);
  return <>{pieces.map((piece, index) => piece.startsWith("***") && piece.endsWith("***")
    ? <strong key={index}><em><MathContent>{piece.slice(3, -3)}</MathContent></em></strong>
    : piece.startsWith("**") && piece.endsWith("**")
      ? <strong key={index}><MathContent>{piece.slice(2, -2)}</MathContent></strong>
      : piece.startsWith("*") && piece.endsWith("*")
        ? <em key={index}><MathContent>{piece.slice(1, -1)}</MathContent></em>
        : <MathContent key={index}>{piece}</MathContent>)}</>;
}

function RichContent({ children }: { children: string }) {
  const parts = useMemo(() => {
    const result: Array<{ kind: "text" | "image"; value: string; width?: string; display?: string }> = [];
    const pattern = /\$\/image_\{((?:https?:\/\/|\/api\/images\/|\/api\/exam-images\/)[^}]+)\}_\{([^}]*)\}_\{([^}]*)\}_\{([^}]*)\}\$/g;
    let cursor = 0;
    for (const match of children.matchAll(pattern)) {
      const index = match.index ?? 0;
      if (index > cursor) result.push({ kind: "text", value: children.slice(cursor, index) });
      result.push({ kind: "image", value: match[1], width: match[3], display: match[4] });
      cursor = index + match[0].length;
    }
    if (cursor < children.length) result.push({ kind: "text", value: children.slice(cursor) });
    return result.length ? result : [{ kind: "text" as const, value: children }];
  }, [children]);
  return <>{parts.map((part, index) => part.kind === "text" ? <FormattedMathContent key={index}>{part.value}</FormattedMathContent> : <figure key={index} className={`exam-rich-image ${part.display === "inline" ? "inline" : ""}`} style={{ "--image-width": `${Math.min(100, Math.max(10, Number(part.width) || 100))}%` } as React.CSSProperties}><img src={part.value} alt="Hình minh họa câu hỏi"/><a href={part.value} target="_blank" rel="noreferrer"><Maximize2/> Preview</a></figure>)}</>;
}

function ExamLayout({ children }: { children: React.ReactNode }) { return <div className="tsa-font min-h-screen bg-gray-50 flex flex-col lg:flex-row fixed inset-0 w-full z-[120]">{children}</div>; }

function ExamTimer({ secondsLeft }: { secondsLeft: number }) {
  return <div className={`exam-timer ${secondsLeft < 300 ? "warning" : ""}`}><Timer/><span><small>Thời gian còn lại</small><b>{formatDuration(secondsLeft)}</b></span></div>;
}

function ExamSaveState({ state }: { state: string }) {
  const labels: Record<string, string> = { saving: "Đang lưu…", saved: "Đã lưu", offline: "Ngoại tuyến", retrying: "Đang thử lại…", conflict: "Có xung đột", failed: "Chưa đồng bộ" };
  return <span className={"exam-save-state is-" + state} role="status" aria-live="polite">{labels[state] ?? "Đã kết nối"}</span>;
}

function ExamHeader({ title, examType, mode, secondsLeft, onExit, onMenu }: { title: string; examType: string; mode: "practice" | "exam"; secondsLeft: number; onExit: () => void; onMenu: () => void }) {
  return <header className="bg-white px-3 lg:px-6 py-2 flex-shrink-0"><div className="flex justify-between items-center"><div className="flex items-center min-w-0"><button className="exam-reference-brand h-8 w-8 lg:h-12 lg:w-12 rounded-lg bg-[#CE1628] text-white flex items-center justify-center font-black text-lg" onClick={onExit} aria-label="Thoát bài thi"><img src="/logo_tsa.svg" alt="TSA"/></button><h1 className="text-sm lg:text-[18px] leading-5 ml-2 lg:ml-4 font-bold line-clamp-1">{title}<span className="ml-1 text-sm lg:text-[18px] text-red-600">{mode === "exam" ? roomTypeLabel(examType) : "Luyện tập"}</span></h1></div><div className="lg:hidden flex items-center gap-2"><ExamTimer secondsLeft={secondsLeft}/><button className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md flex items-center space-x-2 text-sm transition-colors" onClick={onMenu} aria-label="Mở Menu / Nộp bài"><Grid3X3/></button></div></div></header>;
}

function ExamSessionList({ exam, sections, visibleFromIndex = 0, candidateName, candidateId, onContinue, onExit }: { exam: Exam; sections: Section[]; visibleFromIndex?: number; candidateName: string; candidateId: string; onContinue: (section: Section) => void; onExit: () => void }) {
  const firstVisibleIndex = Math.min(Math.max(0, visibleFromIndex), Math.max(0, sections.length - 1));
  return <main className="tsa-session-page" aria-labelledby="tsa-session-title">
    <div className="tsa-session-shell">
      <section className="tsa-session-card">
        <header className="tsa-session-profile">
           <div className="tsa-session-logo"><span className="tsa-math-remix-logo" aria-label="MATH REMIX">MATH <b>REMIX</b></span></div>
          <div className="tsa-session-details">
            <div className="tsa-session-detail"><span className="tsa-session-detail-icon"><UserRound aria-hidden="true" /></span><span><small>Họ tên</small><strong>{candidateName}</strong></span></div>
            <div className="tsa-session-detail"><span className="tsa-session-detail-icon"><FileText aria-hidden="true" /></span><span><small>Tên đề thi</small><strong>{exam.title}</strong></span></div>
            <div className="tsa-session-detail"><span className="tsa-session-detail-icon"><Fingerprint aria-hidden="true" /></span><span><small>Mã định danh</small><strong>{candidateId || "Chưa xác định"}</strong></span></div>
          </div>
        </header>
        <div className="tsa-session-exams">
          <div className="tsa-session-heading"><h1 id="tsa-session-title">Danh sách bài thi</h1><span>{sections.length} PHẦN THI</span></div>
          <div className="tsa-session-list">
            {sections.slice(firstVisibleIndex, 3).map((section, index) => <article className="tsa-session-part" key={section.id}>
              <div><h2>{firstVisibleIndex + index + 1}. {section.title}</h2><div className="tsa-session-meta"><p><strong>Đề:</strong> {exam.title}</p><p><strong>Thời gian:</strong> {section.duration_minutes ? `${section.duration_minutes} phút` : "Theo đề thi"}</p><p><strong>Trạng thái:</strong> <b>{index === 0 ? "Sẵn sàng" : "Tiếp sau phần trước"}</b></p></div></div>
              <button type="button" disabled={index !== 0} onClick={index === 0 ? () => onContinue(section) : undefined}>{index === 0 ? "Tiếp tục" : "Chưa mở"}</button>
            </article>)}
          </div>
          <button type="button" className="tsa-session-back" onClick={onExit}>Về phòng khảo thí</button>
        </div>
      </section>
    </div>
  </main>;
}

function ExamConfirmation({ room, exam, sections, section, candidateName, mode, starting, error, onStart, onExit }: { room: Room; exam: Exam; sections: Section[]; section?: Section; candidateName: string; mode: "practice" | "exam"; starting: boolean; error: string; onStart: () => void; onExit: () => void }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const showGuide = normalizeExamType(room.exam_type) === "TSA";
  const currentSection = section ?? sections[0];
  const sessionTitle = currentSection?.title?.trim() || exam.title;
  const sessionDuration = currentSection?.duration_minutes ?? exam.duration_minutes;
  return <main className="exam-confirmation-page">
    <section className="exam-confirmation-card" aria-labelledby="exam-confirmation-title">
       <div className="exam-confirmation-logo-wrap"><div className="exam-confirmation-logo"><span className="tsa-math-remix-logo" aria-label="MATH REMIX">MATH <b>REMIX</b></span></div></div>
      <h2 id="exam-confirmation-title" className="exam-confirmation-title">Xác nhận thông tin dự thi</h2>
      <div className="exam-confirmation-info">
        <p><span>Họ tên</span><strong>{candidateName}</strong></p>
        <p><span>Kíp thi</span><strong>{sessionTitle}</strong></p>
        <p><span>Thời gian làm bài</span><strong>{sessionDuration} phút</strong></p>
      </div>
      <p className="exam-confirmation-note">Lưu ý: Bằng việc nhấn nút “Bắt đầu thi” hệ thống sẽ bắt đầu tính giờ cho bài thi của bạn</p>
      {mode === "exam" && <p className="exam-fullscreen-reminder">Chế độ thi yêu cầu toàn màn hình và sẽ nhắc nếu bạn rời khỏi màn hình.</p>}
      {error && <p className="exam-confirmation-error" role="alert">{error}</p>}
      <button className="exam-confirmation-start" type="button" onClick={onStart} disabled={starting}>{starting ? "Đang bắt đầu…" : "Bắt đầu thi"}</button>
      <div className="exam-confirmation-links"><button type="button" onClick={onExit}>Quay lại</button>{showGuide ? <button type="button" onClick={() => setGuideOpen(true)}>Hướng dẫn</button> : <span>Hướng dẫn sẽ cập nhật</span>}</div>
    </section>
    {guideOpen && <ExamGuideModal onClose={() => setGuideOpen(false)}/>}
  </main>;
}

const TSA_GUIDE_IMAGES = Array.from({ length: 11 }, (_, index) => `https://s3.khaothi.online/files/tsa/huong-dan/${String(index + 1).padStart(2, "0")}.jpg`);

function ExamGuideModal({ onClose }: { onClose: () => void }) {
  const [slide, setSlide] = useState(0);
  const previous = () => setSlide(value => (value + TSA_GUIDE_IMAGES.length - 1) % TSA_GUIDE_IMAGES.length);
  const next = () => setSlide(value => (value + 1) % TSA_GUIDE_IMAGES.length);
  return <div className="fixed inset-0 z-[150] bg-black/45 flex items-center justify-center p-4" role="presentation">
    <section className="bg-white rounded-lg shadow-2xl w-[1000px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] flex flex-col overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="exam-guide-title">
      <header className="px-6 py-4 border-b border-gray-200"><h2 id="exam-guide-title" className="text-base font-medium text-[#000000d9]">Hướng dẫn</h2></header>
      <div className="relative flex-1 min-h-0 overflow-auto bg-white px-6 pt-4 pb-10">
        <img className="block w-full h-auto mx-auto" src={TSA_GUIDE_IMAGES[slide]} alt={`Hướng dẫn làm bài ${slide + 1}/${TSA_GUIDE_IMAGES.length}`}/>
        <button type="button" className="absolute left-7 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/35 hover:bg-black/55 text-white flex items-center justify-center" onClick={previous} aria-label="Trang hướng dẫn trước"><ChevronLeft/></button>
        <button type="button" className="absolute right-7 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/35 hover:bg-black/55 text-white flex items-center justify-center" onClick={next} aria-label="Trang hướng dẫn tiếp"><ChevronRight/></button>
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2" aria-label={`Trang ${slide + 1} trên ${TSA_GUIDE_IMAGES.length}`}>
          {TSA_GUIDE_IMAGES.map((_, index) => <button type="button" key={index} className={`h-2 rounded-full transition-all ${index === slide ? "w-5 bg-[#CE1628]" : "w-2 bg-gray-300"}`} onClick={() => setSlide(index)} aria-label={`Mở trang hướng dẫn ${index + 1}`}/>) }
        </div>
      </div>
      <footer className="border-t border-gray-200 px-4 py-[10px] text-right"><button type="button" className="h-8 px-[15px] rounded-lg bg-[#CE1628] hover:bg-[#b91426] text-white text-sm" onClick={onClose}>Xác nhận hoàn thành</button></footer>
    </section>
  </div>;
}

function AnswerOption({ option, index, selected, multiple, onClick }: { option: OptionValue; index: number; selected: boolean; multiple: boolean; onClick: () => void }) {
  const item = optionParts(option, index);
  const activate = (event: React.KeyboardEvent<HTMLDivElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } };
  return <div className="flex flex-wrap items-center space-x-5" role="button" tabIndex={0} aria-pressed={selected} onClick={onClick} onKeyDown={activate}><div className="flex-shrink-0 mt-0.5"><div className={`w-8 h-8 ${multiple ? "rounded-md" : "rounded-full"} border-2 cursor-pointer flex items-center justify-center transition-all ${selected ? "bg-[#1980FF] border-[#1980FF] text-white" : "bg-[#E8E8E8] border-transparent"}`}>{selected && <Check className="w-4 h-4"/>}</div></div><div className="flex-1 text-base text-gray-800 leading-relaxed cursor-pointer"><MathContent>{item.label}</MathContent></div></div>;
}

function InlineBlankPrompt({ prompt, value, onChange }: { prompt: string; value?: AnswerValue; onChange: (value: AnswerValue) => void }) {
  const values = Array.isArray(value) ? value : [];
  let blankIndex = 0;
  return <div className="text-base text-gray-800 leading-relaxed items-baseline">{prompt.split(/(___+)/g).filter(Boolean).map((part, index) => {
    if (!/^___+$/.test(part)) return <RichContent key={index}>{part}</RichContent>;
    const currentBlank = blankIndex++;
    return <label className="inline" key={index}><span className="exam-sr-only">Ô trống {currentBlank + 1}</span><input className="inline mx-1 px-1 py-0 border-b-2 border-blue-400 focus:border-blue-600 focus:outline-none text-center font-medium" type="text" value={values[currentBlank] ?? ""} aria-label={`Ô trống ${currentBlank + 1}`} style={{ width: `${Math.min(240, Math.max(88, ((values[currentBlank]?.length ?? 4) + 2) * 14))}px` }} onChange={event => { const next = [...values]; next[currentBlank] = event.target.value; onChange(next); }} /></label>;
  })}</div>;
}

function AnswerList({ question, value, onChoose, onChange }: { question: Question; value?: AnswerValue; onChoose: (value: string) => void; onChange: (value: AnswerValue) => void }) {
  const options = question.options ?? [];
  if (question.question_type === "text") return <label className="text-base text-gray-800 leading-relaxed items-baseline"><span className="exam-sr-only">Nhập câu trả lời</span><input className="inline mx-1 mt-3 min-w-[220px] px-1 py-0 border-b-2 border-blue-400 focus:border-blue-600 focus:outline-none text-center font-medium" type="text" value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} placeholder="Nhập đáp án" /></label>;
  if (question.question_type === "inline") return null;
  if (question.question_type === "true_false") {
    const values = Array.isArray(value) ? value : [];
    return <div><div className="mt-1"><div className="flex items-center mb-1 sm:mb-1"><div className="flex-1"/><div className="w-14 sm:w-20 text-center"><span className="text-xs sm:text-[16px] font-medium text-gray-700">Đúng</span></div><div className="w-14 sm:w-20 text-center"><span className="text-xs sm:text-[16px] font-medium text-gray-700">Sai</span></div></div><div>{options.map((option, index) => { const item = optionParts(option, index); return <div className="flex items-stretch border-t border-l border-r border-gray-200 last:border-b" key={`${item.value}-${index}`}><div className="flex-1 py-1 sm:py-1 pl-0 sm:pl-1 pr-1 sm:pr-2 border-r border-gray-200 h-full text-xs sm:text-[16px] text-gray-800"><MathContent>{item.label}</MathContent></div>{["true", "false"].map((choice, choiceIndex) => <div key={choice} className={`w-14 sm:w-20 flex justify-center items-center py-2 ${choiceIndex === 0 ? "border-r border-l border-gray-200" : ""}`}><button type="button" aria-label={`${item.label}: ${choice === "true" ? "Đúng" : "Sai"}`} aria-pressed={values[index] === choice} className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all ${values[index] === choice ? "bg-[#1980FF]" : "bg-[#E8E8E8]"}`} onClick={() => { const next = [...values]; next[index] = choice; onChange(next); }}>{values[index] === choice && <Check className="w-4 h-4 text-white"/>}</button></div>)}</div>; })}</div></div></div>;
  }
  if (question.question_type === "ordering") {
    const values = Array.isArray(value) ? value : [];
    const remaining = options.map((option, index) => optionParts(option, index)).filter(item => !values.includes(item.value));
    return <div className="exam-ordering"><p>Bấm chọn đáp án theo đúng thứ tự</p><div>{values.map((item, index) => <button type="button" key={`${item}-${index}`} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}><b>{index + 1}</b><GripVertical/><MathContent>{options.map(optionParts).find(option => option.value === item)?.label ?? item}</MathContent></button>)}</div><div className="exam-order-bank">{remaining.map(item => <button type="button" key={item.value} onClick={() => onChange([...values, item.value])}><MathContent>{item.label}</MathContent></button>)}</div></div>;
  }
  if (question.question_type === "drag_drop") {
    const values = Array.isArray(value) ? value : [];
    const items = options.map(optionParts);
    const slotCount = Math.max(1, (question.prompt.match(/___+/g) ?? []).length);
    const placeInFirstSlot = (item: string) => { const next = values.filter(valueItem => valueItem !== item); const empty = Array.from({ length: slotCount }, (_, index) => index).find(index => !next[index]); if (empty !== undefined) next[empty] = item; onChange(next.slice(0, slotCount)); };
    let slotIndex = 0;
    return <div><div className="border-[1px] border-[#b3c7e4] rounded-md p-2 mb-2"><div className="flex flex-wrap gap-2">{items.filter(item => !values.includes(item.value)).map(item => <div role="button" tabIndex={0} draggable key={item.value} aria-label="Kéo để thả vào chỗ trống" className="px-3 py-1 text-center rounded text-[#23282c] text-sm font-medium cursor-move transition-all select-none bg-gray-100" onDragStart={event => event.dataTransfer.setData("text/plain", item.value)} onClick={() => placeInFirstSlot(item.value)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); placeInFirstSlot(item.value); } }}><MathContent>{item.label}</MathContent></div>)}</div></div><div className="text-md font-bold text-black my-2 italic">{question.instruction || "Kéo các ô vuông thả vào vị trí thích hợp trong các câu sau:"}</div><div className="text-base text-gray-800 leading-relaxed items-baseline">{question.prompt.split(/(___+)/g).filter(Boolean).map((part, partIndex) => { if (!/^___+$/.test(part)) return <RichContent key={partIndex}>{part}</RichContent>; const currentSlot = slotIndex++; const selected = items.find(item => item.value === values[currentSlot]); return <div className={`inline-flex items-center justify-center mx-3 min-w-[100px] h-7 border-[1px] border-dashed rounded relative transition-colors ${selected ? "border-[#1980FF] bg-blue-50" : "border-gray-300"}`} key={partIndex} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const dropped = event.dataTransfer.getData("text/plain"); const next = values.map(item => item === dropped ? "" : item); next[currentSlot] = dropped; onChange(next.slice(0, slotCount)); }}>{selected ? <button type="button" className="px-2 text-sm" onClick={() => { const next = [...values]; next[currentSlot] = ""; onChange(next); }}><MathContent>{selected.label}</MathContent></button> : <span className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs"/>}</div>; })}</div></div>;
  }
  return <div role="group" aria-label={question.question_type === "multiple" ? "Chọn một hoặc nhiều đáp án" : "Chọn một đáp án"}>{options.map((option, index) => { const item = optionParts(option, index); const selected = Array.isArray(value) ? value.includes(item.value) : value === item.value; return <AnswerOption key={`${item.value}-${index}`} option={option} index={index} selected={selected} multiple={question.question_type === "multiple"} onClick={() => onChoose(item.value)} />; })}</div>;
}

function QuestionContent({ question, number, sectionTitle, value, onChoose, onChange, bookmarked, onBookmark }: { question: Question; number: number; sectionTitle?: string; value?: AnswerValue; onChoose: (value: string) => void; onChange: (value: AnswerValue) => void; bookmarked: boolean; onBookmark: () => void }) {
  return <section className="bg-white rounded-lg shadow-sm lg:h-auto max-h-[calc(100vh-180px)] overflow-y-auto"><div className="p-3 lg:pt-[12px] lg:px-[20px]">{sectionTitle && <div className="exam-current-section"><span>PHẦN THI</span><b>{sectionTitle}</b></div>}{question.passage && <aside className="mb-6 p-4 bg-[#FAFAFA] border border-gray-200 rounded-md text-base leading-relaxed"><RichContent>{question.passage}</RichContent></aside>}<div className="mb-8 question-renderer"><div className="flex items-start space-x-4 h-auto"><div className="w-full"><div className="flex mb-2 gap-5 items-start"><div className="flex-shrink-0 w-[36px] h-[36px] bg-[#F2F2F2] rounded-full flex items-center justify-center"><span className="text-lg font-bold text-[#262626]">{number}</span></div><div className="text-base font-normal text-[#262626] leading-relaxed w-full">{["multiple", "ordering"].includes(question.question_type) && question.instruction && <div className="text-md font-bold text-black my-2 italic">{question.instruction}</div>}{question.question_type !== "drag_drop" && <div className="whitespace-pre-wrap">{question.question_type === "inline" ? <InlineBlankPrompt prompt={question.prompt} value={value} onChange={onChange}/> : <RichContent>{question.prompt}</RichContent>}{question.question_type === "true_false" && <span className="block h-6"/>}{question.media_url && <div className="mt-4"><img className="max-w-full h-auto mx-auto" src={question.media_url} alt="Hình minh họa câu hỏi"/></div>}</div>}<AnswerList question={question} value={value} onChoose={onChoose} onChange={onChange}/></div><div className={`item-bookmark ${bookmarked ? "item-bookmarked" : ""}`}><button type="button" aria-label="Đánh dấu" onClick={onBookmark}><Flag/></button></div></div></div></div></div></div></section>;
}

function QuestionNavigator({ current, total, questionSeconds, onPrevious, onNext, onSubmit }: { current: number; total: number; questionSeconds: number; onPrevious: () => void; onNext: () => void; onSubmit: () => void }) {
  const buttonClass = "px-2 py-2 lg:px-4 lg:py-3 h-[46px] text-white rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-1 lg:space-x-2 text-sm lg:text-md transition-all duration-500 ease-in-out";
  return <footer className="flex-shrink-0 md:static fixed bottom-0 left-0 right-0"><div className="bg-white p-2 lg:p-4 px-2 lg:px-[60px] h-[80px]"><div className="flex justify-between items-center"><div className="flex items-center space-x-1 lg:space-x-3"><button className={`${buttonClass} bg-[#132768] hover:bg-[#192752]`} disabled={current === 0} onClick={onPrevious} aria-label="Câu trước"><ChevronLeft/></button>{current < total - 1 ? <button className={`${buttonClass} bg-[#132768] hover:bg-[#192752]`} onClick={onNext}><span className="hidden sm:inline">Câu tiếp</span><ChevronRight/></button> : <button className={`${buttonClass} bg-[#CE1628] hover:bg-[#ce5964]`} onClick={onSubmit}><Send/><span>Nộp bài</span></button>}<div className="hidden lg:flex text-md text-gray-600 items-center"><span className="text-[14px]">Thời gian làm câu hiện tại</span><span className="ml-10 clock">{formatDuration(questionSeconds)}</span></div></div><span className="text-[14px] text-gray-600 lg:hidden">Câu {current + 1}/{total}</span></div></div></footer>;
}

function ConfirmSubmitModal({ answered, total, submitting, onCancel, onConfirm }: { answered: number; total: number; submitting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="exam-modal-shade exam-submit-shade"><section className="exam-submit-dialog" role="dialog" aria-modal="true"><div className="exam-submit-icon"><Flag/></div><div className="exam-submit-count">{answered}/{total}<small>câu</small></div><h2>Nộp bài thi?</h2><p>Đã trả lời <b>{answered}/{total}</b> câu. Bạn vẫn còn thời gian làm bài, bạn có chắc chắn muốn kết thúc bài thi?</p><div><button onClick={onCancel} disabled={submitting}>Làm bài tiếp</button><button className="primary" onClick={onConfirm} disabled={submitting}>{submitting ? "Đang nộp…" : "Nộp bài thi"}</button></div></section></div>;
}

function QuestionPalette({ questions, sections, answers, bookmarked, current, open, candidateName, secondsLeft, onClose, onSelect, onSubmit }: { questions: Question[]; sections: Section[]; answers: Record<string, AnswerValue>; bookmarked: Set<string>; current: number; open: boolean; candidateName: string; secondsLeft: number; onClose: () => void; onSelect: (index: number) => void; onSubmit: () => void }) {
  const answered = questions.filter(question => answerComplete(question, answers[question.id])).length;
  const percent = questions.length ? Math.round(answered / questions.length * 100) : 0;
  return <><button className={`${open ? "block" : "hidden"} lg:hidden fixed inset-0 z-40 bg-black/50`} onClick={onClose} aria-label="Đóng danh sách câu hỏi"/><div className={`${open ? "block fixed inset-y-0 right-0 z-50" : "hidden"} lg:block lg:static lg:z-auto flex-shrink-0`}><aside className="bg-white flex flex-col h-screen"><div className="p-4 lg:py-6 lg:px-[15px] relative md:w-[480px]"><div className="flex items-center justify-between"><h3 className="text-base lg:text-[16px] text-[#000000d9] mb-4 lg:mb-3">Thông tin thí sinh</h3><button className="lg:hidden p-2" onClick={onClose} aria-label="Đóng"><X/></button></div><div className="space-y-2 lg:space-y-3 mb-4 lg:mb-6"><div className="flex justify-between items-center"><span className="text-xs lg:text-sm text-[#595959]">Họ tên</span><span className="text-xs lg:text-sm text-[#595959] font-medium">{candidateName}</span></div></div><div className="mb-3 lg:mb-4"><div className="flex justify-between items-center gap-2"><div className="flex justify-between items-center flex-1 border-[1px] border-[#f5f5f5] rounded-md h-[46px]"><div className="text-xs lg:text-sm text-[#262626] mx-2">Thời gian còn lại</div><div className="clock">{formatDuration(secondsLeft)}</div></div><button className="bg-[#CE1628] hover:bg-[#ce5964] text-white h-[44px] px-3 py-2 lg:px-4 lg:py-3 rounded-md font-medium text-xs lg:text-sm transition-colors whitespace-nowrap" onClick={onSubmit}>Nộp bài</button></div></div></div><div className="px-4 lg:px-6 pb-3 lg:pb-4"><div className="flex flex-wrap items-center gap-2 lg:gap-3 text-xs lg:text-sm text-gray-600"><span className="font-medium text-[#23282C]">Chỉ thị màu sắc:</span><span className="item-status">{questions.length}</span><span className="item-status answered">{answered}</span><span className="item-status bookmarked">{bookmarked.size}</span></div></div><div className="flex-1 px-4 lg:px-6 py-2 overflow-y-auto">{sections.map(section => <section className="mb-4" key={section.id}>{sections.length > 1 && <h3 className="text-sm font-medium text-[#23282C] mb-2">{section.title}</h3>}<div className="grid grid-cols-8 lg:grid-cols-10 gap-1.5 lg:gap-2">{questions.map((question, index) => question.section_id === section.id && <button key={question.id} className={`item-status ${index === current ? "current" : ""} ${answerComplete(question, answers[question.id]) ? "answered" : ""} ${bookmarked.has(question.id) ? "bookmarked" : ""}`} onClick={() => onSelect(index)}>{index + 1}</button>)}</div></section>)}</div><div className="px-4 lg:px-6"><div className="flex justify-between items-center mb-1 pt-1 border-t border-gray-200"><span className="text-xs lg:text-sm text-gray-700">Bạn đã hoàn thành</span><div className="flex justify-end items-end"><span className="clock">{answered}/{questions.length}</span><span>câu</span></div></div><div className="flex items-center gap-2 lg:gap-3 border-b border-gray-200 pb-2"><div className="flex-1"><div className="w-full bg-gray-200 rounded-full h-1.5 lg:h-2"><div className="bg-[#CE1628] h-1.5 lg:h-2 rounded-full transition-all duration-300" style={{ width: `${percent}%` }}/></div></div><div className="text-[1em] text-[#262626]">{percent}%</div></div><div className="NetworkIndicator_network-container__KmIAi" data-status="up"><span className="NetworkIndicator_server-status__-dts0"/><span>Đã kết nối máy chủ</span></div></div></aside></div></>;
}

function ExamResult({ attemptId, navigate }: { attemptId: string; navigate: (path: string) => void }) {
  const [data, setData] = useState<{ room: Room; exam: Exam; sections: Section[]; questions: Question[]; attempt: ResultAttempt; keys: AnswerKey[]; resultVisibility?: { scoreVisible?: boolean; answersVisible?: boolean; solutionsVisible?: boolean } } | null>(null);
  const [candidate, setCandidate] = useState({ candidateName: "Thí sinh", candidateId: "", candidateEmail: "" });
  const [reviewSectionId, setReviewSectionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError(""); setData(null);
    try {
      const keyPair = await createExamClientKeyPair();
      const clientPublicKey = await exportExamPublicKey(keyPair);
      const nonce = createExamRequestNonce();
      const envelope = await examApi<EncryptedExamEnvelope>("/api/exams/result-content", {
        method: "POST",
        body: JSON.stringify({ attemptId, clientPublicKey, nonce }),
      });
      const loaded = await decryptExamPayload<{ room: Room; exam: Exam; sections: Section[]; questions: Question[]; attempt: ResultAttempt; keys: AnswerKey[]; resultVisibility?: { scoreVisible?: boolean; answersVisible?: boolean; solutionsVisible?: boolean } }>(envelope, keyPair.privateKey, {
        kind: "result",
        attemptId,
        sectionId: null,
        index: null,
        nonce,
      });
      setData(loaded);
      setCandidate(await loadCandidateIdentity({ fallbackName: "Thí sinh", profileId: loaded.attempt.student_id }));
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể tải kết quả."); }
  }, [attemptId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  if (!data) return <PageState loading={!error} error={error} onRetry={load} />;
  if (isIndependentSubjectExamType(data.room.exam_type) || isIndependentSubjectExamType(data.exam.exam_type)) {
    const subjectSection = data.sections.find(section => section.id === data.attempt.section_id) ?? data.sections[0];
    return <ThptqgResult
      room={data.room}
      exam={data.exam}
      section={subjectSection}
      attempt={data.attempt}
      questions={data.questions}
      keys={data.keys}
      candidateName={candidate.candidateName}
      candidateId={candidate.candidateId}
      candidateEmail={candidate.candidateEmail}
      resultVisibility={data.resultVisibility}
      onBack={() => navigate(`/exam-room/${encodeURIComponent(data.room.id)}`)}
      onRetake={() => subjectSection && navigate(examSectionPath(data.exam.id, subjectSection.id, "practice", "confirm"))}
    />;
  }
  const answerMap = data.attempt.answers ?? {};
  const resultVisibility = data.resultVisibility ?? { scoreVisible: true, answersVisible: true };
  const scoreVisible = resultVisibility.scoreVisible !== false;
  const answersVisible = resultVisibility.answersVisible !== false;
  const displayScore = scoreVisible && data.attempt.score !== null ? data.attempt.score : "—";
  const displayCorrect = scoreVisible && data.attempt.correct_answers !== null ? data.attempt.correct_answers : "Chưa công bố";
  const sectionsForReview = answersVisible ? data.sections : [];
  const keyMap = new Map(data.keys.map(key => [key.question_id, key]));
  const reviewSection = reviewSectionId ? sectionsForReview.find(section => section.id === reviewSectionId) ?? null : null;
  const reviewQuestions = reviewSection ? data.questions.filter(question => question.section_id === reviewSection.id) : [];
  const reviewItems = reviewQuestions.map(question => resultPreviewItem(question, keyMap.get(question.id)));
  const reviewAnswers = reviewQuestions.map(question => answerMap[question.id]);
  const reviewKeys = reviewItems.map(item => item.parsed.correctAnswer);
  const isHsaResult = normalizeExamType(data.room.exam_type) === "HSA" || normalizeExamType(data.exam.exam_type) === "HSA";
  const hsaReviewStatuses = reviewQuestions.map(question => {
    const submittedAnswer = answerMap[question.id];
    if (!hasAnswerValue(submittedAnswer)) return "unanswered" as const;
    const key = keyMap.get(question.id);
    const ordered = ["inline", "true_false", "ordering", "drag_drop"].includes(question.question_type);
    return key && answersMatch(submittedAnswer, key.correct_answer, ordered) ? "correct" as const : "incorrect" as const;
  });
  const hsaResultSelection = isHsaResult ? getHsaCombination(answerMap[HSA_SELECTION_ANSWER_KEY])?.code : undefined;
  return <div className={`exam-page exam-result-page${isHsaResult ? " hsa-result-page" : ""}`}><div className="exam-result-actions"><button className="exam-back" onClick={() => navigate(`/exam-room/${encodeURIComponent(data.room.id)}`)}><ArrowLeft/>Quay lại danh sách</button><button onClick={() => navigate(examListPath(data.exam.id, "practice", hsaResultSelection))}><RotateCcw/>Làm lại</button></div>
    <section className="exam-result-hero"><div><span>KẾT QUẢ BÀI THI</span><h1>{data.exam.title}</h1><p>{formatDate(data.attempt.submitted_at, true)} · {formatDuration(data.attempt.duration_seconds ?? 0)}</p></div>{scoreVisible ? <div className="exam-score-ring" style={{ "--score": `${Math.min(100, Math.max(0, Number(displayScore)))}%` } as React.CSSProperties}><span><b>{displayScore}</b><small>điểm</small></span></div> : <div className="exam-score-ring is-locked"><span><b>—</b><small>chưa công bố</small></span></div>}</section>
    <section className="exam-result-summary">{scoreVisible ? <><div><Check/><span><small>Số câu đúng</small><b>{displayCorrect}/{data.attempt.total_questions}</b></span></div><div><BarChart3/><span><small>Tỷ lệ hoàn thành</small><b>{data.attempt.total_questions && typeof data.attempt.correct_answers === "number" ? Math.round(data.attempt.correct_answers / data.attempt.total_questions * 100) : 0}%</b></span></div></> : <div><CircleAlert/><span><small>Trạng thái kết quả</small><b>Chưa công bố</b></span></div>}<div><Clock3/><span><small>Thời gian làm</small><b>{formatDuration(data.attempt.duration_seconds ?? 0)}</b></span></div></section>
    <section className="exam-section-results"><header><div><span>PHÂN TÍCH CHI TIẾT</span><h2>Kết quả theo phần</h2></div><p>{answersVisible ? "Chọn một phần để xem lại từng câu." : "Đáp án và lời giải sẽ được mở theo cấu hình của kỳ thi."}</p></header>{answersVisible ? sectionsForReview.map(section => { const questions = data.questions.filter(question => question.section_id === section.id); const correct = questions.filter(question => { const key = keyMap.get(question.id); return key && answersMatch(answerMap[question.id], key.correct_answer, ["inline", "true_false", "ordering", "drag_drop"].includes(question.question_type)); }).length; return <article key={section.id}><div><b>{section.title}</b><small>{correct}/{questions.length} câu đúng</small></div><div className="exam-result-bar"><span style={{ width: `${questions.length ? correct / questions.length * 100 : 0}%` }}/></div><button type="button" disabled={!questions.length} onClick={() => setReviewSectionId(section.id)}>Chi tiết<ChevronRight/></button></article>; }) : <p className="exam-result-release-note">Kết quả chi tiết chưa được phát hành.</p>}</section>
    {reviewSection && <div className="exam-result-review-overlay" role="dialog" aria-modal="true" aria-label={`Xem đáp án ${reviewSection.title}`}>
      <div className="exam-result-review-host">{isHsaResult ? <LearnerExamPreview
          previewItems={reviewItems}
          answers={reviewKeys}
          candidateAnswers={reviewAnswers}
          correctAnswers={reviewKeys}
          mode="answer"
          title={data.exam.title}
          examType="HSA"
          sectionTitle={reviewSection.title}
          durationMinutes={reviewSection.duration_minutes ?? data.exam.duration_minutes}
          candidateName={candidate.candidateName}
          candidateId={candidate.candidateId}
          candidateEmail={candidate.candidateEmail}
          submittedAt={data.attempt.submitted_at}
          reviewStatuses={hsaReviewStatuses}
          resultMode
          headerExtras={<button type="button" className={`${isHsaResult ? "hsa-review-panel-toggle hsa-result-review-exit" : "exam-result-review-exit"}`} onClick={() => setReviewSectionId(null)}><ArrowLeft/>Quay lại kết quả</button>}
          standalone
          showToolbar={false}
        /> : <RemixStudyEduReviewPreview
          previewItems={reviewItems}
          title={data.exam.title}
          sectionTitle={reviewSection.title}
          durationMinutes={reviewSection.duration_minutes ?? data.exam.duration_minutes}
          candidateName={candidate.candidateName}
          candidateId={candidate.candidateId}
          candidateEmail={candidate.candidateEmail}
          submittedAt={data.attempt.submitted_at}
          onExit={() => setReviewSectionId(null)}
          attemptAnswers={reviewAnswers}
          correctAnswers={reviewKeys}
          resultMode
        />}</div>
    </div>}
  </div>;
}
