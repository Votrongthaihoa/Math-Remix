"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  ArrowLeft, BarChart3, BookOpenCheck, Check, ChevronLeft, ChevronRight, ClipboardList,
  CircleAlert, Clock3, FileText, Flag, Grid3X3, ListChecks, Play, RotateCcw,
  Send, Timer, Trophy, X
} from "lucide-react";
import { supabase } from "../lib/supabase";
import LoadingIndicator from "./loading-indicator";
import AccountSecurityGuard from "./account-security-guard";
import "./exam-room.css";

type Room = { id: string; title: string; description: string; exam_type: string; access_mode: string; registration_start: string | null; registration_end: string | null; exam_start: string | null; exam_end: string | null; published: boolean; sort_order: number };
type Exam = { id: string; room_id: string; title: string; description: string; exam_type: string; mode: string; duration_minutes: number; published: boolean; sort_order: number };
type Section = { id: string; exam_id: string; title: string; duration_minutes: number | null; sort_order: number };
type OptionValue = string | { id?: string; value?: string; label?: string; text?: string };
type Question = { id: string; section_id: string; prompt: string; question_type: "single" | "multiple" | "text"; options: OptionValue[]; points: number; sort_order: number };
type AnswerValue = string | string[];
type Attempt = { id: string; exam_id: string; status: string; score: number; correct_answers: number; total_questions: number; submitted_at: string | null; started_at?: string; answers?: Record<string, AnswerValue>; duration_seconds?: number | null };
type AnswerKey = { question_id: string; correct_answer: AnswerValue; explanation: string };
type RouteState = { page: "rooms" | "room" | "exam" | "result"; id?: string; mode?: "practice" | "exam" };

function routeState(): RouteState {
  if (typeof window === "undefined") return { page: "rooms" };
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments[0] === "exam" && segments[1] === "result" && segments[2]) return { page: "result", id: decodeURIComponent(segments[2]) };
  if (segments[0] === "exam" && segments[1]) return { page: "exam", id: decodeURIComponent(segments[1]), mode: new URLSearchParams(window.location.search).get("mode") === "exam" ? "exam" : "practice" };
  if (segments[0] === "exam-room" && segments[1]) return { page: "room", id: decodeURIComponent(segments[1]) };
  return { page: "rooms" };
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

function optionParts(option: OptionValue, index: number) {
  if (typeof option === "string") return { value: option, label: option };
  return { value: option.value ?? option.id ?? String(index), label: option.label ?? option.text ?? option.value ?? `Phương án ${index + 1}` };
}

async function examApi<T>(path: string, init?: RequestInit): Promise<T> {
  if (!supabase) throw new Error("Chưa cấu hình Supabase.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
  const response = await fetch(path, { ...init, cache: "no-store", headers: { authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  const payload = await response.json().catch(() => null) as T & { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || "Không thể tải dữ liệu khảo thí.");
  return payload as T;
}

function MathContent({ children, className = "" }: { children: string; className?: string }) {
  const pieces = useMemo(() => {
    const tokens: Array<{ text: string; math: boolean; display: boolean }> = [];
    const expression = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;
    let cursor = 0;
    for (const match of children.matchAll(expression)) {
      const index = match.index ?? 0;
      if (index > cursor) tokens.push({ text: children.slice(cursor, index), math: false, display: false });
      const raw = match[0];
      const display = raw.startsWith("$$") || raw.startsWith("\\[");
      tokens.push({ text: raw.replace(/^\$\$|\$\$$|^\$|\$$|^\\\[|\\\]$|^\\\(|\\\)$/g, ""), math: true, display });
      cursor = index + raw.length;
    }
    if (cursor < children.length) tokens.push({ text: children.slice(cursor), math: false, display: false });
    return tokens.length ? tokens : [{ text: children, math: false, display: false }];
  }, [children]);
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
  const navigate = useCallback((path: string) => { window.history.pushState({}, "", path); setRoute(routeState()); window.scrollTo({ top: 0, behavior: "smooth" }); }, []);
  if (route.page === "room" && route.id) return <ExamList roomId={route.id} navigate={navigate} />;
  if (route.page === "exam" && route.id) return <ExamRunner examId={route.id} mode={route.mode ?? "practice"} navigate={navigate} />;
  if (route.page === "result" && route.id) return <ExamResult attemptId={route.id} navigate={navigate} />;
  return <ExamRoomCatalog navigate={navigate} />;
}

function PageState({ loading, error, empty, onRetry }: { loading?: boolean; error?: string; empty?: string; onRetry?: () => void }) {
  if (loading) return <div className="exam-page-state"><LoadingIndicator label="Đang tải dữ liệu khảo thí…" /></div>;
  if (error) return <div className="exam-page-state error"><CircleAlert/><h3>Không thể tải dữ liệu</h3><p>{error}</p>{onRetry && <button onClick={onRetry}><RotateCcw/>Thử lại</button>}</div>;
  return <div className="exam-page-state"><BookOpenCheck/><h3>Chưa có phòng thi</h3><p>{empty}</p></div>;
}

function ExamRoomCatalog({ navigate }: { navigate: (path: string) => void }) {
  const [data, setData] = useState<{ rooms: Room[]; exams: Exam[]; attempts: Attempt[] } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setError(""); setData(null); try { setData(await examApi("/api/exams?scope=rooms")); } catch (value) { setError(value instanceof Error ? value.message : "Không thể tải phòng thi."); } }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  if (!data) return <PageState loading={!error} error={error} onRetry={load} />;
  if (!data.rooms.length) return <PageState empty="Phòng thi sẽ xuất hiện sau khi quản trị viên xuất bản và cấp quyền cho bạn." />;
  return <div className="exam-page exam-room-page">
    <header className="exam-page-heading reference-room-heading"><h1>Đánh giá tư duy - TSA</h1><p>Chọn phòng thi để bắt đầu làm bài</p></header>
    <div className="exam-room-grid">{data.rooms.map(room => {
      const exams = data.exams.filter(exam => exam.room_id === room.id);
      const examIds = exams.map(exam => exam.id);
      const completed = new Set(data.attempts.filter(attempt => examIds.includes(attempt.exam_id) && attempt.status !== "in_progress").map(attempt => attempt.exam_id)).size;
      return <article className="exam-room-card reference-room-card" key={room.id} onClick={() => navigate(`/exam-room/${encodeURIComponent(room.id)}`)}>
        <div className="reference-room-card-title"><h2>{room.title}</h2></div>
        <div className="reference-room-card-body">
          <Meta icon={Clock3} label="Đăng ký" value={`${formatDate(room.registration_start, true)} - ${formatDate(room.registration_end, true)}`} />
          <Meta icon={Timer} label="Thời gian thi" value={`${formatDate(room.exam_start, true)} - ${formatDate(room.exam_end, true)}`} />
          <Meta icon={ClipboardList} label="Số lượng bài thi" value={`${exams.length} bài thi`} />
          <Meta icon={FileText} label="Số lượng đề thi" value={`${exams.length} đề thi`} />
        </div>
        <div className="reference-room-card-footer"><div className="reference-room-completion"><div><span>Hoàn thành</span><b>{completed}/{exams.length} bài</b></div><div className="exam-progress"><span style={{ width: `${exams.length ? completed / exams.length * 100 : 0}%` }} /></div></div><button onClick={event => { event.stopPropagation(); navigate(`/exam-room/${encodeURIComponent(room.id)}`); }}>Bắt đầu</button></div>
      </article>;
    })}</div>
  </div>;
}

function Meta({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return <div className="exam-meta-item"><span><Icon/><small>{label}</small></span><b>{value}</b></div>;
}

function ExamList({ roomId, navigate }: { roomId: string; navigate: (path: string) => void }) {
  const [data, setData] = useState<{ room: Room; exams: Exam[]; attempts: Attempt[] } | null>(null);
  const [modeExam, setModeExam] = useState<Exam | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setError(""); setData(null); try { setData(await examApi(`/api/exams?scope=room&roomId=${encodeURIComponent(roomId)}`)); } catch (value) { setError(value instanceof Error ? value.message : "Không thể tải danh sách đề thi."); } }, [roomId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  if (!data) return <PageState loading={!error} error={error} onRetry={load} />;
  return <div className="exam-page exam-list-page">
    <button className="exam-back" onClick={() => navigate("/exam-room")}><ArrowLeft/>Quay lại phòng thi</button>
    <header className="exam-page-heading compact"><span>{data.room.exam_type}</span><h1>{data.room.title}</h1><p>Chọn đề thi và chế độ phù hợp để bắt đầu.</p></header>
    {!data.exams.length ? <PageState empty="Phòng này chưa có đề thi đã xuất bản." /> : <div className="exam-list-grid">{data.exams.map(exam => {
      const attempts = data.attempts.filter(attempt => attempt.exam_id === exam.id);
      const active = attempts.find(attempt => attempt.status === "in_progress");
      const latest = attempts.find(attempt => attempt.status !== "in_progress");
      return <article className="exam-paper-card" key={exam.id}>
        <div className="exam-paper-head"><div><span>{exam.exam_type}</span><h2>{exam.title}</h2></div><FileText/></div>
        {exam.description && <p>{exam.description}</p>}
        <div className="exam-paper-facts"><span><Clock3/><small>Thời lượng</small><b>{exam.duration_minutes} phút</b></span><span><ListChecks/><small>Hình thức</small><b>{exam.mode === "scheduled" ? "Theo lịch" : "Tự do"}</b></span></div>
        {latest && <div className="exam-latest-result"><Trophy/><span><small>Kết quả gần nhất</small><b>{latest.score} điểm · {latest.correct_answers}/{latest.total_questions} câu</b></span></div>}
        <div className="exam-paper-actions">{latest && <button className="secondary" onClick={() => navigate(`/exam/result/${encodeURIComponent(latest.id)}`)}>Xem kết quả</button>}<button onClick={() => active ? navigate(`/exam/${encodeURIComponent(exam.id)}?mode=practice`) : setModeExam(exam)}>{active ? "Tiếp tục" : "Bắt đầu"}<Play/></button></div>
      </article>;
    })}</div>}
    {modeExam && <ModeDialog exam={modeExam} onClose={() => setModeExam(null)} onChoose={mode => navigate(`/exam/${encodeURIComponent(modeExam.id)}?mode=${mode}`)} />}
  </div>;
}

function ModeDialog({ exam, onClose, onChoose }: { exam: Exam; onClose: () => void; onChoose: (mode: "practice" | "exam") => void }) {
  return <div className="exam-modal-shade" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="exam-mode-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-mode-title"><button className="exam-modal-close" onClick={onClose} aria-label="Đóng"><X/></button><span>CHỌN CHẾ ĐỘ</span><h2 id="exam-mode-title">{exam.title}</h2><p>Luyện tập cho phép xem lại đáp án; thực chiến mô phỏng thời gian thi thật.</p><div className="exam-mode-options"><button onClick={() => onChoose("practice")}><BookOpenCheck/><b>Luyện tập</b><small>Làm bài linh hoạt</small></button><button onClick={() => onChoose("exam")}><Timer/><b>Thực chiến</b><small>{exam.duration_minutes} phút</small></button></div><button className="exam-cancel" onClick={onClose}>Hủy</button></section></div>;
}

function ExamRunner({ examId, mode, navigate }: { examId: string; mode: "practice" | "exam"; navigate: (path: string) => void }) {
  const [bundle, setBundle] = useState<{ room: Room; exam: Exam; sections: Section[]; questions: Question[]; activeAttempt?: Attempt | null } | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [current, setCurrent] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError(""); setBundle(null);
    try {
      const loaded = await examApi<{ room: Room; exam: Exam; sections: Section[]; questions: Question[]; activeAttempt?: Attempt | null }>(`/api/exams?scope=exam&examId=${encodeURIComponent(examId)}`);
      if (!loaded.questions.length) throw new Error("Đề thi chưa có câu hỏi đã xuất bản.");
      const started = await examApi<{ attempt: Attempt }>("/api/exams", { method: "POST", body: JSON.stringify({ action: "start", examId, mode }) });
      setBundle(loaded); setAttempt(started.attempt); setAnswers(started.attempt.answers ?? {});
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(started.attempt.started_at ?? Date.now()).getTime()) / 1000));
      setSecondsLeft(Math.max(0, loaded.exam.duration_minutes * 60 - elapsed));
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể mở đề thi."); }
  }, [examId, mode]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useEffect(() => { if (!bundle || !attempt || mode !== "exam") return; const timer = window.setInterval(() => setSecondsLeft(value => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, [bundle, attempt, mode]);
  const submit = useCallback(async () => {
    if (!attempt) return; setSubmitting(true);
    try { const response = await examApi<{ result: Attempt }>("/api/exams", { method: "POST", body: JSON.stringify({ action: "submit", attemptId: attempt.id, answers }) }); navigate(`/exam/result/${encodeURIComponent(response.result.id)}`); }
    catch (value) { setError(value instanceof Error ? value.message : "Không thể nộp bài."); setSubmitting(false); setConfirmSubmit(false); }
  }, [answers, attempt, navigate]);
  useEffect(() => {
    if (bundle && attempt && mode === "exam" && secondsLeft === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void submit();
    }
  }, [attempt, bundle, mode, secondsLeft, submit]);
  if (!bundle || !attempt) return <PageState loading={!error} error={error} onRetry={load} />;
  const question = bundle.questions[current];
  const section = bundle.sections.find(item => item.id === question.section_id);
  const answered = Object.keys(answers).length;
  const choose = (value: string) => setAnswers(previous => {
    if (question.question_type !== "multiple") return { ...previous, [question.id]: value };
    const selected = Array.isArray(previous[question.id]) ? previous[question.id] as string[] : [];
    return { ...previous, [question.id]: selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value] };
  });
  return <div className="exam-runner-shell">
    <AccountSecurityGuard activityType={mode === "exam" ? "exam" : "quiz"} resourceId={examId} />
    <header className="exam-runner-header"><button onClick={() => navigate(`/exam-room/${encodeURIComponent(bundle.room.id)}`)} aria-label="Thoát bài thi"><ArrowLeft/></button><div><span>{mode === "exam" ? "THỰC CHIẾN" : "LUYỆN TẬP"}</span><h1>{bundle.exam.title}</h1></div><div className={`exam-timer ${mode === "exam" && secondsLeft < 300 ? "warning" : ""}`}><Timer/><span><small>Thời gian còn lại</small><b>{mode === "exam" ? formatDuration(secondsLeft) : "Không giới hạn"}</b></span></div><button className="exam-palette-toggle" onClick={() => setPaletteOpen(true)} aria-label="Mở danh sách câu hỏi"><Grid3X3/></button></header>
    <div className="exam-runner-progress"><span style={{ width: `${answered / bundle.questions.length * 100}%` }} /><small>{answered}/{bundle.questions.length} câu đã trả lời</small></div>
    <main className="exam-runner-main">
      <section className="exam-question-panel"><div className="exam-question-top"><span>{section?.title ?? "Bài thi"}</span><b>Câu {current + 1}/{bundle.questions.length}</b></div><div className="exam-question-prompt"><MathContent>{question.prompt}</MathContent></div>
        {question.question_type === "text" ? <label className="exam-text-answer"><span>Nhập câu trả lời</span><textarea value={typeof answers[question.id] === "string" ? answers[question.id] as string : ""} onChange={event => setAnswers(previous => ({ ...previous, [question.id]: event.target.value }))} placeholder="Nhập đáp án của bạn…" /></label>
          : <div className="exam-options">{(question.options ?? []).map((option, index) => { const item = optionParts(option, index); const selected = Array.isArray(answers[question.id]) ? (answers[question.id] as string[]).includes(item.value) : answers[question.id] === item.value; return <button key={`${item.value}-${index}`} className={selected ? "selected" : ""} onClick={() => choose(item.value)}><span>{String.fromCharCode(65 + index)}</span><MathContent>{item.label}</MathContent>{selected && <Check/>}</button>; })}</div>}
        <footer className="exam-question-actions"><button disabled={current === 0} onClick={() => setCurrent(value => value - 1)}><ChevronLeft/>Câu trước</button>{current < bundle.questions.length - 1 ? <button className="primary" onClick={() => setCurrent(value => value + 1)}>Câu tiếp<ChevronRight/></button> : <button className="submit" onClick={() => setConfirmSubmit(true)}><Send/>Nộp bài</button>}</footer>
      </section>
      <QuestionPalette questions={bundle.questions} sections={bundle.sections} answers={answers} current={current} open={paletteOpen} onClose={() => setPaletteOpen(false)} onSelect={index => { setCurrent(index); setPaletteOpen(false); }} onSubmit={() => setConfirmSubmit(true)} />
    </main>
    {confirmSubmit && <div className="exam-modal-shade"><section className="exam-submit-dialog" role="dialog" aria-modal="true"><div className="exam-submit-icon"><Flag/></div><h2>Nộp bài thi?</h2><p>Bạn đã trả lời <b>{answered}/{bundle.questions.length}</b> câu. Sau khi nộp, đáp án không thể thay đổi.</p><div><button onClick={() => setConfirmSubmit(false)} disabled={submitting}>Tiếp tục làm</button><button className="primary" onClick={() => void submit()} disabled={submitting}>{submitting ? "Đang nộp…" : "Xác nhận nộp"}</button></div></section></div>}
  </div>;
}

function QuestionPalette({ questions, sections, answers, current, open, onClose, onSelect, onSubmit }: { questions: Question[]; sections: Section[]; answers: Record<string, AnswerValue>; current: number; open: boolean; onClose: () => void; onSelect: (index: number) => void; onSubmit: () => void }) {
  return <><button className={`exam-palette-shade ${open ? "show" : ""}`} onClick={onClose} aria-label="Đóng danh sách câu hỏi"/><aside className={`exam-question-palette ${open ? "open" : ""}`}><div className="exam-palette-head"><div><span>TIẾN ĐỘ BÀI LÀM</span><h2>Danh sách câu hỏi</h2></div><button onClick={onClose} aria-label="Đóng"><X/></button></div>{sections.map(section => <section key={section.id}><h3>{section.title}</h3><div>{questions.map((question, index) => question.section_id === section.id && <button key={question.id} className={`${index === current ? "current" : ""} ${answers[question.id] !== undefined && answers[question.id] !== "" ? "answered" : ""}`} onClick={() => onSelect(index)}>{index + 1}</button>)}</div></section>)}<div className="exam-palette-legend"><span><i className="answered"/>Đã trả lời</span><span><i className="current"/>Đang xem</span><span><i/>Chưa làm</span></div><button className="exam-palette-submit" onClick={onSubmit}><Send/>Nộp bài</button></aside></>;
}

function ExamResult({ attemptId, navigate }: { attemptId: string; navigate: (path: string) => void }) {
  const [data, setData] = useState<{ room: Room; exam: Exam; sections: Section[]; questions: Question[]; attempt: Attempt; keys: AnswerKey[] } | null>(null);
  const [review, setReview] = useState<number | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setError(""); setData(null); try { setData(await examApi(`/api/exams?scope=result&attemptId=${encodeURIComponent(attemptId)}`)); } catch (value) { setError(value instanceof Error ? value.message : "Không thể tải kết quả."); } }, [attemptId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  if (!data) return <PageState loading={!error} error={error} onRetry={load} />;
  const answerMap = data.attempt.answers ?? {};
  const keyMap = new Map(data.keys.map(key => [key.question_id, key]));
  const current = review === null ? null : data.questions[review];
  return <div className="exam-page exam-result-page"><div className="exam-result-actions"><button className="exam-back" onClick={() => navigate(`/exam-room/${encodeURIComponent(data.room.id)}`)}><ArrowLeft/>Quay lại danh sách</button><button onClick={() => navigate(`/exam/${encodeURIComponent(data.exam.id)}?mode=practice`)}><RotateCcw/>Làm lại</button></div>
    <section className="exam-result-hero"><div><span>KẾT QUẢ BÀI THI</span><h1>{data.exam.title}</h1><p>{formatDate(data.attempt.submitted_at, true)} · {formatDuration(data.attempt.duration_seconds ?? 0)}</p></div><div className="exam-score-ring" style={{ "--score": `${Math.min(100, Math.max(0, Number(data.attempt.score)))}%` } as React.CSSProperties}><span><b>{data.attempt.score}</b><small>điểm</small></span></div></section>
    <section className="exam-result-summary"><div><Check/><span><small>Số câu đúng</small><b>{data.attempt.correct_answers}/{data.attempt.total_questions}</b></span></div><div><BarChart3/><span><small>Tỷ lệ hoàn thành</small><b>{data.attempt.total_questions ? Math.round(data.attempt.correct_answers / data.attempt.total_questions * 100) : 0}%</b></span></div><div><Clock3/><span><small>Thời gian làm</small><b>{formatDuration(data.attempt.duration_seconds ?? 0)}</b></span></div></section>
    <section className="exam-section-results"><header><div><span>PHÂN TÍCH CHI TIẾT</span><h2>Kết quả theo phần</h2></div><p>Chọn một phần để xem lại từng câu.</p></header>{data.sections.map(section => { const questions = data.questions.filter(question => question.section_id === section.id); const correct = questions.filter(question => { const key = keyMap.get(question.id); return key && JSON.stringify(normalizeAnswer(answerMap[question.id])) === JSON.stringify(normalizeAnswer(key.correct_answer)); }).length; const firstIndex = data.questions.findIndex(question => question.section_id === section.id); return <article key={section.id}><div><b>{section.title}</b><small>{correct}/{questions.length} câu đúng</small></div><div className="exam-result-bar"><span style={{ width: `${questions.length ? correct / questions.length * 100 : 0}%` }}/></div><button onClick={() => setReview(firstIndex)}>Chi tiết<ChevronRight/></button></article>; })}</section>
    {current && <div className="exam-review-shade"><section className="exam-review-dialog" role="dialog" aria-modal="true"><header><div><span>XEM LẠI ĐÁP ÁN</span><h2>Câu {review! + 1}/{data.questions.length}</h2></div><button onClick={() => setReview(null)} aria-label="Đóng"><X/></button></header><div className="exam-review-prompt"><MathContent>{current.prompt}</MathContent></div><div className="exam-review-answer"><span>Câu trả lời của bạn</span><MathContent>{Array.isArray(answerMap[current.id]) ? (answerMap[current.id] as string[]).join(", ") : String(answerMap[current.id] ?? "Chưa trả lời")}</MathContent></div><div className="exam-review-answer correct"><span>Đáp án đúng</span><MathContent>{Array.isArray(keyMap.get(current.id)?.correct_answer) ? (keyMap.get(current.id)?.correct_answer as string[]).join(", ") : String(keyMap.get(current.id)?.correct_answer ?? "")}</MathContent></div>{keyMap.get(current.id)?.explanation && <div className="exam-explanation"><b>Lời giải</b><MathContent>{keyMap.get(current.id)!.explanation}</MathContent></div>}<footer><button disabled={review === 0} onClick={() => setReview(value => Math.max(0, (value ?? 0) - 1))}><ChevronLeft/>Câu trước</button><button disabled={review === data.questions.length - 1} onClick={() => setReview(value => Math.min(data.questions.length - 1, (value ?? 0) + 1))}>Câu sau<ChevronRight/></button></footer></section></div>}
  </div>;
}
