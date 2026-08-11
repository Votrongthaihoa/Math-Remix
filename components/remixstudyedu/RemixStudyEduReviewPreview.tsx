"use client";

import { useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import LearnerExamPreview, { toSourceQuestion, type PreviewItem } from "./LearnerExamPreview";
import {
  buildRendererPartData,
  convertAnswersForRenderer,
} from "./ExamRendererAdapter";
import { answersMatch, hasAnswerValue } from "../../lib/exam-answers";
import { formatLatexAnswerForDisplay, latexPartInstruction, type LatexPartNumber } from "../../lib/exam-latex";
import {
  GroupPassage as RemixStudyEduGroupPassage,
  isAnswered as remixStudyEduIsAnswered,
  QuestionAnswer as RemixStudyEduQuestionAnswer,
  RichQuestionContent as RemixStudyEduRichQuestionContent,
} from "./MathExam.jsx";
import "./tsa-result.css";
import "./tsa-result-overrides.css";
import "./tsa-review-preview.css";

type RendererQuestion = {
  id: string;
  content: string;
  type: "single_choice" | "multiple_choice" | "fill_in_blank" | "true_false" | "ordering" | "matching" | "drag_and_drop";
  option_columns: number;
  data_questions: {
    answers?: Array<{ content: string }>;
    items?: Array<{ value?: string; content?: string } | string>;
    left_items?: Array<{ value?: string; content?: string }>;
    right_items?: Array<{ value?: string; content?: string }>;
  };
  _groupId?: string;
  _groupContent?: string;
};

type QuestionAnswerProps = {
  question: RendererQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  mathDisplayStyle?: boolean;
  readOnly?: boolean;
  hideEmptyReadOnlyBlanks?: boolean;
};

const QuestionAnswer = RemixStudyEduQuestionAnswer as unknown as ComponentType<QuestionAnswerProps>;
const GroupPassage = RemixStudyEduGroupPassage as unknown as ComponentType<{ content: string; start?: number; end?: number; className?: string }>;
const RichQuestionContent = RemixStudyEduRichQuestionContent as unknown as ComponentType<{ content: string; mathDisplayStyle?: boolean }>;

type RemixStudyEduReviewPreviewProps = {
  previewItems: PreviewItem[];
  title: string;
  sectionTitle: string;
  durationMinutes: number;
  candidateName?: string;
  candidateId?: string;
  candidateEmail?: string;
  submittedAt?: string | null;
  logoSrc?: string;
  logoAlt?: string;
  onExit?: () => void;
  headerExtras?: ReactNode;
  /** Render submitted answers and official keys instead of the author preview. */
  resultMode?: boolean;
  attemptAnswers?: unknown[];
  correctAnswers?: unknown[];
};

function answerItemContent(item: unknown) {
  let raw = "";
  if (item && typeof item === "object") {
    const value = item as { content?: unknown; label?: unknown; value?: unknown };
    raw = String(value.content ?? value.label ?? value.value ?? "");
  } else {
    raw = String(item ?? "");
  }
  const formatted = formatLatexAnswerForDisplay(raw);
  return typeof formatted === "string" ? formatted : formatted.join(", ");
}

function answerSummaryItems(question: RendererQuestion, value: unknown) {
  const answers = question.data_questions.answers ?? [];
  const items = question.data_questions.items ?? [];
  const empty = "Chưa chọn";

  if (question.type === "single_choice") {
    const index = Number(value);
    return Number.isInteger(index) && answers[index]
      ? [`${String.fromCharCode(65 + index)}. ${answerItemContent(answers[index])}`]
      : [empty];
  }
  if (question.type === "multiple_choice") {
    if (!Array.isArray(value) || value.length === 0) return [empty];
    return value
      .map((item) => Number(item))
      .filter((index) => Number.isInteger(index) && Boolean(answers[index]))
      .map((index) => `${String.fromCharCode(65 + index)}. ${answerItemContent(answers[index])}`);
  }
  if (question.type === "true_false") {
    return items.map((_, index) => `Ý ${index + 1}: ${Array.isArray(value) && value[index] === true ? "Đúng" : Array.isArray(value) && value[index] === false ? "Sai" : empty}`);
  }
  if (question.type === "fill_in_blank") {
    const count = Math.max(1, (question.content.match(/____/g) ?? []).length);
    return Array.from({ length: count }, (_, index) => `Ô ${index + 1}: ${String(Array.isArray(value) ? value[index] ?? "" : "").trim() || "Chưa điền"}`);
  }
  if (question.type === "drag_and_drop") {
    const count = Math.max(1, (question.content.match(/____/g) ?? []).length);
    return Array.from({ length: count }, (_, index) => {
      const itemIndex = Number(Array.isArray(value) ? value[index] : -1);
      return `Ô ${index + 1}: ${Number.isInteger(itemIndex) && itemIndex >= 0 && items[itemIndex] ? answerItemContent(items[itemIndex]) : "Chưa điền"}`;
    });
  }
  if (question.type === "ordering") {
    if (!Array.isArray(value) || value.length === 0) return [empty];
    return value.map((item) => {
      const selected = items.find((candidate) => String(typeof candidate === "object" ? candidate.value : candidate) === String(item));
      return answerItemContent(selected ?? item);
    });
  }
  if (question.type === "matching") {
    const leftItems = question.data_questions.left_items ?? [];
    const rightItems = question.data_questions.right_items ?? [];
    if (!Array.isArray(value) || value.length === 0) return [empty];
    return leftItems.map((_, index) => {
      const selectedIndex = Number(value[index]);
      const selected = Number.isInteger(selectedIndex) && selectedIndex >= 0 ? rightItems[selectedIndex] : undefined;
      return `Ý ${index + 1}: ${selected ? answerItemContent(selected) : empty}`;
    });
  }
  return [value === undefined || value === null || value === "" ? empty : String(value)];
}

function questionSolution(item: PreviewItem | undefined) {
  const solution = item?.parsed.solution?.trim();
  return solution || null;
}

type ReviewQuestionDisplayMeta = { number: number; partInstruction?: string };

function reviewQuestionDisplayMeta(items: PreviewItem[]): ReviewQuestionDisplayMeta[] {
  const starts = items.flatMap((item, index) => item.parsed.part ? [{ index, part: item.parsed.part }] : []);
  return items.map((item, index) => {
    if (item.displayNumber) return { number: item.displayNumber, partInstruction: item.partInstruction };
    const start = starts.filter(item => item.index <= index).at(-1);
    if (!start) return { number: index + 1 };
    const nextStart = starts.find(item => item.index > start.index)?.index ?? items.length;
    return {
      number: index - start.index + 1,
      partInstruction: index === start.index
        ? latexPartInstruction(start.part as LatexPartNumber, nextStart - start.index)
        : undefined,
    };
  });
}

function ReviewAnswerSummary({ question, value, label }: { question: RendererQuestion; value: unknown; label: string }) {
  return <div className="tsa-review-key-summary" data-answer-type={question.type}>
    <strong>{label}:</strong>
    <div className="tsa-review-key-values">
      {answerSummaryItems(question, value).map((item, index) => <div key={`${question.id}-answer-${index}`}><RichQuestionContent content={item} /></div>)}
    </div>
  </div>;
}

function buildTsaReviewWatermark(candidateId: string, candidateEmail: string, submittedAt: string | null | undefined) {
  const value = candidateId.trim();
  const email = candidateEmail.trim();
  if (!value && !email) return "none";
  const completedAt = submittedAt
    ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(submittedAt))
    : "";
  const escapeSvgText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="190" viewBox="0 0 340 190"><g transform="rotate(-22 170 95)">${value ? `<text x="170" y="73" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" letter-spacing="1.8" fill="#0a328c" fill-opacity="0.09">${escapeSvgText(value)}</text>` : ""}${email ? `<text x="170" y="99" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="600" letter-spacing="0.6" fill="#0a328c" fill-opacity="0.09">${escapeSvgText(email)}</text>` : ""}${completedAt ? `<text x="170" y="122" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="600" letter-spacing="1" fill="#0a328c" fill-opacity="0.09">${escapeSvgText(completedAt)}</text>` : ""}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export default function RemixStudyEduReviewPreview({ previewItems, title, sectionTitle, durationMinutes, candidateName = "Học viên", candidateId = "", candidateEmail = "", submittedAt = null, logoSrc = "/logo_tsa.svg", logoAlt = "TSA", onExit, headerExtras = null, resultMode = false, attemptAnswers = [], correctAnswers = [] }: RemixStudyEduReviewPreviewProps) {
  const sourceQuestions = useMemo(() => previewItems.map((item, index) => toSourceQuestion(item, index)), [previewItems]);
  const partData = useMemo(() => buildRendererPartData(title, durationMinutes, sourceQuestions), [durationMinutes, sourceQuestions, title]);
  const questions = partData.questions as RendererQuestion[];
  const displayMeta = useMemo(() => reviewQuestionDisplayMeta(previewItems), [previewItems]);
  const parsedById = useMemo(() => new Map(previewItems.map((item, index) => [`preview-question-${index + 1}`, item])), [previewItems]);
  const submittedValues = useMemo(() => sourceQuestions.map((_, index) => resultMode ? attemptAnswers[index] : previewItems[index]?.parsed.correctAnswer), [attemptAnswers, previewItems, resultMode, sourceQuestions]);
  const keyValues = useMemo(() => sourceQuestions.map((_, index) => {
    if (!resultMode) return previewItems[index]?.parsed.correctAnswer;
    const storedKey = correctAnswers[index];
    if (hasAnswerValue(storedKey)) return storedKey;
    const itemKey = previewItems[index]?.correctAnswer;
    return hasAnswerValue(itemKey) ? itemKey : previewItems[index]?.parsed.correctAnswer;
  }), [correctAnswers, previewItems, resultMode, sourceQuestions]);
  const displayAnswerMap = useMemo(() => Object.fromEntries(sourceQuestions.map((question, index) => [question.id, hasAnswerValue(keyValues[index]) ? formatLatexAnswerForDisplay(keyValues[index]) : undefined]).filter(([, value]) => value !== undefined)), [keyValues, sourceQuestions]);
  const candidateAnswerMap = useMemo(() => Object.fromEntries(sourceQuestions.map((question, index) => [question.id, hasAnswerValue(submittedValues[index]) ? formatLatexAnswerForDisplay(submittedValues[index]) : undefined]).filter(([, value]) => value !== undefined)), [sourceQuestions, submittedValues]);
  const answers = useMemo(() => convertAnswersForRenderer(sourceQuestions, displayAnswerMap), [displayAnswerMap, sourceQuestions]);
  const candidateAnswers = useMemo(() => convertAnswersForRenderer(sourceQuestions, candidateAnswerMap), [candidateAnswerMap, sourceQuestions]);
  const reviewWatermark = useMemo(() => buildTsaReviewWatermark(candidateId, candidateEmail, submittedAt), [candidateEmail, candidateId, submittedAt]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [solutionOpen, setSolutionOpen] = useState<Record<string, boolean>>({});
  const [marked, setMarked] = useState<string[]>([]);

  useEffect(() => {
    if (!questions.length) return undefined;
    document.body.classList.add("tsa-review-active");
    return () => document.body.classList.remove("tsa-review-active");
  }, [questions.length]);

  useEffect(() => {
    // Reset review-only UI when a new section or question set is rendered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentIndex((value) => Math.min(value, Math.max(0, questions.length - 1)));
    setPanelOpen(false);
    setSolutionOpen({});
    setMarked([]);
  }, [questions.length, sectionTitle]);

  if (!questions.length) {
    return <LearnerExamPreview
      previewItems={[]}
      mode="answer"
      title={title}
      sectionTitle={sectionTitle}
      durationMinutes={durationMinutes}
      candidateName={candidateName}
      candidateId={candidateId}
      headerExtras={headerExtras}
      standalone
      showToolbar={false}
    />;
  }

  const current = questions[currentIndex] ?? questions[0];
  const visibleQuestions = current._groupId ? questions.filter((question) => question._groupId === current._groupId) : [current];
  const visibleIndexes = visibleQuestions.map((question) => questions.findIndex((item) => item.id === question.id));
  const firstVisible = visibleIndexes[0] ?? 0;
  const lastVisible = visibleIndexes[visibleIndexes.length - 1] ?? 0;
  const firstVisibleNumber = displayMeta[firstVisible]?.number ?? firstVisible + 1;
  const lastVisibleNumber = displayMeta[lastVisible]?.number ?? lastVisible + 1;
  const visibleRange = firstVisible === lastVisible ? `Câu ${firstVisibleNumber}` : `Câu ${firstVisibleNumber}–${lastVisibleNumber}`;
  const answeredCount = questions.filter((question) => remixStudyEduIsAnswered(question, candidateAnswers[question.id])).length;
  const correctCount = questions.filter((question, index) => {
    if (!resultMode) return remixStudyEduIsAnswered(question, candidateAnswers[question.id]);
    const sourceQuestion = sourceQuestions[index];
    return remixStudyEduIsAnswered(question, candidateAnswers[question.id])
      && answersMatch(submittedValues[index], keyValues[index], ["inline", "true_false", "ordering", "drag_drop"].includes(sourceQuestion?.question_type ?? ""));
  }).length;
  const wrongCount = resultMode ? Math.max(0, answeredCount - correctCount) : 0;
  const skippedCount = Math.max(0, questions.length - answeredCount);
  const goTo = (index: number) => {
    setCurrentIndex(Math.min(questions.length - 1, Math.max(0, index)));
    setPanelOpen(false);
  };

  const questionArticles = visibleQuestions.map((question) => {
    const localIndex = questions.findIndex((item) => item.id === question.id);
    const value = answers[question.id];
    const candidateValue = candidateAnswers[question.id];
    const displayAnswered = remixStudyEduIsAnswered(question, value);
    const answered = remixStudyEduIsAnswered(question, candidateValue);
    const sourceQuestion = sourceQuestions[localIndex];
    const isCorrect = !resultMode || (answered && answersMatch(submittedValues[localIndex], keyValues[localIndex], ["inline", "true_false", "ordering", "drag_drop"].includes(sourceQuestion?.question_type ?? "")));
    const solution = questionSolution(parsedById.get(question.id));
    const statusClass = !answered ? "skipped" : isCorrect ? "correct" : "wrong";
    const displayStatusClass = !displayAnswered ? "skipped" : "correct";
    const isMarked = marked.includes(question.id);
    const meta = displayMeta[localIndex] ?? { number: localIndex + 1 };
    return <article className={`grouped-question tsa-review-question result-${displayStatusClass}`} key={question.id} data-question-index={localIndex} data-current={localIndex === currentIndex ? "true" : undefined}>
      {meta.partInstruction && <div className="tsa-review-part-instruction">{meta.partInstruction}</div>}
      <span className="math-question-number tsa-review-number">{meta.number}</span>
      <button type="button" className={`math-bookmark tsa-review-bookmark ${isMarked ? "marked" : ""}`} data-tooltip={isMarked ? "Bỏ đánh dấu câu hỏi" : "Đánh dấu câu hỏi"} aria-label={isMarked ? `Bỏ đánh dấu câu ${meta.number}` : `Đánh dấu câu ${meta.number}`} aria-pressed={isMarked} onClick={() => setMarked((items) => isMarked ? items.filter((id) => id !== question.id) : [...items, question.id])}>
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.12 0H6.08c-.4 0-.79.13-1.104.37a1.9 1.9 0 0 0-.698.967h7.562c.34 0 .665.14.905.391.24.25.375.59.375.945v9.7l1.28.954V1.337c0-.355-.135-.695-.375-.946A1.253 1.253 0 0 0 13.12 0Z" /><path d="M10.56 2.673H2.88c-.34 0-.665.14-.905.391S1.6 3.655 1.6 4.01V16l5.12-3.818L11.84 16V4.01c0-.355-.135-.695-.375-.946a1.253 1.253 0 0 0-.905-.391Z" /></svg>
      </button>
      <div className="math-question-body tsa-review-answer"><QuestionAnswer question={question} value={value} onChange={() => undefined} mathDisplayStyle readOnly hideEmptyReadOnlyBlanks /></div>
      <div className="tsa-review-feedback-row">
        <button type="button" className="tsa-review-solution-toggle" aria-expanded={Boolean(solutionOpen[question.id])} onClick={() => setSolutionOpen((open) => ({ ...open, [question.id]: !open[question.id] }))}>
          <span>Lời giải</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d={solutionOpen[question.id] ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} /></svg>
        </button>
        <span className={`tsa-review-verdict ${statusClass}`}>{!answered ? "Chưa có đáp án" : isCorrect ? "Đúng" : "Sai"}</span>
      </div>
      {solutionOpen[question.id] && <div className="tsa-review-solution-card">
        <div className="tsa-review-solution-heading"><i aria-hidden="true">?</i><strong>Lời giải chi tiết:</strong></div>
        <ReviewAnswerSummary question={question} value={value} label="Đáp án đúng" />
        <div className="tsa-review-solution-copy">{solution ? <RichQuestionContent content={solution} /> : <p>Chưa có lời giải chi tiết trong dữ liệu đề thi.</p>}</div>
      </div>}
    </article>;
  });

  return <main className={`tsa-review-page ${panelOpen ? "panel-open" : ""} ${current._groupId ? "grouped-review-page" : ""} ${reviewWatermark !== "none" ? "has-watermark" : ""} tsa-review-preview-page`} style={{ "--tsa-review-watermark-image": reviewWatermark } as CSSProperties}>
    <header className="tsa-review-header preview-unified-header">
      <img src={logoSrc} alt={logoAlt} />
      <div className="tsa-review-heading"><h1>{title} - {sectionTitle}</h1><strong>{candidateId}</strong></div>
      {headerExtras}
      <button type="button" className="tsa-review-open-menu" onClick={() => setPanelOpen(true)} aria-label="Mở kết quả chi tiết"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg><span>Mở menu</span></button>
    </header>
    <section className={`tsa-review-card ${current._groupId ? "grouped" : "single"}`}>
      {current._groupId && <GroupPassage content={current._groupContent ?? ""} start={firstVisibleNumber} end={lastVisibleNumber} className="tsa-review-passage-pane" />}
      <div className="tsa-review-questions-pane grouped-questions">{questionArticles}</div>
    </section>
    <footer className="tsa-review-footer">
      <span>Đang xem đáp án&nbsp;&nbsp; • &nbsp;&nbsp;{visibleRange} / {questions.length}</span>
      <div><button type="button" disabled={firstVisible === 0} onClick={() => goTo(firstVisible - 1)}>← Câu trước</button><button type="button" disabled={lastVisible === questions.length - 1} onClick={() => goTo(lastVisible + 1)}>Câu tiếp →</button><button type="button" onClick={onExit}>Quay lại</button></div>
      {current._groupId && <button type="button" className="tsa-review-footer-menu" onClick={() => setPanelOpen(true)}>‹ Mở menu / Kết quả</button>}
    </footer>
    {panelOpen && <button type="button" className="tsa-review-panel-overlay" aria-label="Thu gọn kết quả chi tiết" onClick={() => setPanelOpen(false)} />}
    <aside id="tsa-review-sidebar" className={`tsa-review-panel ${panelOpen ? "open" : ""}`}>
      <button type="button" className="tsa-review-panel-close" aria-label="Thu gọn kết quả chi tiết" onClick={() => setPanelOpen(false)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg></button>
      <h2>Thông tin thí sinh</h2>
      <div className="tsa-review-candidate"><p><span>Họ tên</span><strong>{candidateName}</strong></p><p><span>Mã định danh</span><strong>{candidateId || "—"}</strong></p></div>
      <div className="tsa-review-indicators"><span>Chỉ thị màu sắc:</span><div><i className="skipped" data-tooltip="Chưa trả lời" aria-label={`Chưa trả lời ${skippedCount}`}>{skippedCount}</i><i className="correct" data-tooltip="Câu trả lời đúng" aria-label={`Câu trả lời đúng ${correctCount}`}>{correctCount}</i><i className="wrong" data-tooltip="Câu trả lời sai" aria-label={`Câu trả lời sai ${wrongCount}`}>{wrongCount}</i><i className="marked" data-tooltip="Câu trả lời chưa chắc chắn" aria-label={`Câu trả lời chưa chắc chắn ${marked.length}`}>{marked.length}</i></div></div>
      <div className="tsa-review-grid">{questions.map((question, index) => {
        const answered = remixStudyEduIsAnswered(question, candidateAnswers[question.id]);
        const sourceQuestion = sourceQuestions[index];
        const correct = !resultMode || (answered && answersMatch(submittedValues[index], keyValues[index], ["inline", "true_false", "ordering", "drag_drop"].includes(sourceQuestion?.question_type ?? "")));
        const status = !answered ? "skipped" : correct ? "correct" : "wrong";
         const number = displayMeta[index]?.number ?? index + 1;
         const statusLabel = status === "correct" ? "đúng" : status === "wrong" ? "sai" : "chưa làm";
         return <button type="button" aria-label={`Câu ${number}, ${statusLabel}${marked.includes(question.id) ? ", đã đánh dấu" : ""}`} key={question.id} className={`${index === currentIndex ? "current" : ""} ${status} ${marked.includes(question.id) ? "marked" : ""}`} onClick={() => goTo(index)}>{number}</button>;
      })}</div>
      <div className="tsa-review-completion"><span>Bạn đã trả lời</span><strong><em>{answeredCount}</em>/{questions.length} <small>câu</small></strong><div><i style={{ width: `${questions.length ? answeredCount / questions.length * 100 : 0}%` }} /></div><b>{questions.length ? Math.round(answeredCount / questions.length * 100) : 0}%</b></div>
      <p className="tsa-review-connected"><i aria-hidden="true" />Đã kết nối máy chủ</p>
    </aside>
  </main>;
}
