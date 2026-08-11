"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Computer, FilePenLine, List, Maximize2, Menu, Timer, ZoomIn, ZoomOut, X } from "lucide-react";
import { isGuestExamImage, RichQuestionContent as BaseRichQuestionContent } from "../remixstudyedu/MathExam";
import { formatLatexAnswerForDisplay, latexPartInstruction, normalizeLatexContent, resolveBaidocQuestionRange, type LatexPartNumber } from "../../lib/exam-latex";
import { positionalOptionParts } from "../../lib/exam-option-display";
import "./thptqg.css";

type RichQuestionContentProps = {
  content: string;
  renderBlank?: (blankIndex: number) => ReactNode;
  paragraphBreaks?: boolean;
  mathDisplayStyle?: boolean;
  wrapParagraphs?: boolean;
  inline?: boolean;
};

function TsaRichQuestionContent({ mathDisplayStyle, inline, renderBlank, ...props }: RichQuestionContentProps) {
  return <BaseRichQuestionContent {...props} renderBlank={renderBlank} inline={inline} mathDisplayStyle={mathDisplayStyle ?? Boolean(inline)} />;
}

type AnswerValue = string | string[];
type OptionValue = string | { id?: string; value?: string; label?: string; text?: string };
type Question = { id: string; prompt: string; question_type: "single" | "multiple" | "text" | "inline" | "true_false" | "ordering" | "drag_drop"; options: OptionValue[]; option_order?: string[]; option_columns?: number; passage?: string | null; media_url?: string | null; instruction?: string | null; solution?: string | null; part?: LatexPartNumber; _displayNumber?: number; _partInstruction?: string; _loading?: boolean; _loadError?: string };
type ThptqgProgress = { answers: Record<string, AnswerValue>; marked: string[]; currentIndex: number; remainingSeconds: number; questionSeconds: number };

type QuestionDisplayMeta = { number: number; partInstruction?: string };
type PassageGroupItem = { question: Question; index: number; number: number; partInstruction?: string };
type PassageGroup = { key: string; passage: string; startIndex: number; items: PassageGroupItem[] };
type QuestionListContextValue = {
  groups: PassageGroup[];
  currentIndex: number;
  answers: Record<string, AnswerValue>;
  marked: Set<string>;
  zoom: number;
  readOnly: boolean;
  previewMode: "exam" | "answer";
  setAnswer: (questionId: string, value: AnswerValue) => void;
  toggleMark: (questionId: string) => void;
};
const QuestionListContext = createContext<QuestionListContextValue | null>(null);

function questionDisplayMeta(questions: Question[], resetQuestionIndex = true): QuestionDisplayMeta[] {
  const starts = questions.flatMap((question, index) => question.part ? [{ index, part: question.part }] : []);
  return questions.map((question, index) => {
    if (question._displayNumber) return { number: question._displayNumber, partInstruction: question._partInstruction };
    const start = starts.filter(item => item.index <= index).at(-1);
    if (!start) return { number: index + 1 };
    const nextStart = starts.find(item => item.index > start.index)?.index ?? questions.length;
    return {
      number: resetQuestionIndex ? index - start.index + 1 : index + 1,
      partInstruction: index === start.index ? latexPartInstruction(start.part, nextStart - start.index) : undefined,
    };
  });
}

function buildPassageGroups(questions: Question[], displayMeta: QuestionDisplayMeta[]) {
  const groups: PassageGroup[] = [];
  questions.forEach((question, index) => {
    const passage = question.passage?.trim();
    if (!passage) return;
    const key = passage;
    const previous = groups.at(-1);
    const item = { question, index, number: displayMeta[index]?.number ?? index + 1, partInstruction: displayMeta[index]?.partInstruction };
    if (previous && previous.key === key && previous.items.at(-1)?.index === index - 1) previous.items.push(item);
    else groups.push({ key, passage, startIndex: index, items: [item] });
  });
  return groups;
}

function wrapBareVectorCommands(value: string) {
  let result = "";
  let index = 0;
  let inMath = false;
  while (index < value.length) {
    if (value.startsWith("$$", index)) {
      inMath = !inMath;
      result += "$$";
      index += 2;
      continue;
    }
    if (value[index] === "$") {
      inMath = !inMath;
      result += "$";
      index += 1;
      continue;
    }
    if (value.startsWith("\\(", index) || value.startsWith("\\[", index)) {
      inMath = true;
      result += value.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (value.startsWith("\\)", index) || value.startsWith("\\]", index)) {
      inMath = false;
      result += value.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (!inMath && (value.startsWith("\\vec", index) || value.startsWith("\\overrightarrow", index))) {
      const command = value.startsWith("\\overrightarrow", index) ? "\\overrightarrow" : "\\vec";
      let cursor = index + command.length;
      while (/\s/.test(value[cursor] || "")) cursor += 1;
      if (value[cursor] === "{") {
        const start = cursor;
        let depth = 0;
        while (cursor < value.length) {
          if (value[cursor] === "{") depth += 1;
          if (value[cursor] === "}") {
            depth -= 1;
            if (depth === 0) break;
          }
          cursor += 1;
        }
        if (depth === 0 && value[cursor] === "}") {
          result += `$\\overrightarrow${value.slice(start, cursor + 1)}$`;
          index = cursor + 1;
          continue;
        }
      }
    }
    result += value[index];
    index += 1;
  }
  return result;
}

function normalizeThptContent(value: string) {
  return normalizeLatexContent(wrapBareVectorCommands(value));
}

function richContent(value: string) {
  const normalized = normalizeThptContent(value);
  const formatted = formatLatexAnswerForDisplay(normalized);
  return normalizeThptContent(typeof formatted === "string" ? formatted : formatted.join(", "));
}

function formatCountdown(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  return `${String(hours).padStart(2, "0")} : ${String(minutes).padStart(2, "0")} : ${String(remainingSeconds).padStart(2, "0")}`;
}

function saveStateLabel(value: string | undefined) {
  const labels: Record<string, string> = { saving: "Đang lưu…", saved: "Đã lưu", offline: "Ngoại tuyến", retrying: "Đang thử lại…", conflict: "Có xung đột", failed: "Chưa đồng bộ" };
  return labels[value ?? ""] ?? "Đã kết nối";
}

const QUESTION_FONT_SIZE = 16;
const MIN_ZOOM_PERCENT = 100;
const MAX_ZOOM_PERCENT = 160;
const ZOOM_STEP_PERCENT = 10;

function answerComplete(question: Question, value: AnswerValue | undefined) {
  if (question._loading) return false;
  if (question.question_type === "text") return typeof value === "string" && value.trim().length > 0;
  if (question.question_type === "inline") {
    const values = Array.isArray(value) ? value : [];
    return values.length >= Math.max(1, (question.prompt.match(/_{3,}/g) ?? []).length) && values.every(item => item.trim());
  }
  if (question.question_type === "true_false") return Array.isArray(value) && value.length >= question.options.length && value.every(Boolean);
  return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim().length > 0;
}

const SHORT_ANSWER_LENGTH = 4;

function normalizeShortAnswer(value: string) {
  return Array.from(value.replace(/\./g, ","))
    .filter(character => /[0-9,\-]/.test(character))
    .slice(0, SHORT_ANSWER_LENGTH)
    .join("");
}

function ShortAnswerField({ value, number, readOnly, onAnswer }: { value?: string; number: number; readOnly: boolean; onAnswer: (value: string) => void }) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const answer = normalizeShortAnswer(value ?? "");
  const focusInput = (index: number) => inputRefs.current[Math.max(0, Math.min(SHORT_ANSWER_LENGTH - 1, index))]?.focus();
  const updateInput = (index: number, rawValue: string) => {
    if (rawValue && !normalizeShortAnswer(rawValue)) return;
    const character = normalizeShortAnswer(rawValue).slice(-1);
    const next = character
      ? normalizeShortAnswer(`${answer.slice(0, index)}${character}${answer.slice(index + 1)}`)
      : `${answer.slice(0, index)}${answer.slice(index + 1)}`;
    onAnswer(next);
    if (character && index < SHORT_ANSWER_LENGTH - 1) focusInput(index + 1);
  };
  const pasteInput = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = normalizeShortAnswer(event.clipboardData.getData("text"));
    if (!pasted) return;
    const next = normalizeShortAnswer(`${answer.slice(0, index)}${pasted}${answer.slice(index + pasted.length)}`);
    onAnswer(next);
    focusInput(index + pasted.length);
  };
  return <div className="thptqg-short-answer">
    <span className="thptqg-short-answer-label">KQ:</span>
    <div className="thptqg-short-answer-boxes" role="group" aria-label={`Đáp án ngắn câu ${number}`}>
      {Array.from({ length: SHORT_ANSWER_LENGTH }, (_, index) => <input
        key={index}
        ref={element => { inputRefs.current[index] = element; }}
        className="thptqg-short-answer-box"
        value={answer[index] ?? ""}
        maxLength={1}
        inputMode="text"
        autoComplete="off"
        aria-label={`KQ câu ${number}, ô ${index + 1}`}
        onChange={event => updateInput(index, event.target.value)}
        onKeyDown={event => {
          if (event.key === "Backspace" && !answer[index] && index > 0) focusInput(index - 1);
          if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); focusInput(index - 1); }
          if (event.key === "ArrowRight" && index < SHORT_ANSWER_LENGTH - 1) { event.preventDefault(); focusInput(index + 1); }
        }}
        onPaste={event => pasteInput(index, event)}
        disabled={readOnly}
      />)}
    </div>
  </div>;
}

function PassageContent({ passage, questionStart, questionEnd }: { passage: string; questionStart: number; questionEnd: number }) {
  const resolvedPassage = resolveBaidocQuestionRange(passage, questionStart, questionEnd);
  const lines = resolvedPassage.split(/\r?\n/);
  const firstLine = lines[0]?.trim() ?? "";
  const hasInstruction = /^(?:Dựa\s+vào\s+thông\s+tin\s+dưới\s+đây|Dựa\s+trên\s+thông\s+tin)\b/i.test(firstLine)
    || /\{(?:start|end)\}/i.test(firstLine);
  const instruction = hasInstruction ? firstLine : "";
  const content = (hasInstruction ? lines.slice(1) : lines).join("\n").trimStart();
  return <div className="thptqg-passage">
    {instruction && <div className="thptqg-part-instruction thptqg-passage-instruction">{instruction}</div>}
    <TsaRichQuestionContent content={normalizeThptContent(content)} renderBlank={undefined} mathDisplayStyle wrapParagraphs />
  </div>;
}

function PassageQuestionGroup({ group, single = false }: { group: PassageGroup; single?: boolean }) {
  const context = useContext(QuestionListContext);
  if (!context) return null;
  const firstQuestionNumber = group.items[0]?.number ?? group.startIndex + 1;
  const lastQuestionNumber = group.items[group.items.length - 1]?.number ?? firstQuestionNumber;
  return <section className={`thptqg-passage-group${single ? " thptqg-single-passage-group" : ""}`} data-passage-group={group.startIndex} style={{ fontSize: `${context.zoom}px` }}>
    {group.items[0]?.partInstruction && <div className="thptqg-part-instruction">{group.items[0].partInstruction}</div>}
    <aside className="thptqg-passage-pane"><PassageContent passage={group.passage} questionStart={firstQuestionNumber} questionEnd={lastQuestionNumber} /></aside>
    <div className="thptqg-passage-questions">
      {group.items.map(item => <QuestionCard
        key={`${item.question.id}:${context.previewMode}`}
        question={item.question}
        index={item.index}
        number={item.number}
        value={context.answers[item.question.id]}
        marked={context.marked.has(item.question.id)}
        zoom={context.zoom}
        readOnly={context.readOnly}
        previewMode={context.previewMode}
        current={context.currentIndex === item.index}
        groupedChild
        onAnswer={value => context.setAnswer(item.question.id, value)}
        onToggleMark={() => context.toggleMark(item.question.id)}
      />)}
    </div>
  </section>;
}

function QuestionCard({ question, index, number, partInstruction: partHeading, value, marked, zoom, readOnly = false, previewMode = "exam", current = false, groupedChild = false, onAnswer, onToggleMark }: {
  question: Question;
  index: number;
  number: number;
  partInstruction?: string;
  value?: AnswerValue;
  marked: boolean;
  zoom: number;
  readOnly?: boolean;
  previewMode?: "exam" | "answer";
  current?: boolean;
  groupedChild?: boolean;
  onAnswer: (value: AnswerValue) => void;
  onToggleMark: () => void;
}) {
  const questionListContext = useContext(QuestionListContext);
  const options = question.options.map((option, optionIndex) => positionalOptionParts(option, optionIndex, question.option_order?.[optionIndex]));
  const optionColumns = Math.min(4, Math.max(1, Number(question.option_columns) || 1));
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const choose = (optionValue: string) => {
    if (question.question_type === "multiple") {
      onAnswer(selected.includes(optionValue) ? selected.filter(item => item !== optionValue) : [...selected, optionValue]);
    } else onAnswer(optionValue);
  };
  const inlineValues = Array.isArray(value) ? value : [];
  const inlinePrompt = question.prompt.replace(/_{3,}/g, "____");
  const solution = question.solution?.trim() ?? "";
  const [solutionOpen, setSolutionOpen] = useState(false);
  const passageGroup = questionListContext?.groups.find(group => group.startIndex === index);
  if (!groupedChild && questionListContext && question.passage) {
    return passageGroup ? <PassageQuestionGroup group={passageGroup} /> : null;
  }

  return <article className={`thptqg-question-card${previewMode === "answer" ? " is-answer-preview" : ""}${current ? " is-current" : ""}`} data-question-index={index} style={{ fontSize: `${zoom}px` }}>
    {partHeading && <div className="thptqg-part-instruction">{partHeading}</div>}
    {question.passage && <div className="thptqg-passage"><TsaRichQuestionContent content={normalizeThptContent(question.passage)} renderBlank={undefined} mathDisplayStyle wrapParagraphs /></div>}
    <header className="thptqg-question-heading"><div className="thptqg-question-number">{number}</div><div className="thptqg-question-title"><b>Câu {number}</b>{question.instruction && <em>{question.instruction}</em>}</div><button type="button" className={`math-bookmark ${marked ? "active" : ""}`} data-tooltip={marked ? "Bỏ đánh dấu câu hỏi" : "Đánh dấu câu hỏi"} onClick={onToggleMark} aria-label={marked ? `Bỏ đánh dấu câu ${number}` : `Đánh dấu câu ${number}`} aria-pressed={marked}><svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.12 0H6.08c-.4 0-.79.13-1.104.37a1.9 1.9 0 0 0-.698.967h7.562c.34 0 .665.14.905.391.24.25.375.59.375.945v9.7l1.28.954V1.337c0-.355-.135-.695-.375-.946A1.253 1.253 0 0 0 13.12 0Z"></path><path d="M10.56 2.673H2.88c-.34 0-.665.14-.905.391S1.6 3.655 1.6 4.01V16l5.12-3.818L11.84 16V4.01c0-.355-.135-.695-.375-.946a1.253.253 0 0 0-.905-.391A1.253 1.253 0 0 0 10.56 2.673Z"></path></svg></button></header>
    <div className="thptqg-question-prompt">
      <TsaRichQuestionContent
        content={normalizeThptContent(question.question_type === "inline" ? inlinePrompt : question.prompt)}
        mathDisplayStyle
        renderBlank={question.question_type === "inline" ? (blankIndex: number) => <input className="thptqg-inline-input" value={inlineValues[blankIndex] ?? ""} onChange={event => { const next = [...inlineValues]; next[blankIndex] = event.target.value; onAnswer(next); }} disabled={readOnly} aria-label={`Ô trả lời ${blankIndex + 1}`} /> : undefined}
      />
      {question.media_url && <figure className="thptqg-question-media"><img src={question.media_url} alt="Hình minh họa câu hỏi" crossOrigin={isGuestExamImage(question.media_url) ? "use-credentials" : undefined}/><a href={question.media_url} target="_blank" rel="noreferrer"><Maximize2/>Mở ảnh</a></figure>}
    </div>
    {question.question_type === "text" && <ShortAnswerField value={typeof value === "string" ? value : ""} number={number} readOnly={readOnly} onAnswer={onAnswer} />}
    {question.question_type === "true_false" && <div className="thptqg-true-false true-false-list" role="table" aria-label="Các khẳng định đúng sai"><div className="true-false-head" role="row"><span>Phát biểu</span><span>Đúng</span><span>Sai</span></div>{options.map((option, index) => { const statement = `${String.fromCharCode(97 + index)}) ${option.label}`; return <div className="true-false-row" role="row" key={`${option.value}-${index}`}><TsaRichQuestionContent content={richContent(statement)} renderBlank={undefined} inline /><div className="true-false-cell"><button type="button" className={inlineValues[index] === "true" ? "selected true" : ""} onClick={() => { const next = [...inlineValues]; next[index] = "true"; onAnswer(next); }} disabled={readOnly} aria-label={`${statement}: Đúng`} aria-pressed={inlineValues[index] === "true"} /></div><div className="true-false-cell"><button type="button" className={inlineValues[index] === "false" ? "selected false" : ""} onClick={() => { const next = [...inlineValues]; next[index] = "false"; onAnswer(next); }} disabled={readOnly} aria-label={`${statement}: Sai`} aria-pressed={inlineValues[index] === "false"} /></div></div>; })}</div>}
    {!(["text", "inline", "true_false"].includes(question.question_type)) && <div className={`thptqg-options math-choice-list columns-${optionColumns} ${question.question_type === "multiple" ? "multiple" : "single"}`}>{options.map((option, index) => { const isSelected = selected.includes(option.value); return <div role={readOnly ? undefined : "button"} tabIndex={readOnly ? undefined : 0} key={`${option.value}-${index}`} className={`thptqg-choice-option ${isSelected ? "selected" : ""}${readOnly ? " is-read-only" : ""}`} onClick={readOnly ? undefined : () => choose(option.value)} onKeyDown={readOnly ? undefined : event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(option.value); } }} aria-pressed={readOnly ? undefined : isSelected} aria-disabled={readOnly || undefined} aria-label={`${option.displayLabel}. ${option.label}`}><span className="thptqg-choice-letter" aria-hidden="true">{option.displayLabel}</span><div className="thptqg-choice-content"><TsaRichQuestionContent content={richContent(option.label)} renderBlank={undefined} inline /></div></div>; })}</div>}
    {previewMode === "answer" && <>
      <div className="thptqg-feedback-row">
        <button type="button" className="thptqg-solution-toggle" aria-expanded={solutionOpen} onClick={() => setSolutionOpen(open => !open)}>
          <span>Lời giải</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d={solutionOpen ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} /></svg>
        </button>
      </div>
      {solutionOpen && <div className="thptqg-solution-card">
        <div className="thptqg-solution-heading"><i aria-hidden="true">?</i><strong>Lời giải chi tiết:</strong></div>
        <div className="thptqg-solution-copy">{solution ? <TsaRichQuestionContent content={normalizeThptContent(solution)} renderBlank={undefined} mathDisplayStyle wrapParagraphs /> : <p>Chưa có lời giải chi tiết trong dữ liệu đề thi.</p>}</div>
      </div>}
    </>}
  </article>;
}

function EncryptedQuestionPlaceholder({ index, error, onRequest, observe = false }: { index: number; error?: string; onRequest?: (index: number) => void; observe?: boolean }) {
  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!onRequest) return undefined;
    if (!observe || typeof IntersectionObserver === "undefined") {
      onRequest(index);
      return undefined;
    }
    const root = rootRef.current;
    if (!root) return undefined;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) onRequest(index);
    }, { rootMargin: "240px 0px" });
    observer.observe(root);
    return () => observer.disconnect();
  }, [index, observe, onRequest]);
  return <article ref={rootRef} className="thptqg-question-card thptqg-encrypted-placeholder" aria-busy={!error}>
    <div className="thptqg-question-number">Câu {index + 1}</div>
    {error
      ? <div className="thptqg-encrypted-error" role="alert"><p>{error}</p><button type="button" onClick={() => onRequest?.(index)}>Thử tải lại</button></div>
      : <div className="thptqg-encrypted-skeleton" aria-hidden="true"><i/><i/><i/></div>}
  </article>;
}

export default function ThptqgExamRenderer({ examTitle, subjectTitle, candidateName, candidateId, questions, initialAnswers, initialMarked = [], initialRemainingSeconds, onExit, onSubmit, onProgress, onQuestionRequest, preview = false, previewMode = "exam", onPreviewModeChange, resultReview = false, watermarkImage, showExitButton = true, resetQuestionIndex = true, navigationPolicy = {}, networkState }: {
  examTitle: string;
  subjectTitle: string;
  candidateName: string;
  candidateId: string;
  mode: "practice" | "exam";
  questions: Question[];
  initialAnswers?: Record<string, AnswerValue>;
  initialMarked?: string[];
  initialRemainingSeconds: number;
  onExit: () => void;
  onSubmit: (answers: Record<string, AnswerValue>) => void | Promise<void>;
  onProgress?: (progress: ThptqgProgress) => void;
  onQuestionRequest?: (index: number) => void;
  preview?: boolean;
  previewMode?: "exam" | "answer";
  onPreviewModeChange?: (mode: "exam" | "answer") => void;
  resultReview?: boolean;
  watermarkImage?: string;
  showExitButton?: boolean;
  resetQuestionIndex?: boolean;
  navigationPolicy?: { allowSkip?: boolean; allowBacktrack?: boolean; requireAnswerBeforeNext?: boolean };
  networkState?: string;
}) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(initialAnswers ?? {});
  const [current, setCurrent] = useState(0);
  const [marked, setMarked] = useState<Set<string>>(new Set(initialMarked));
  const [secondsLeft, setSecondsLeft] = useState(Math.max(0, initialRemainingSeconds));
  const [questionSeconds, setQuestionSeconds] = useState(0);
  const [view, setView] = useState<"single" | "list">("single");
  const [zoomPercent, setZoomPercent] = useState(MIN_ZOOM_PERCENT);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const contentRef = useRef<HTMLElement | null>(null);
  const questionStripRef = useRef<HTMLDivElement | null>(null);
  const currentIndexRef = useRef(current);
  const currentChangeSourceRef = useRef<"navigation" | "scroll">("navigation");
  const scrollSyncFrameRef = useRef<number | null>(null);
  const answersRef = useRef(answers);
  const submitRef = useRef(onSubmit);
  const progressRef = useRef(onProgress);
  const autoSubmitted = useRef(false);
  const deadlineAtRef = useRef<number | null>(null);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { submitRef.current = onSubmit; }, [onSubmit]);
  useEffect(() => { progressRef.current = onProgress; }, [onProgress]);
  useEffect(() => {
    if (preview || resultReview) return;
    progressRef.current?.({ answers, marked: [...marked], currentIndex: current, remainingSeconds: secondsLeft, questionSeconds });
  }, [answers, marked, current, preview, questionSeconds, resultReview, secondsLeft]);
  useEffect(() => {
    if (preview || resultReview) return undefined;
    if (deadlineAtRef.current === null) {
      deadlineAtRef.current = Date.now() + Math.max(0, initialRemainingSeconds) * 1_000;
    }
    const updateRemainingTime = () => {
      const deadlineAt = deadlineAtRef.current;
      if (deadlineAt === null) return;
      const remaining = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1_000));
      setSecondsLeft(remaining);
    };
    const timer = window.setInterval(updateRemainingTime, 1_000);
    document.addEventListener("visibilitychange", updateRemainingTime);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", updateRemainingTime);
    };
  }, [initialRemainingSeconds, preview, resultReview]);
  useEffect(() => {
    if (preview || resultReview || secondsLeft > 0 || autoSubmitted.current) return undefined;
    const task = window.setTimeout(() => {
      if (autoSubmitted.current) return;
      autoSubmitted.current = true;
      setConfirmOpen(false);
      setSubmitError("");
      setSubmitting(true);
      void Promise.resolve(submitRef.current(answersRef.current))
        .catch(value => {
          autoSubmitted.current = false;
          setSubmitError(value instanceof Error ? value.message : "Không thể nộp bài thi.");
          setConfirmOpen(true);
        })
        .finally(() => setSubmitting(false));
    }, 0);
    return () => window.clearTimeout(task);
  }, [preview, resultReview, secondsLeft]);
  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  useEffect(() => {
    if (preview || resultReview) return undefined;
    const timer = window.setInterval(() => setQuestionSeconds(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [preview, resultReview]);

  const answered = useMemo(() => questions.filter(question => answerComplete(question, answers[question.id])).length, [answers, questions]);
  const displayMeta = useMemo(() => questionDisplayMeta(questions, resetQuestionIndex), [questions, resetQuestionIndex]);
  const passageGroups = useMemo(() => buildPassageGroups(questions, displayMeta), [displayMeta, questions]);
  const currentQuestion = questions[current];
  const currentMeta = displayMeta[current] ?? { number: current + 1 };
  const currentPassageGroup = useMemo(
    () => passageGroups.find(group => group.items.some(item => item.index === current)),
    [current, passageGroups],
  );
  const allowSkip = navigationPolicy.allowSkip !== false;
  const allowBacktrack = navigationPolicy.allowBacktrack !== false;
  const canNavigateTo = useCallback((index: number) => {
    if (index < 0 || index >= questions.length || index === current) return false;
    if (index < current && !allowBacktrack) return false;
    if (index > current && !allowSkip && index !== current + 1) return false;
    if (index > current && navigationPolicy.requireAnswerBeforeNext && !answerComplete(currentQuestion, answers[currentQuestion?.id])) return false;
    return true;
  }, [allowBacktrack, allowSkip, answers, current, currentQuestion, navigationPolicy.requireAnswerBeforeNext, questions.length]);
  useEffect(() => {
    if (!preview && !resultReview && currentQuestion?._loading) onQuestionRequest?.(current);
  }, [current, currentQuestion?._loading, onQuestionRequest, preview, resultReview]);
  const setQuestionAnswer = (questionId: string, value: AnswerValue) => setAnswers(previous => ({ ...previous, [questionId]: value }));
  const toggleQuestionMark = (questionId: string) => setMarked(previous => {
    const next = new Set(previous);
    if (next.has(questionId)) next.delete(questionId);
    else next.add(questionId);
    return next;
  });
  const goToQuestion = useCallback((next: number) => {
    if (!canNavigateTo(next)) return;
    const bounded = Math.min(Math.max(0, next), Math.max(0, questions.length - 1));
    currentChangeSourceRef.current = "navigation";
    currentIndexRef.current = bounded;
    setCurrent(bounded);
    setQuestionSeconds(0);
  }, [canNavigateTo, questions.length]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.defaultPrevented || confirmOpen || submitting) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input,textarea,select,[contenteditable=\"true\"]"))) return;
      const next = event.key === "ArrowLeft" ? current - 1 : current + 1;
       if (!canNavigateTo(next)) return;
      event.preventDefault();
      goToQuestion(next);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canNavigateTo, confirmOpen, current, goToQuestion, submitting]);
  useEffect(() => {
    if (view === "list") currentChangeSourceRef.current = "navigation";
  }, [view]);
  useEffect(() => {
    if (view !== "list" || currentChangeSourceRef.current !== "navigation") return undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = contentRef.current?.querySelector<HTMLElement>(`[data-question-index="${current}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [current, view]);
  useEffect(() => {
    if (view !== "list") {
      if (scrollSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncFrameRef.current);
        scrollSyncFrameRef.current = null;
      }
      return undefined;
    }
    const content = contentRef.current;
    if (!content) return undefined;
    const syncCurrentFromScroll = () => {
      scrollSyncFrameRef.current = null;
      const contentRect = content.getBoundingClientRect();
      const visibleTop = contentRect.top;
      const visibleBottom = contentRect.bottom;
      const cards = Array.from(content.querySelectorAll<HTMLElement>("[data-question-index]"))
        .map(element => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > visibleTop && rect.top < visibleBottom);
      if (!cards.length) return;
      const anchor = visibleTop + Math.min(48, Math.max(24, content.clientHeight * 0.18));
      const passedAnchor = cards.filter(({ rect }) => rect.top <= anchor);
      const active = passedAnchor.at(-1) ?? cards[0];
      const next = Number(active.element.dataset.questionIndex);
       if (!Number.isInteger(next) || !canNavigateTo(next)) return;
      currentChangeSourceRef.current = "scroll";
      currentIndexRef.current = next;
      setCurrent(next);
    };
    const scheduleSync = () => {
      if (scrollSyncFrameRef.current !== null) return;
      scrollSyncFrameRef.current = window.requestAnimationFrame(syncCurrentFromScroll);
    };
    content.addEventListener("scroll", scheduleSync, { passive: true });
    scheduleSync();
    return () => {
      content.removeEventListener("scroll", scheduleSync);
      if (scrollSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncFrameRef.current);
        scrollSyncFrameRef.current = null;
      }
    };
  }, [canNavigateTo, questions.length, view]);
  useEffect(() => {
    if (view !== "list") return undefined;
    const frame = window.requestAnimationFrame(() => {
      const currentButton = questionStripRef.current?.querySelector<HTMLButtonElement>('button[aria-current="page"]');
      currentButton?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [current, view]);
  useEffect(() => {
    if (view !== "single" || !currentPassageGroup || currentPassageGroup.startIndex === current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const pane = contentRef.current?.querySelector<HTMLElement>(".thptqg-single-passage-group .thptqg-passage-questions");
      const target = pane?.querySelector<HTMLElement>(`[data-question-index="${current}"]`);
      if (!pane || !target) return;
      const paneRect = pane.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetTop = pane.scrollTop + targetRect.top - paneRect.top;
      const targetBottom = targetTop + targetRect.height;
      const visibleTop = pane.scrollTop;
      const visibleBottom = visibleTop + pane.clientHeight;
      if (targetTop < visibleTop) pane.scrollTop = targetTop;
      else if (targetBottom > visibleBottom) pane.scrollTop = targetBottom - pane.clientHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [current, currentPassageGroup, view]);
  const submit = async () => {
    if (submitting) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      await submitRef.current(answersRef.current);
    } catch (value) {
      setSubmitError(value instanceof Error ? value.message : "Không thể nộp bài thi.");
      setConfirmOpen(true);
    } finally {
      setSubmitting(false);
    }
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen can be denied by the browser or unavailable in an embedded preview.
    }
  };

  const readOnly = preview || resultReview;
  const questionFontSize = QUESTION_FONT_SIZE * zoomPercent / 100;
  const questionContext = useMemo<QuestionListContextValue>(() => ({
    groups: passageGroups,
    currentIndex: current,
    answers,
    marked,
    zoom: questionFontSize,
    readOnly,
    previewMode,
    setAnswer: setQuestionAnswer,
    toggleMark: toggleQuestionMark,
  }), [answers, current, marked, passageGroups, previewMode, readOnly, questionFontSize]);
  return <div className={`thptqg-exam-shell${preview ? " is-preview" : ""}${resultReview ? " is-result-review" : ""}${previewMode === "answer" ? " is-answer-review" : ""}${watermarkImage && watermarkImage !== "none" ? " has-watermark" : ""}`} style={{ "--thptqg-watermark-image": watermarkImage ?? "none" } as React.CSSProperties}>
    <header className="thptqg-exam-header">
      <div className="thptqg-exam-header-brand"><img className="thptqg-exam-header-logo" src="/logo_thptqg.svg" alt="THPTQG" /><div className="thptqg-exam-header-title"><h1>{examTitle} - {subjectTitle}</h1><strong>{candidateId || "THPTQG"}</strong></div></div>
      {!preview && !resultReview && <div className="thptqg-header-candidate" aria-label="Thí sinh">{candidateName}</div>}
      <div className="thptqg-exam-header-meta">
        {(preview || resultReview) && <span className="thptqg-header-candidate-inline">{candidateName}</span>}
        {preview
          ? <span className="thptqg-preview-status"><i/>{previewMode === "answer" ? "Bản đáp án" : "Xem trước"}</span>
            : resultReview
            ? <span className="thptqg-result-review-status"><i/>Xem đáp án</span>
            : <span className="thptqg-live-status"><i/>Đang làm bài</span>}
        {!preview && !resultReview && <span className={`thptqg-save-state is-${networkState ?? "online"}`} role="status" aria-live="polite">{saveStateLabel(networkState)}</span>}
        {!resultReview && <div className={`thptqg-header-timer ${secondsLeft < 300 && !preview ? "warning" : ""}`}><Timer className="thptqg-header-timer-icon" aria-hidden="true"/><b>{formatCountdown(secondsLeft)}</b></div>}
        {!resultReview && <button type="button" className="thptqg-header-submit" onClick={() => { if (!preview) { setSubmitError(""); setConfirmOpen(true); } }} disabled={submitting} aria-label="Nộp bài" title="Nộp bài"><FilePenLine/>Nộp bài</button>}
        <button type="button" className="thptqg-fullscreen-button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"} data-tooltip={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}><span className="thptqg-scan-icon" aria-hidden="true"><i className="top-left"/><i className="top-right"/><i className="bottom-left"/><i className="bottom-right"/></span></button>
        {!resultReview && <button type="button" className="thptqg-menu-button" onClick={() => setMenuOpen(value => !value)} aria-label="Mở menu"><Menu/></button>}
      </div>
      {preview && <div className="thptqg-preview-center-controls">
        <div className="thptqg-preview-mode-switch" role="tablist" aria-label="Chọn bản xem trước">
          <button type="button" role="tab" aria-selected={previewMode === "exam"} className={previewMode === "exam" ? "active" : ""} onClick={() => onPreviewModeChange?.("exam")}>Giao diện bài làm</button>
          <button type="button" role="tab" aria-selected={previewMode === "answer"} className={previewMode === "answer" ? "active" : ""} onClick={() => onPreviewModeChange?.("answer")}>Giao diện đáp án</button>
        </div>
        <button type="button" className="thptqg-preview-close" onClick={onExit}>Đóng xem trước</button>
      </div>}
    </header>
    <div className="thptqg-exam-toolbar"><div>{showExitButton && <button type="button" className="thptqg-toolbar-button" onClick={onExit}><ChevronLeft/>Quay lại</button>}</div><div className="thptqg-toolbar-actions"><span>Số câu đã trả lời: <b>{answered}/{questions.length}</b></span><div className="thptqg-font-size-controls" role="group" aria-label="Cỡ chữ"><span className="thptqg-font-size-tooltip" data-tooltip="Thu nhỏ cỡ chữ"><button type="button" className="thptqg-font-size-button" onClick={() => setZoomPercent(value => Math.max(MIN_ZOOM_PERCENT, value - ZOOM_STEP_PERCENT))} disabled={zoomPercent === MIN_ZOOM_PERCENT} aria-label="Thu nhỏ cỡ chữ"><ZoomOut/></button></span><button type="button" className="thptqg-font-size-button" onClick={() => setZoomPercent(value => Math.min(MAX_ZOOM_PERCENT, value + ZOOM_STEP_PERCENT))} disabled={zoomPercent === MAX_ZOOM_PERCENT} aria-label="Phóng to cỡ chữ" title="Phóng to cỡ chữ" data-tooltip="Phóng to cỡ chữ"><ZoomIn/></button></div><div className="thptqg-view-mode-options" role="group" aria-label="Chọn cách hiển thị"><button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-pressed={view === "list"} aria-label="Hiển thị danh sách câu hỏi" data-tooltip="Hiển thị danh sách câu hỏi"><List/></button><button type="button" className={view === "single" ? "active" : ""} onClick={() => setView("single")} aria-pressed={view === "single"} aria-label="Hiển thị từng câu hỏi" data-tooltip="Hiển thị từng câu hỏi"><Computer/></button></div></div></div>
    <QuestionListContext.Provider value={questionContext}>
    <main ref={contentRef} className="thptqg-exam-content">
      {view === "single" && currentQuestion
        ? currentQuestion._loading
          ? <EncryptedQuestionPlaceholder index={current} error={currentQuestion._loadError} onRequest={onQuestionRequest} />
          : (() => {
              return currentPassageGroup
                ? <PassageQuestionGroup group={currentPassageGroup} single />
                 : <QuestionCard key={`${currentQuestion.id}:${previewMode}`} question={currentQuestion} index={current} number={currentMeta.number} partInstruction={currentMeta.partInstruction} current value={answers[currentQuestion.id]} marked={marked.has(currentQuestion.id)} zoom={questionFontSize} readOnly={readOnly} previewMode={previewMode} onAnswer={value => setQuestionAnswer(currentQuestion.id, value)} onToggleMark={() => toggleQuestionMark(currentQuestion.id)} />;
            })()
        : <div className="thptqg-question-list">{questions.map((question, index) => {
            if (question._loading) return <EncryptedQuestionPlaceholder key={question.id} index={index} error={question._loadError} onRequest={onQuestionRequest} observe />;
            const meta = displayMeta[index] ?? { number: index + 1 };
             return <QuestionCard key={`${question.id}:${previewMode}`} question={question} index={index} number={meta.number} partInstruction={meta.partInstruction} value={answers[question.id]} marked={marked.has(question.id)} zoom={questionFontSize} readOnly={readOnly} previewMode={previewMode} onAnswer={value => setQuestionAnswer(question.id, value)} onToggleMark={() => toggleQuestionMark(question.id)} />;
          })}</div>}
    </main>
    </QuestionListContext.Provider>
    <footer className="thptqg-exam-bottom">
      <button type="button" className="thptqg-footer-nav thptqg-footer-prev" onClick={() => goToQuestion(Math.max(0, current - 1))} disabled={current === 0} aria-label="Câu trước"><ChevronLeft /></button>
      <div ref={questionStripRef} className="thptqg-question-strip" style={{ "--question-count": questions.length } as React.CSSProperties} aria-label="Điều hướng câu hỏi">
        <div className="thptqg-question-strip-buttons">
          {questions.map((question, index) => {
            const isAnswered = answerComplete(question, answers[question.id]);
            const isBookmarked = marked.has(question.id);
            const number = displayMeta[index]?.number ?? index + 1;
            return <button
              type="button"
              key={question.id}
              className={`${current === index ? "current" : ""}${isAnswered ? " answered" : ""}${isBookmarked ? " bookmarked" : ""}`}
              onClick={() => goToQuestion(index)}
              aria-label={`Câu ${number}${isAnswered ? ", đã trả lời" : ""}${isBookmarked ? ", đã đánh dấu" : ""}`}
              aria-current={current === index ? "page" : undefined}
            >{String(number).padStart(2, "0")}</button>;
          })}
        </div>
      </div>
      <button type="button" className="thptqg-footer-nav thptqg-footer-next" onClick={() => goToQuestion(Math.min(questions.length - 1, current + 1))} disabled={current >= questions.length - 1} aria-label="Câu tiếp"><ChevronRight /></button>
    </footer>
    {menuOpen && <button type="button" className="thptqg-menu-shade" onClick={() => setMenuOpen(false)} aria-label="Đóng menu" />}
    {confirmOpen && <div className="thptqg-submit-overlay"><section className="thptqg-submit-dialog" role="dialog" aria-modal="true" aria-labelledby="thptqg-submit-title" tabIndex={-1}><button type="button" className="thptqg-dialog-close" onClick={() => { if (!submitting) setConfirmOpen(false); }} disabled={submitting} aria-label="Đóng hộp thoại"><X /></button><div className="thptqg-dialog-icon"><strong>{answered}/{questions.length}</strong><span>câu</span></div><p id="thptqg-submit-title" className="thptqg-submit-copy">Đã trả lời {answered}/{questions.length} câu. Bạn vẫn còn thời gian làm bài, bạn có chắc chắn muốn kết thúc bài thi.</p>{submitError && <p className="thptqg-submit-error" role="alert">{submitError}</p>}<div><button type="button" onClick={() => setConfirmOpen(false)} disabled={submitting}>Làm bài tiếp</button><button type="button" className="primary" onClick={() => void submit()} disabled={submitting} aria-busy={submitting}>{submitting ? "Đang nộp…" : "Nộp bài thi"}</button></div></section></div>}
  </div>;
}

export type { AnswerValue as ThptqgAnswerValue, Question as ThptqgQuestion, ThptqgProgress };
