"use client";

import { useEffect, useLayoutEffect, useRef, type ComponentType, type ReactNode } from "react";
import { formatLatexAnswerForDisplay, normalizeLatexContent, type ParsedLatexQuestion } from "../../lib/exam-latex";
import { questionTypeLabel } from "../../lib/exam-config";
import {
  buildRendererPartData,
  convertAnswersForRenderer,
  type SourceQuestion,
} from "./ExamRendererAdapter";
import HsaExamRenderer from "./HsaExamRenderer.jsx";
import MathExam from "./MathExam.jsx";
import "./learner-preview.css";

const RemixStudyEduMathExam = MathExam as unknown as ComponentType<Record<string, unknown>>;
const RemixStudyEduHsaExam = HsaExamRenderer as unknown as ComponentType<Record<string, unknown>>;
const usePreviewLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type AnswerValue = string | string[];
type PreviewItem = {
  parsed: ParsedLatexQuestion;
  instruction?: string;
  passage?: string;
  mediaUrl?: string;
  /** Optional candidate/key values used by the result review screen. */
  answer?: unknown;
  correctAnswer?: unknown;
  /** Exact numbering metadata projected by the encrypted exam API. */
  displayNumber?: number;
  partInstruction?: string;
};

function learnerPrompt(parsed: ParsedLatexQuestion) {
  if (parsed.prompt.trim()) return parsed.prompt;
  if (parsed.questionType === "true_false") return "Lựa chọn Đúng hoặc Sai cho từng phát biểu dưới đây.";
  if (parsed.questionType === "ordering") return "Sắp xếp các phương án theo thứ tự đúng.";
  if (parsed.questionType === "drag_drop") return "Kéo các phương án vào vị trí thích hợp.";
  if (parsed.questionType === "text") return "Nhập câu trả lời ngắn.";
  return "Chọn phương án đúng.";
}

function optionLabel(option: ParsedLatexQuestion["options"][number], index: number) {
  return option.label || option.value || `Phương án ${index + 1}`;
}

function normalizeOptionalLatex(value?: string) {
  if (!value?.trim()) return null;
  return normalizeLatexContent(value).trim();
}

export function toSourceQuestion(item: PreviewItem, index: number): SourceQuestion {
  const { parsed } = item;
  return {
    id: `preview-question-${index + 1}`,
    prompt: learnerPrompt(parsed),
    question_type: parsed.questionType,
    option_columns: parsed.optionColumns,
    options: parsed.options.map((option, optionIndex) => ({
      value: option.value || String.fromCharCode(65 + optionIndex),
      label: optionLabel(option, optionIndex),
      order: option.order,
    })),
    matching: parsed.matching,
    instruction: normalizeOptionalLatex(item.instruction),
    passage: normalizeOptionalLatex(item.passage),
    media_url: item.mediaUrl?.trim() || null,
    _normalized: true,
  };
}

function answerText(value: AnswerValue | undefined) {
  return Array.isArray(value) ? value.join(", ") : value ?? "";
}

type PreviewMode = "exam" | "answer";
type HsaReviewStatus = "unanswered" | "correct" | "incorrect";

type LearnerExamPreviewProps = {
  parsed?: ParsedLatexQuestion;
  parsedQuestions?: ParsedLatexQuestion[];
  previewItems?: PreviewItem[];
  solution?: string;
  answers?: Array<AnswerValue | undefined>;
  candidateAnswers?: Array<AnswerValue | undefined>;
  correctAnswers?: Array<AnswerValue | undefined>;
  answer?: AnswerValue;
  mode?: PreviewMode;
  onModeChange?: (mode: PreviewMode) => void;
  instruction?: string;
  passage?: string;
  mediaUrl?: string;
  title?: string;
  examType?: string;
  sectionTitle?: string;
  durationMinutes?: number;
  candidateName?: string;
  candidateId?: string;
  candidateEmail?: string;
  submittedAt?: string | null;
  standalone?: boolean;
  showToolbar?: boolean;
  headerExtras?: ReactNode;
  reviewStatuses?: HsaReviewStatus[];
  resultMode?: boolean;
};

export default function LearnerExamPreview({
  parsed,
  parsedQuestions,
  previewItems,
  solution = "",
  answers,
  candidateAnswers,
  correctAnswers,
  answer,
  mode = "exam",
  onModeChange,
  instruction = "",
  passage = "",
  mediaUrl = "",
  title = "Bản xem trước",
  examType = "TSA",
  sectionTitle = "Xem trước theo học viên",
  durationMinutes = 60,
  candidateName = "Học viên",
  candidateId = "",
  candidateEmail = "",
  submittedAt = null,
  standalone = false,
  showToolbar = true,
  headerExtras = null,
  reviewStatuses = [],
  resultMode = false,
}: LearnerExamPreviewProps) {
  const items: PreviewItem[] = previewItems?.length ? previewItems : (parsedQuestions?.length ? parsedQuestions.map(item => ({ parsed: item })) : parsed ? [{ parsed, instruction, passage, mediaUrl }] : []);
  const sourceQuestions = items.map(toSourceQuestion);
  const parsedAnswers = items.map((item, index) => correctAnswers?.[index] ?? answers?.[index] ?? (index === 0 ? answer : undefined) ?? item.parsed.correctAnswer);
  const displayedAnswers = resultMode
    ? items.map((item, index) => candidateAnswers?.[index] ?? item.answer as AnswerValue | undefined)
    : parsedAnswers;
  const answerSourceMap = Object.fromEntries(sourceQuestions.map((question, index) => [question.id, mode === "answer" ? formatLatexAnswerForDisplay(displayedAnswers[index]) : displayedAnswers[index]]));
  const correctAnswerSourceMap = Object.fromEntries(sourceQuestions.map((question, index) => [question.id, formatLatexAnswerForDisplay(parsedAnswers[index])]));
  const partData = buildRendererPartData(title, durationMinutes, sourceQuestions);
  const initialAnswers = mode === "answer" ? convertAnswersForRenderer(sourceQuestions, answerSourceMap) : {};
  const rendererCorrectAnswers = convertAnswersForRenderer(sourceQuestions, correctAnswerSourceMap);
  const detectedCommands = Array.from(new Set(items.flatMap((item) => item.parsed.detectedCommands)));
  const solutionItems = items.map((item, index) => item.parsed.solution.trim() || (index === 0 ? solution.trim() : ""));
  const hsaSolutionItems = solutionItems.map((item, index) => {
    if (item) return item;
    const correctAnswer = formatLatexAnswerForDisplay(parsedAnswers[index]);
    const label = Array.isArray(correctAnswer) ? correctAnswer.join(", ") : String(correctAnswer ?? "").trim();
    return `Đáp án đúng: ${label || "—"}.`;
  });
  const isHsaPreview = examType.trim().toUpperCase() === "HSA";
  const PreviewExamRenderer = isHsaPreview ? RemixStudyEduHsaExam : RemixStudyEduMathExam;
  const previewClass = `learner-exam-preview ${mode === "answer" ? "answer-mode" : "exam-mode"} ${standalone ? "standalone" : ""}`;
  // Live preview polls the saved source periodically. Keep the renderer mounted
  // when only question text/answers change so a poll cannot reset an active
  // scroll position. Remount only when the question layout itself changes.
  const rendererStructureIdentity = `${examType}:${mode}:${JSON.stringify(partData.questions.map(question => ({
    id: question.id,
    type: question.type,
    groupId: question._groupId ?? null,
  })))}`;
  const previewRootRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef({ passage: 0, questions: 0 });

  usePreviewLayoutEffect(() => {
    const root = previewRootRef.current;
    if (!root) return undefined;
    const passagePane = root.querySelector<HTMLElement>(".group-passage");
    const questionPane = root.querySelector<HTMLElement>(".grouped-questions");
    if (passagePane) passagePane.scrollTop = previewScrollRef.current.passage;
    if (questionPane) questionPane.scrollTop = previewScrollRef.current.questions;
    const rememberScroll = () => {
      if (passagePane) previewScrollRef.current.passage = passagePane.scrollTop;
      if (questionPane) previewScrollRef.current.questions = questionPane.scrollTop;
    };
    passagePane?.addEventListener("scroll", rememberScroll, { passive: true });
    questionPane?.addEventListener("scroll", rememberScroll, { passive: true });
    rememberScroll();
    return () => {
      rememberScroll();
      passagePane?.removeEventListener("scroll", rememberScroll);
      questionPane?.removeEventListener("scroll", rememberScroll);
    };
  }, [rendererStructureIdentity]);

  return <div ref={previewRootRef} className={previewClass} aria-label="Bản xem trước giao diện thi thử">
    {showToolbar && <div className="learner-preview-toolbar">
      <span>XEM TRƯỚC THEO HỌC VIÊN</span>
      <div className="learner-preview-mode-switch" role="tablist" aria-label="Chọn bản xem trước">
        <button type="button" role="tab" aria-selected={mode === "exam"} className={mode === "exam" ? "active" : ""} onClick={() => onModeChange?.("exam")}>Giao diện bài làm</button>
        <button type="button" role="tab" aria-selected={mode === "answer"} className={mode === "answer" ? "active" : ""} onClick={() => onModeChange?.("answer")}>Giao diện đáp án</button>
      </div>
      <b>{items.length > 1 ? `${items.length} câu` : items.length === 1 ? questionTypeLabel(items[0].parsed.questionType) : "Chưa có câu hỏi"}</b>
      <div>{detectedCommands.map((command) => <code key={command}>{command}</code>)}</div>
    </div>}
    <PreviewExamRenderer
      key={rendererStructureIdentity}
      part={{ id: isHsaPreview ? "hsa" : "math", label: sectionTitle }}
      partData={partData}
      initialState={{ currentIndex: 0, answers: initialAnswers, marked: [], visited: [], remainingSeconds: 3600, questionSeconds: 0 }}
      freezeTimer
      readOnly
      allowBookmarkInReadOnly
      examTitle={title}
      sectionTitle={sectionTitle}
      candidateName={candidateName}
      candidateId={candidateId}
      candidateEmail={candidateEmail}
      submittedAt={submittedAt}
      logoSrc={isHsaPreview ? "/logo_hsa.svg" : undefined}
      headerExtras={headerExtras}
      previewMode={isHsaPreview}
      answerPreview={mode === "answer"}
      resultMode={resultMode}
      reviewStatuses={mode === "answer" ? reviewStatuses : undefined}
      correctAnswers={rendererCorrectAnswers}
      solutions={isHsaPreview && mode === "answer" ? hsaSolutionItems : solutionItems}
      onProgress={() => undefined}
      onSubmit={() => undefined}
    />
  </div>;
}

export type { AnswerValue, HsaReviewStatus, PreviewItem };
export { answerText };
