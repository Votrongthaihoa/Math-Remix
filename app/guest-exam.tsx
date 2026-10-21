"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, CircleAlert, Clock3, Eye, KeyRound, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { normalizeExamType } from "../lib/exam-config";
import type { ExamPolicy } from "../lib/exam-policy";
import { identityDisplayId, identityDisplayName } from "../lib/guest-identity";
import { retryAfterMilliseconds, retryWithBackoff } from "../lib/request-retry";
import { apiRequestUrl } from "../lib/api-url";
import RemixStudyEduExamRenderer, { type SourceQuestion as RemixSourceQuestion } from "../components/remixstudyedu/ExamRendererAdapter";
import GuestThptqgResult, { type GuestResultQuestion, type GuestThptqgResultData } from "../components/thptqg/GuestThptqgResult";
import ThptqgConfirmation from "../components/thptqg/ThptqgConfirmation";
import ThptqgExamRenderer, { type ThptqgAnswerValue, type ThptqgProgress, type ThptqgQuestion } from "../components/thptqg/ThptqgExamRenderer";
import LoadingIndicator from "./loading-indicator";
import ExamFullscreenGuard, { enterExamFullscreen, leaveExamFullscreen } from "./exam-fullscreen-guard";
import "./guest-exam.css";
import "./exam-themes.css";

type Field = { key: string; label: string; type: "text" | "email"; required: boolean };
type Option = string | { value?: string; id?: string; label?: string; text?: string };
type Question = { id: string; section_id: string; prompt: string; question_type: string; options: Option[]; points: number; passage?: string | null; media_url?: string | null; instruction?: string | null; option_columns?: number | null; matching?: RemixSourceQuestion["matching"]; option_order?: string[]; part?: 1 | 2 | 3; solution?: string | null };
type Meta = { slot: { id: string; name: string; starts_at: string; ends_at: string; grace_period_minutes: number; has_password: boolean }; exam: { id: string; title: string; description: string; exam_type: string; duration_minutes: number }; room: { title: string; exam_type?: string }; section?: { id: string; title: string; duration_minutes?: number | null; subject_code?: string | null } | null; settings: { identityFields: Field[]; maxAttempts: number; autoMonitor: string; hideGroupHeaders: boolean; resetQuestionIndex: boolean }; policy?: ExamPolicy; phase: string; serverTime?: string };
type AnswerValue = string | string[];
type Attempt = { id: string; answers?: Record<string, AnswerValue>; identity?: Record<string, string>; started_at: string; deadline_at?: string; progress_version?: number; flagged_questions?: string[]; network_state?: string; exam_code?: string | null; policy?: ExamPolicy; status: string };
type Result = GuestThptqgResultData & { identity?: Record<string, string>; questions?: GuestResultQuestion[] };

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function entryTime(value: string | number) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "—";
}

function entryClock(value: string | number) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
}

function entryDate(value: string | number) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

function initialServerTime(serverTime?: string) {
  const value = new Date(serverTime ?? "").getTime();
  return Number.isFinite(value) ? value : Date.now();
}

function GuestLinkTimePanel({ serverTime, endsAt }: { serverTime?: string; endsAt: string }) {
  const [now, setNow] = useState(() => initialServerTime(serverTime));
  const serverStartedAt = useRef(now);

  useEffect(() => {
    const clientStartedAt = Date.now();
    const timer = window.setInterval(() => setNow(serverStartedAt.current + Date.now() - clientStartedAt), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return <section className="guest-link-time-panel" aria-label="Thời gian hiệu lực của link thi">
    <div><Clock3 aria-hidden="true"/><span><small>Thời gian hiện tại</small><time dateTime={new Date(now).toISOString()}><b>{entryClock(now)}</b><em>{entryDate(now)}</em></time></span></div>
    <div><CalendarDays aria-hidden="true"/><span><small>Link hết hạn</small><time dateTime={endsAt}><b>{entryTime(endsAt)}</b><em>{entryDate(endsAt)}</em></time></span></div>
  </section>;
}

function display(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value);
}

function guestMediaUrl(value: string | null | undefined) {
  const mediaUrl = value?.trim();
  if (!mediaUrl) return value ?? null;
  let requestPath = mediaUrl;
  try {
    const absolute = new URL(mediaUrl);
    if (["mathremix.pro.vn", "www.mathremix.pro.vn"].includes(absolute.hostname.toLowerCase()) && absolute.pathname.startsWith("/api/guest-exams/images/")) {
      requestPath = `${absolute.pathname}${absolute.search}${absolute.hash}`;
    }
  } catch {
    // Relative application paths are expected here.
  }
  const resolved = apiRequestUrl(requestPath);
  return typeof resolved === "string" ? resolved : resolved instanceof URL ? resolved.toString() : mediaUrl;
}

function guestTextWithMediaOrigin(value: string | null | undefined) {
  if (!value) return value ?? null;
  return value.replace(/(?:https?:\/\/(?:www\.)?mathremix\.pro\.vn)?\/api\/guest-exams\/images\/[^\s"'<>})\]]+/gi, mediaPath => guestMediaUrl(mediaPath) ?? mediaPath);
}

function guestOptionWithMedia(option: Option): Option {
  if (typeof option === "string") return guestTextWithMediaOrigin(option) ?? "";
  return {
    ...option,
    label: option.label == null ? option.label : guestTextWithMediaOrigin(option.label) ?? "",
    text: option.text == null ? option.text : guestTextWithMediaOrigin(option.text) ?? "",
  };
}

type GuestMediaQuestion = Pick<Question, "prompt" | "options"> & Partial<Pick<Question, "passage" | "media_url" | "instruction" | "solution" | "matching">>;

function questionWithGuestMedia<T extends GuestMediaQuestion>(question: T): T {
  return {
    ...question,
    prompt: guestTextWithMediaOrigin(question.prompt) ?? "",
    options: question.options.map(guestOptionWithMedia),
    passage: guestTextWithMediaOrigin(question.passage),
    media_url: guestMediaUrl(question.media_url),
    instruction: guestTextWithMediaOrigin(question.instruction),
    solution: guestTextWithMediaOrigin(question.solution),
    matching: question.matching ? {
      leftItems: question.matching.leftItems.map(item => ({ ...item, label: guestTextWithMediaOrigin(item.label) ?? "" })),
      rightItems: question.matching.rightItems.map(item => ({ ...item, label: guestTextWithMediaOrigin(item.label) ?? "" })),
    } : undefined,
  } as T;
}

function questionsWithGuestMedia(questions: Question[]) {
  return questions.map(questionWithGuestMedia);
}

function resultWithGuestMedia(result: Result) {
  return {
    ...result,
    questions: result.questions?.map(row => row.question
      ? {
          ...row,
          explanation: guestTextWithMediaOrigin(row.explanation) ?? "",
          question: questionWithGuestMedia(row.question),
        }
      : row),
  };
}

function guestStorageKey(token: string) { return `guest-exam-attempt:${token}`; }
function guestIdentityStorageKey(token: string) { return `guest-exam-identity:${token}`; }
function guestResultStorageKey(token: string) { return `guest-exam-result:${token}`; }

function readStoredIdentity(token: string, fields: Field[]) {
  const fallback = Object.fromEntries(fields.map(field => [field.key, ""]));
  try {
    const value = JSON.parse(window.localStorage.getItem(guestIdentityStorageKey(token)) ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
    return Object.fromEntries(fields.map(field => [field.key, typeof value[field.key] === "string" ? value[field.key] : ""]));
  } catch {
    return fallback;
  }
}

function usesThptqgRenderer(meta: Pick<Meta, "exam" | "room">) {
  const examType = normalizeExamType(meta.exam.exam_type || meta.room.exam_type);
  // The authenticated room currently uses the THPTQG subject runner for both
  // independent-subject formats. Keep the guest route on that same contract.
  return examType === "THPTQG" || examType === "VSAT";
}

function attemptSecondsLeft(attempt: Attempt) {
  const deadline = new Date(attempt.deadline_at ?? "").getTime();
  return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0;
}

async function api<T>(body: Record<string, unknown>, signal?: AbortSignal) {
  const request = async () => {
    const response = await fetch(apiRequestUrl("/api/guest-exams"), { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", credentials: "include", body: JSON.stringify(body), signal });
    const payload = await response.json().catch(() => null) as T & { error?: string } | null;
    if (!response.ok) {
      const error = Object.assign(new Error(payload?.error || "Không thể kết nối kíp thi."), {
        status: response.status,
        retryAfterMs: retryAfterMilliseconds(response.headers.get("retry-after")),
      });
      throw error;
    }
    return payload as T;
  };
  // Progress writes are versioned and coalesced by the server, so retrying a
  // transient timeout/5xx cannot overwrite a newer answer snapshot.
  return body.action === "progress" ? retryWithBackoff(request, { maxRetries: 3 }) : request();
}

export default function GuestExamModule({ token }: { token: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<string[]>([]);
  const [identity, setIdentity] = useState<Record<string, string>>({});
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [phase, setPhase] = useState<"loading" | "identity" | "confirmation" | "exam" | "submitted" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [networkState, setNetworkState] = useState("online");
  const activeAttemptId = attempt?.id ?? "";
  const submitStarted = useRef(false);
  const progressVersion = useRef(0);
  const attemptRef = useRef<Attempt | null>(null);
  const answersRef = useRef<Record<string, AnswerValue>>({});
  const flaggedQuestionsRef = useRef<string[]>([]);
  const pendingMonitorEventsRef = useRef<string[]>([]);
  const monitorFlushTimerRef = useRef<number | null>(null);
  const progressWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const loadControllerRef = useRef<AbortController | null>(null);

  useEffect(() => { attemptRef.current = attempt; }, [attempt]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { flaggedQuestionsRef.current = flaggedQuestions; }, [flaggedQuestions]);

  const load = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    const isCurrent = () => loadControllerRef.current === controller && !controller.signal.aborted;

    setPhase("loading"); setError("");
    try {
      const response = await fetch(apiRequestUrl(`/api/guest-exams?token=${encodeURIComponent(token)}`), { cache: "no-store", credentials: "include", signal: controller.signal });
      const payload = await response.json() as Meta & { error?: string };
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(payload.error || "Link thi không tồn tại.");
      setMeta(payload);
      setIdentity(readStoredIdentity(token, payload.settings.identityFields));
      const savedAttemptId = window.localStorage.getItem(guestStorageKey(token));
      if (savedAttemptId) {
        try {
          const resumed = await api<{ attempt?: Attempt; questions?: Question[]; sections?: Array<{ id: string; title: string }>; result?: Result }>({ action: "resume", token, attemptId: savedAttemptId }, controller.signal);
          if (!isCurrent()) return;
          if (resumed.result) {
            if (resumed.result.identity && Object.keys(resumed.result.identity).length) setIdentity(resumed.result.identity);
            window.localStorage.setItem(guestResultStorageKey(token), resumed.result.attempt.id);
            setResult(resultWithGuestMedia(resumed.result)); setPhase("submitted"); return;
          }
          if (resumed.attempt && resumed.questions) {
            progressVersion.current = resumed.attempt.progress_version ?? 0;
            setFlaggedQuestions(resumed.attempt.flagged_questions ?? []);
            setNetworkState(resumed.attempt.network_state ?? "online");
            if (resumed.attempt.identity && Object.keys(resumed.attempt.identity).length) setIdentity(resumed.attempt.identity);
            setAttempt(resumed.attempt); setSecondsLeft(attemptSecondsLeft(resumed.attempt)); setAnswers(resumed.attempt.answers ?? {}); setQuestions(questionsWithGuestMedia(resumed.questions)); setPhase("exam"); return;
          }
        } catch {
          if (!isCurrent()) return;
          window.localStorage.removeItem(guestStorageKey(token));
        }
      }
      const savedResultId = window.localStorage.getItem(guestResultStorageKey(token));
      if (savedResultId) {
        try {
          const resumed = await api<{ result?: Result }>({ action: "resume", token, attemptId: savedResultId }, controller.signal);
          if (!isCurrent()) return;
          if (resumed.result) {
            if (resumed.result.identity && Object.keys(resumed.result.identity).length) setIdentity(resumed.result.identity);
            setResult(resultWithGuestMedia(resumed.result)); setPhase("submitted"); return;
          }
        } catch {
          if (!isCurrent()) return;
          window.localStorage.removeItem(guestResultStorageKey(token));
        }
      }
      if (!isCurrent()) return;
      setPhase(payload.phase === "upcoming" ? "identity" : payload.phase === "open" ? "identity" : "identity");
    } catch (value) {
      if (!isCurrent()) return;
      setError(value instanceof Error ? value.message : "Không thể mở link thi."); setPhase("error");
    } finally {
      if (loadControllerRef.current === controller) loadControllerRef.current = null;
    }
  }, [token]);

  // This effect intentionally starts the network load when the link changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    void load();
    return () => {
      loadControllerRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!meta) return;
    document.documentElement.dataset.examType = normalizeExamType(meta.exam.exam_type).toLowerCase();
    return () => { delete document.documentElement.dataset.examType; };
  }, [meta]);

  useEffect(() => {
    if (phase !== "identity" || !meta || meta.phase !== "upcoming") return;
    let active = true;
    const refreshPhase = async () => {
      try {
        const response = await fetch(apiRequestUrl(`/api/guest-exams?token=${encodeURIComponent(token)}`), { cache: "no-store", credentials: "include" });
        if (!response.ok || !active) return;
        const payload = await response.json() as Meta;
        if (active) setMeta(payload);
      } catch {
        // The start request remains authoritative if a phase poll is missed.
      }
    };
    const timer = window.setInterval(() => { void refreshPhase(); }, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [meta, phase, token]);

  const start = async () => {
    if (!meta) return;
    if (meta.phase !== "open") { setError(meta.phase === "upcoming" ? "Kíp thi chưa mở." : "Kíp thi đã kết thúc."); return; }
    setBusy(true); setError("");
    try {
      if (!await enterExamFullscreen()) {
        setError("Hãy cho phép trình duyệt mở toàn màn hình để bắt đầu bài thi.");
        return;
      }
      const payload = await api<{ attempt: Attempt; questions: Question[]; sections: Array<{ id: string; title: string }> }>({ action: "start", token, password, identity });
      progressVersion.current = payload.attempt.progress_version ?? 0;
      setFlaggedQuestions(payload.attempt.flagged_questions ?? []);
      setNetworkState(payload.attempt.network_state ?? "online");
      if (payload.attempt.identity && Object.keys(payload.attempt.identity).length) setIdentity(payload.attempt.identity);
      setAttempt(payload.attempt); setSecondsLeft(attemptSecondsLeft(payload.attempt)); setQuestions(questionsWithGuestMedia(payload.questions)); setAnswers(payload.attempt.answers ?? {}); setPhase("exam");
      window.localStorage.setItem(guestStorageKey(token), payload.attempt.id);
      window.localStorage.removeItem(guestResultStorageKey(token));
      window.localStorage.setItem(guestIdentityStorageKey(token), JSON.stringify(identity));
    } catch (value) { await leaveExamFullscreen(); setError(value instanceof Error ? value.message : "Không thể bắt đầu bài thi."); }
    finally { setBusy(false); }
  };

  const continueFromIdentity = (event: React.FormEvent) => {
    event.preventDefault();
    if (!meta) return;
    if (meta.phase !== "open") {
      setError(meta.phase === "upcoming" ? "Kíp thi chưa mở." : "Kíp thi đã kết thúc.");
      return;
    }
    setError("");
    window.localStorage.setItem(guestIdentityStorageKey(token), JSON.stringify(identity));
    if (usesThptqgRenderer(meta)) setPhase("confirmation");
    else void start();
  };

  const queueProgressWrite = useCallback((allowWhileSubmitting = false) => {
    const currentAttempt = attemptRef.current;
    if (!currentAttempt || (submitStarted.current && !allowWhileSubmitting)) return;
    const monitorEvents = pendingMonitorEventsRef.current.splice(0, 20);
    const snapshot = {
      attemptId: currentAttempt.id,
      answers: answersRef.current,
      flaggedQuestions: flaggedQuestionsRef.current,
      progressVersion: ++progressVersion.current,
      ...(monitorEvents.length ? { monitorEvents } : {}),
    };
    setNetworkState("saving");
    const write = async () => {
      try {
        const response = await api<{ deadlineAt?: string }>({ action: "progress", token, ...snapshot, networkState: "saving" });
        if (response?.deadlineAt) setAttempt(current => current ? { ...current, deadline_at: response.deadlineAt } : current);
        setNetworkState("saved");
      } catch {
        if (snapshot.monitorEvents?.length) {
          pendingMonitorEventsRef.current = [...snapshot.monitorEvents, ...pendingMonitorEventsRef.current].slice(-20);
        }
        setNetworkState(typeof navigator !== "undefined" && navigator.onLine ? "failed" : "offline");
      }
    };
    progressWriteQueueRef.current = progressWriteQueueRef.current.then(write, write);
  }, [token]);

  const submit = useCallback(async (nextAnswers?: Record<string, AnswerValue>) => {
    if (!attempt || submitStarted.current) return;
    submitStarted.current = true; setBusy(true); setError("");
    try {
      queueProgressWrite(true);
      await progressWriteQueueRef.current;
      const payload = await api<{ result: Result }>({ action: "submit", token, attemptId: attempt.id, answers: nextAnswers ?? answers, flaggedQuestions });
      setResult(resultWithGuestMedia(payload.result)); setPhase("submitted"); await leaveExamFullscreen(); window.localStorage.setItem(guestResultStorageKey(token), payload.result.attempt.id); window.localStorage.removeItem(guestStorageKey(token)); window.localStorage.removeItem(guestIdentityStorageKey(token));
    } catch (value) {
      submitStarted.current = false;
      const message = value instanceof Error ? value.message : "Không thể nộp bài.";
      if (/thời gian làm bài đã kết thúc|lượt thi đã kết thúc/i.test(message)) {
        window.localStorage.removeItem(guestStorageKey(token));
        setPhase("error");
      }
      setError(message);
      throw value instanceof Error ? value : new Error(message);
    }
    finally { setBusy(false); }
  }, [answers, attempt, flaggedQuestions, queueProgressWrite, token]);

  useEffect(() => {
    if (phase !== "exam" || !activeAttemptId) return;
    const save = window.setTimeout(queueProgressWrite, 800);
    return () => window.clearTimeout(save);
  }, [activeAttemptId, answers, flaggedQuestions, phase, queueProgressWrite]);

  useEffect(() => {
    if (phase !== "exam" || !activeAttemptId) return;
    const retryLatestProgress = () => {
      setNetworkState("retrying");
      queueProgressWrite();
    };
    window.addEventListener("online", retryLatestProgress);
    return () => window.removeEventListener("online", retryLatestProgress);
  }, [activeAttemptId, phase, queueProgressWrite]);

  useEffect(() => {
    if (phase !== "exam" || !activeAttemptId || !meta) return;
    const integrity = meta.policy?.integrity;
    if (!integrity || (!integrity.visibilityMonitoring && !integrity.focusMonitoring && !integrity.warnOnExit && !integrity.copyProtection && !integrity.pasteProtection && !integrity.contextMenuProtection)) return;
    const sendMonitorEvent = (monitorEvent: "visibility_hidden" | "visibility_visible" | "fullscreen_exit" | "fullscreen_enter" | "window_blur" | "window_focus" | "copy" | "paste" | "cut" | "context_menu") => {
      pendingMonitorEventsRef.current = [...pendingMonitorEventsRef.current, monitorEvent].slice(-20);
      if (monitorFlushTimerRef.current !== null) return;
      monitorFlushTimerRef.current = window.setTimeout(() => {
        monitorFlushTimerRef.current = null;
        queueProgressWrite();
      }, 80);
    };
    const onVisibility = () => sendMonitorEvent(document.hidden ? "visibility_hidden" : "visibility_visible");
    const onFullscreen = () => sendMonitorEvent(document.fullscreenElement ? "fullscreen_enter" : "fullscreen_exit");
    const observeFullscreen = integrity.warnOnExit;
    const observeVisibility = integrity.visibilityMonitoring;
    const observeFocus = integrity.focusMonitoring;
    const onBlur = () => sendMonitorEvent("window_blur");
    const onFocus = () => sendMonitorEvent("window_focus");
    const onCopy = () => sendMonitorEvent("copy");
    const onPaste = () => sendMonitorEvent("paste");
    const onCut = () => sendMonitorEvent("cut");
    const onContextMenu = () => sendMonitorEvent("context_menu");
    if (observeVisibility) document.addEventListener("visibilitychange", onVisibility);
    if (observeFullscreen) document.addEventListener("fullscreenchange", onFullscreen);
    if (observeFocus) {
      window.addEventListener("blur", onBlur);
      window.addEventListener("focus", onFocus);
    }
    if (integrity.copyProtection) document.addEventListener("copy", onCopy);
    if (integrity.pasteProtection) document.addEventListener("paste", onPaste);
    if (integrity.copyProtection) document.addEventListener("cut", onCut);
    if (integrity.contextMenuProtection) document.addEventListener("contextmenu", onContextMenu);
    return () => {
      if (monitorFlushTimerRef.current !== null) window.clearTimeout(monitorFlushTimerRef.current);
      monitorFlushTimerRef.current = null;
      if (observeVisibility) document.removeEventListener("visibilitychange", onVisibility);
      if (observeFullscreen) document.removeEventListener("fullscreenchange", onFullscreen);
      if (observeFocus) {
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("focus", onFocus);
      }
      if (integrity.copyProtection) document.removeEventListener("copy", onCopy);
      if (integrity.pasteProtection) document.removeEventListener("paste", onPaste);
      if (integrity.copyProtection) document.removeEventListener("cut", onCut);
      if (integrity.contextMenuProtection) document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [activeAttemptId, meta, phase, queueProgressWrite]);

  if (phase === "loading") return <div className="guest-exam-state"><LoadingIndicator label="Đang mở kíp thi…" /></div>;
  if (phase === "error") return <GuestState title="Không thể mở link thi" message={error} onRetry={() => void load()} />;
  if (!meta) return null;
  if (phase === "submitted" && result) {
    const closeResult = () => { window.localStorage.removeItem(guestResultStorageKey(token)); window.location.reload(); };
    const retake = () => { window.localStorage.removeItem(guestResultStorageKey(token)); setResult(null); setAttempt(null); setAnswers({}); setQuestions([]); setError(""); setPhase("identity"); };
    if (usesThptqgRenderer(meta)) return <GuestThptqgResult meta={meta} result={result as GuestThptqgResultData} candidateName={identityDisplayName(identity, meta.settings.identityFields)} candidateId={identityDisplayId(identity, meta.settings.identityFields)} onClose={closeResult} onRetake={retake} />;
    return <GuestResult meta={meta} result={result} onClose={closeResult} onRetake={retake} />;
  }
  if (phase === "identity") return <GuestIdentityForm meta={meta} identity={identity} password={password} error={error} busy={busy} onChange={(key, value) => setIdentity(previous => ({ ...previous, [key]: value }))} onPassword={setPassword} onSubmit={continueFromIdentity} />;
  if (phase === "confirmation" && usesThptqgRenderer(meta)) return <GuestThptqgConfirmation meta={meta} candidateName={identityDisplayName(identity, meta.settings.identityFields)} error={error} busy={busy} onStart={() => void start()} onExit={() => { setError(""); setPhase("identity"); }} />;
  return <GuestExamTake meta={meta} questions={questions} answers={answers} flaggedQuestions={flaggedQuestions} secondsLeft={secondsLeft} networkState={networkState} candidateName={identityDisplayName(identity, meta.settings.identityFields)} candidateId={identityDisplayId(identity, meta.settings.identityFields)} onProgress={progress => { setAnswers(progress.answers); setFlaggedQuestions(progress.marked); }} onSubmit={nextAnswers => submit(nextAnswers)} />;
}

function GuestState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return <main className="guest-exam-state"><CircleAlert/><h1>{title}</h1><p>{message}</p>{onRetry && <button onClick={onRetry}>Thử lại</button>}</main>;
}

function GuestIdentityForm({ meta, identity, password, error, busy, onChange, onPassword, onSubmit }: { meta: Meta; identity: Record<string, string>; password: string; error: string; busy: boolean; onChange: (key: string, value: string) => void; onPassword: (value: string) => void; onSubmit: (event: React.FormEvent) => void }) {
  const independent = usesThptqgRenderer(meta);
  const actionLabel = busy ? "Đang chuẩn bị…" : meta.phase === "upcoming" ? "Kíp chưa mở" : meta.phase === "open" ? independent ? "Tiếp tục" : "Bắt đầu làm bài" : "Kíp đã đóng";
  const phaseLabel = meta.phase === "upcoming" ? "Sắp mở" : meta.phase === "open" ? "Đang mở" : "Đã đóng";
  const examType = normalizeExamType(meta.exam.exam_type || meta.room.exam_type);
  const thptqg = examType === "THPTQG";
  const brandTitle = thptqg ? "KỲ THI TỐT NGHIỆP THPT" : examType === "TSA" ? "ĐÁNH GIÁ TƯ DUY TSA" : examType === "HSA" ? "ĐÁNH GIÁ NĂNG LỰC HSA" : examType === "VSAT" ? "KỲ THI V-SAT" : "LINK THI KÍP NGẮN HẠN";
  const brandType = thptqg ? "THPTQG" : examType;
  return <main className={`guest-exam-page guest-entry-page guest-entry-${examType.toLowerCase()}`}><div className="guest-entry-glow guest-entry-glow-one" aria-hidden="true"/><div className="guest-entry-glow guest-entry-glow-two" aria-hidden="true"/><div className="guest-entry-shell"><header className="guest-exam-hero"><div className="guest-hero-topline"><span className="guest-hero-kicker"><i aria-hidden="true"/>{brandTitle}</span><span className="guest-hero-type">{brandType}</span></div><div className="guest-hero-copy"><div><h1>{meta.exam.title}</h1>{meta.section?.title && <strong className="guest-exam-subject">Môn thi: {meta.section.title}</strong>}<p>{meta.exam.description || (thptqg ? "Bài thi theo cấu trúc kỳ thi tốt nghiệp THPT." : "Nhập thông tin để bắt đầu bài thi.")}</p></div><div className={`guest-hero-mark${thptqg ? " has-brand-logo" : ""}`} aria-hidden="true">{thptqg ? <img src="/logo_thptqg.svg" alt="" /> : <><ShieldCheck/><small>THI ONLINE</small></>}</div></div><div className="guest-hero-facts"><div><Clock3 aria-hidden="true"/><span><small>Khung giờ</small><b>{entryTime(meta.slot.starts_at)} – {entryTime(meta.slot.ends_at)}</b><em>{entryDate(meta.slot.starts_at)}</em></span></div><div><CalendarDays aria-hidden="true"/><span><small>Phòng thi</small><b>{meta.room.title}</b><em>{meta.section?.title || "Toàn bộ bài thi"}</em></span></div><div><UserRound aria-hidden="true"/><span><small>Trạng thái</small><b>{phaseLabel}</b><em>Không cần tài khoản</em></span></div></div><GuestLinkTimePanel serverTime={meta.serverTime} endsAt={meta.slot.ends_at}/></header><section className="guest-card guest-identity-card"><div className="guest-card-heading"><span className="guest-step-badge">01</span><div className="guest-card-heading-copy"><div className="guest-heading-line"><h2>Xác thực thông tin học sinh</h2><span className="guest-secure-label"><ShieldCheck aria-hidden="true"/> Bảo mật</span></div><p>Điền chính xác thông tin để hệ thống ghi nhận bài làm và trả kết quả cho đúng thí sinh.</p></div></div><div className="guest-form-intro"><span>THÔNG TIN DỰ THI</span><p>Không cần đăng ký tài khoản. Vui lòng kiểm tra lại trước khi bắt đầu.</p></div><form onSubmit={onSubmit}><div className="guest-identity-fields">{meta.settings.identityFields.map(field => <label key={field.key}><span className="guest-field-label">{field.label}{field.required && <em>*</em>}</span><span className="guest-input-shell"><UserRound aria-hidden="true"/><input type={field.type} value={identity[field.key] ?? ""} onChange={event => onChange(field.key, event.target.value)} required={field.required} autoComplete={field.type === "email" ? "email" : field.key.includes("name") ? "name" : "off"} /></span></label>)}</div>{meta.slot.has_password && <label className="guest-password-field"><span className="guest-field-label">Mật khẩu đề thi<em>*</em></span><span className="guest-input-shell"><KeyRound aria-hidden="true"/><input type="password" value={password} onChange={event => onPassword(event.target.value)} required autoComplete="current-password" /></span></label>}{error && <p className="guest-error">{error}</p>}<div className="guest-form-footer"><button type="submit" className="guest-primary" disabled={busy || meta.phase !== "open"}><span>{actionLabel}</span><ArrowRight aria-hidden="true"/></button><small><LockKeyhole aria-hidden="true"/> Thông tin chỉ được dùng để ghi nhận bài làm của kíp thi.</small></div></form></section></div></main>;
}

function GuestThptqgConfirmation({ meta, candidateName, error, busy, onStart, onExit }: { meta: Meta; candidateName: string; error: string; busy: boolean; onStart: () => void; onExit: () => void }) {
  const examType = normalizeExamType(meta.exam.exam_type || meta.room.exam_type);
  return <ThptqgConfirmation
    room={{ id: "guest-room", title: meta.room.title, description: meta.exam.description, exam_type: examType }}
    exam={{ id: meta.exam.id, title: meta.exam.title, description: meta.exam.description, exam_type: examType, duration_minutes: meta.exam.duration_minutes, mode: "exam" }}
    section={meta.section ? { id: meta.section.id, exam_id: meta.exam.id, title: meta.section.title, duration_minutes: meta.section.duration_minutes ?? meta.exam.duration_minutes, sort_order: 0, subject_code: meta.section.subject_code } : undefined}
    questionCount={0}
    candidateName={candidateName}
    mode="exam"
    starting={busy}
    error={error}
    onStart={onStart}
    onExit={onExit}
  />;
}

function GuestExamTake({ meta, questions, answers, flaggedQuestions, secondsLeft, networkState, candidateName, candidateId, onProgress, onSubmit }: { meta: Meta; questions: Question[]; answers: Record<string, AnswerValue>; flaggedQuestions: string[]; secondsLeft: number; networkState: string; candidateName: string; candidateId: string; onProgress: (progress: { answers: Record<string, AnswerValue>; marked: string[] }) => void; onSubmit: (answers?: Record<string, AnswerValue>) => void | Promise<void> }) {
  if (usesThptqgRenderer(meta)) return <GuestThptqgExamTake meta={meta} questions={questions} answers={answers} flaggedQuestions={flaggedQuestions} secondsLeft={secondsLeft} networkState={networkState} candidateName={candidateName} candidateId={candidateId} onProgress={onProgress} onSubmit={onSubmit} />;
  return <GuestRemixExamTake meta={meta} questions={questions} answers={answers} flaggedQuestions={flaggedQuestions} secondsLeft={secondsLeft} candidateName={candidateName} candidateId={candidateId} onProgress={onProgress} onSubmit={onSubmit} />;
}

function guestThptqgQuestions(questions: Question[]): ThptqgQuestion[] {
  return questions.map(question => ({
    id: question.id,
    prompt: question.prompt,
    question_type: question.question_type as ThptqgQuestion["question_type"],
    options: question.options,
    option_columns: question.option_columns ?? undefined,
    passage: question.passage ?? null,
    media_url: question.media_url ?? null,
    instruction: question.instruction ?? null,
    part: question.part,
  }));
}

function GuestThptqgExamTake({ meta, questions, answers, flaggedQuestions, secondsLeft, networkState, candidateName, candidateId, onProgress, onSubmit }: { meta: Meta; questions: Question[]; answers: Record<string, AnswerValue>; flaggedQuestions: string[]; secondsLeft: number; networkState: string; candidateName: string; candidateId: string; onProgress: (progress: { answers: Record<string, AnswerValue>; marked: string[] }) => void; onSubmit: (answers?: Record<string, AnswerValue>) => void }) {
  const thptqgQuestions = guestThptqgQuestions(questions);
  const lastProgress = useRef(JSON.stringify({ answers, marked: flaggedQuestions }));
  const syncProgress = (progress: ThptqgProgress) => {
    const serialized = JSON.stringify({ answers: progress.answers, marked: progress.marked });
    if (serialized === lastProgress.current) return;
    lastProgress.current = serialized;
    onProgress({ answers: progress.answers, marked: progress.marked });
  };
  return <div className="guest-thptqg-room"><ExamFullscreenGuard/><ThptqgExamRenderer
    examTitle={meta.exam.title}
    subjectTitle={meta.section?.title ?? "Môn thi"}
    candidateName={candidateName}
    candidateId={candidateId}
    mode="exam"
    questions={thptqgQuestions}
    initialAnswers={answers as Record<string, ThptqgAnswerValue>}
    initialMarked={flaggedQuestions}
    initialRemainingSeconds={Math.max(1, secondsLeft)}
    resetQuestionIndex={meta.settings.resetQuestionIndex}
    onExit={() => undefined}
    showExitButton={false}
    onSubmit={nextAnswers => onSubmit(nextAnswers as Record<string, AnswerValue>)}
    onProgress={syncProgress}
    networkState={networkState}
  /></div>;
}

function guestRemixQuestions(questions: Question[]): RemixSourceQuestion[] {
  return questions.map(question => ({
    id: question.id,
    prompt: question.prompt,
    question_type: question.question_type as RemixSourceQuestion["question_type"],
    options: question.options,
    passage: question.passage ?? null,
    media_url: question.media_url ?? null,
    instruction: question.instruction ?? null,
    section_id: question.section_id,
    option_columns: question.option_columns ?? undefined,
    matching: question.matching,
    option_order: question.option_order,
  }));
}

function GuestRemixExamTake({ meta, questions, answers, flaggedQuestions, secondsLeft, candidateName, candidateId, onProgress, onSubmit }: { meta: Meta; questions: Question[]; answers: Record<string, AnswerValue>; flaggedQuestions: string[]; secondsLeft: number; candidateName: string; candidateId: string; onProgress: (progress: { answers: Record<string, AnswerValue>; marked: string[] }) => void; onSubmit: (answers?: Record<string, AnswerValue>) => void }) {
  const remixQuestions = guestRemixQuestions(questions);
  const lastProgress = useRef(JSON.stringify({ answers, marked: flaggedQuestions }));
  const syncProgress = (progress: { answers: Record<string, unknown>; marked: string[] }) => {
    const nextAnswers = progress.answers as Record<string, AnswerValue>;
    const serialized = JSON.stringify({ answers: nextAnswers, marked: progress.marked });
    if (serialized === lastProgress.current) return;
    lastProgress.current = serialized;
    onProgress({ answers: nextAnswers, marked: progress.marked });
  };
  const examType = normalizeExamType(meta.exam.exam_type || meta.room.exam_type);
  return <div className={`guest-remix-room guest-remix-${examType.toLowerCase()}`}><ExamFullscreenGuard/><RemixStudyEduExamRenderer
    examTitle={meta.exam.title}
    examType={examType}
    sectionTitle={meta.section?.title}
    durationMinutes={meta.exam.duration_minutes}
    questions={remixQuestions}
    initialAnswers={answers}
    initialMarked={flaggedQuestions}
    initialRemainingSeconds={Math.max(1, secondsLeft)}
    candidateName={candidateName}
    candidateId={candidateId}
    timed
    onProgress={progress => syncProgress(progress)}
    onSubmit={submission => onSubmit(submission.answers as Record<string, AnswerValue>)}
  /></div>;
}

function GuestResult({ meta, result, onClose, onRetake }: { meta: Meta; result: Result; onClose: () => void; onRetake: () => void }) {
  const lockedMessage = result.scoreVisible
    ? "Điểm đã được công bố. Giáo viên chưa mở phần đề và đáp án để xem lại."
    : "Kết quả và đáp án chưa được mở theo cấu hình của kíp thi.";
  return <main className="guest-exam-page"><header className="guest-result-hero"><span>ĐÃ NỘP BÀI</span><h1>{meta.exam.title}</h1>{result.scoreVisible ? <div className="guest-result-score"><b>{result.attempt.score}</b><small>điểm</small></div> : <p>Điểm và số câu đúng sẽ được công bố theo cấu hình của kíp thi.</p>}</header><section className="guest-card guest-result-card"><div className="guest-result-summary">{result.scoreVisible && <span><b>{result.attempt.correct_answers}/{result.attempt.total_questions}</b><small>Số câu đúng</small></span>}<span><b>{formatDuration(result.attempt.duration_seconds ?? 0)}</b><small>Thời gian làm</small></span></div>{result.answersVisible ? <div className="guest-result-details"><h2>Đối chiếu đáp án</h2>{(result.questions ?? []).map((item, index) => <article key={item.id}><b>Câu {index + 1}</b><span className={item.voided ? "voided" : item.correct ? "correct" : "wrong"}>{item.voided ? "Hủy câu" : item.correct ? "Đúng" : "Sai"}</span><p>Bạn chọn: {display(item.selected) || "Bỏ trống"}</p>{item.correctAnswer != null && <p>Đáp án: {display(item.correctAnswer)}</p>}{item.explanation && <small>{item.explanation}</small>}</article>)}</div> : <p className="guest-result-note"><Eye/> {lockedMessage}</p>}<div className="guest-result-actions-row"><button className="guest-secondary" onClick={onRetake}>Làm lại</button><button className="guest-secondary" onClick={onClose}>Đóng kết quả</button></div></section></main>;
}
