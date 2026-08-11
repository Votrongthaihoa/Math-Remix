"use client";

import { useCallback, type ComponentType, type ReactNode } from "react";
import { alphabeticLabel, normalizeLatexContent, parseLatexQuestion, type LatexMatchingData } from "../../lib/exam-latex";
import MathExam from "./MathExam.jsx";
import HsaExamRenderer from "./HsaExamRenderer.jsx";

const RemixStudyEduMathExam = MathExam as unknown as ComponentType<Record<string, unknown>>;
const RemixStudyEduHsaExam = HsaExamRenderer as unknown as ComponentType<Record<string, unknown>>;

type SourceOption = string | { id?: string; value?: string; label?: string; text?: string; order?: number };
export type SourceQuestion = {
  id: string;
  prompt: string;
  question_type: "single" | "multiple" | "text" | "inline" | "true_false" | "ordering" | "drag_drop";
  options: SourceOption[];
  option_columns?: number;
  passage?: string | null;
  media_url?: string | null;
  latex_source?: string | null;
  instruction?: string | null;
  matching?: LatexMatchingData;
  option_order?: string[];
  section_id?: string;
  _loading?: boolean;
  _loadError?: string;
  /** Internal boundary marker: text fields have already passed the LaTeX normalizer. */
  _normalized?: boolean;
};
type RendererQuestion = {
  id: string;
  content: string;
  type: "single_choice" | "multiple_choice" | "fill_in_blank" | "true_false" | "ordering" | "matching" | "drag_and_drop";
  option_columns: number;
  data_questions: {
    answers?: Array<{ content: string }>;
    items?: Array<unknown>;
    left_items?: Array<{ value?: string; content?: string }>;
    right_items?: Array<{ value?: string; content?: string }>;
  };
  _groupId?: string;
  _groupContent?: string;
  _loading?: boolean;
  _loadError?: string;
};
type SourceAnswers = Record<string, unknown>;
type RendererPartData = { title: string; time: number; questions: RendererQuestion[] };

function optionValue(option: SourceOption, index: number) {
  if (typeof option === "string") return String.fromCharCode(65 + index);
  return String(option.value ?? option.id ?? String.fromCharCode(65 + index));
}

function optionLabel(option: SourceOption, index: number) {
  if (typeof option === "string") return option.trim();
  return String(option.label ?? option.text ?? option.value ?? `Phương án ${index + 1}`).trim();
}

function parsedOptionValue(option: { value?: string }, index: number) {
  return String(option.value ?? String.fromCharCode(65 + index));
}

function orderParsedOptions(options: Array<{ value: string; label: string; correct?: boolean; order?: number }>, order?: string[]) {
  if (!order?.length) return options;
  const used = new Set<number>();
  const ordered = order.flatMap(value => {
    const directIndex = options.findIndex((option, index) => !used.has(index) && parsedOptionValue(option, index) === value);
    const letterIndex = directIndex < 0 && /^[A-Z]$/.test(value) ? value.charCodeAt(0) - 65 : -1;
    const index = directIndex >= 0 ? directIndex : letterIndex >= 0 && letterIndex < options.length && !used.has(letterIndex) ? letterIndex : -1;
    if (index < 0 || used.has(index)) return [];
    used.add(index);
    return [options[index]];
  });
  return [...ordered, ...options.filter((_, index) => !used.has(index))];
}

function normalizeOptionalLatex(value: string | null | undefined) {
  if (!value?.trim()) return null;
  return normalizeLatexContent(value).trim();
}

function normalizeMatching(matching: LatexMatchingData | undefined) {
  if (!matching) return undefined;
  return {
    leftItems: matching.leftItems.map((item, index) => ({
      value: item.value || String(index + 1),
      label: normalizeLatexContent(String(item.label ?? "")).trim(),
    })),
    rightItems: matching.rightItems.map((item, index) => ({
      value: item.value || alphabeticLabel(index, true),
      label: normalizeLatexContent(String(item.label ?? "")).trim(),
      matchIndex: item.matchIndex,
    })),
  } satisfies LatexMatchingData;
}

function normalizeSourceQuestion(question: SourceQuestion): SourceQuestion {
  if (question._loading) return question;
  if (question._normalized) return question;
  let sourceProjection: ReturnType<typeof parseLatexQuestion> | null = null;
  if (question.latex_source?.trim()) {
    try {
      const parsed = parseLatexQuestion(question.latex_source);
      if (parsed.prompt.trim() || parsed.options.length) sourceProjection = parsed;
    } catch {
      sourceProjection = null;
    }
  }
  const parsedOptions = sourceProjection?.options.length
    ? orderParsedOptions(sourceProjection.options, question.option_order).map((option, index) => ({
      value: option.value || String.fromCharCode(65 + index),
      label: option.label,
      order: option.order,
    }))
    : question.options;
  const sourceOptions = parsedOptions;
  const matching = normalizeMatching(sourceProjection?.matching ?? question.matching);
  const questionType = matching || question.question_type === "ordering"
    ? "ordering"
    : sourceProjection?.questionType ?? question.question_type;
  return {
    ...question,
    prompt: normalizeLatexContent(sourceProjection?.prompt?.trim() || question.prompt).trim(),
    question_type: questionType,
    option_columns: sourceProjection?.optionColumns ?? question.option_columns,
    matching,
    option_order: question.option_order,
    options: (sourceOptions ?? []).map((option, index) => {
      if (typeof option === "string") return normalizeLatexContent(option).trim();
      const label = option.label ?? ("text" in option ? option.text : undefined) ?? option.value ?? `Phương án ${index + 1}`;
      return { ...option, label: normalizeLatexContent(String(label)).trim() };
    }),
    passage: normalizeOptionalLatex(question.passage),
    instruction: normalizeOptionalLatex(question.instruction),
    _normalized: true,
  };
}

function blankCount(content: string) {
  return Math.max(1, (content.match(/_{3,}/g) ?? []).length);
}

function ensureTextBlank(content: string) {
  const normalized = content.replace(/_{3,}/g, "____");
  return /____/.test(normalized) ? normalized : `${normalized.trimEnd()}\n____`;
}

function composeContent(question: SourceQuestion) {
  const parts = [question.instruction, question.passage, question.prompt]
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim());
  const hasEmbeddedImage = parts.some((part) => /\$\/image_\{[^}]+\}_\{[^}]*\}_\{[^}]*\}_\{[^}]*\}\$/.test(part));
  if (question.media_url?.trim() && !hasEmbeddedImage) parts.push(`$/image_{${question.media_url.trim()}}_{center}_{65}_{block}$`);
  return parts.join("\n\n");
}

function toRendererQuestion(question: SourceQuestion): RendererQuestion {
  if (question._loading) return {
    id: question.id,
    content: "",
    type: "fill_in_blank",
    option_columns: 1,
    data_questions: { answers: [] },
    _loading: true,
    _loadError: question._loadError,
  };
  const options = (question.options ?? []).map((option, index) => ({ value: optionValue(option, index), content: optionLabel(option, index) }));
  const base = { id: question.id, content: composeContent(question), option_columns: Math.min(4, Math.max(1, Number(question.option_columns) || 1)) };
  switch (question.question_type) {
    case "single":
      return { ...base, type: "single_choice", data_questions: { answers: options.map(({ content }) => ({ content })) } };
    case "multiple":
      return { ...base, type: "multiple_choice", data_questions: { answers: options.map(({ content }) => ({ content })) } };
    case "true_false":
      return { ...base, type: "true_false", data_questions: { items: options.map(({ content }) => ({ content })) } };
    case "ordering":
      if (question.matching) {
        return {
          ...base,
          type: "matching",
          data_questions: {
            left_items: question.matching.leftItems.map((item, index) => ({ value: item.value || String(index + 1), content: item.label })),
            right_items: question.matching.rightItems.map((item, index) => ({ value: item.value || alphabeticLabel(index, true), content: item.label })),
          },
        };
      }
      return {
        ...base,
        type: "matching",
        data_questions: {
          left_items: [],
          right_items: [],
        },
      };
    case "drag_drop":
      return { ...base, type: "drag_and_drop", content: ensureTextBlank(base.content), data_questions: { items: options.map(({ content }) => content) } };
    case "text":
    case "inline":
      return { ...base, type: "fill_in_blank", content: ensureTextBlank(base.content), data_questions: { answers: [] } };
    default:
      return { ...base, type: "fill_in_blank", content: ensureTextBlank(base.content), data_questions: { answers: [] } };
  }
}

function toRendererValue(question: SourceQuestion, value: unknown) {
  const rendererQuestion = toRendererQuestion(question);
  const options = (question.options ?? []).map((option, index) => optionValue(option, index));
  if (value === undefined || value === null) return undefined;
  if (rendererQuestion.type === "single_choice") {
    const index = options.findIndex((option) => option === String(value));
    return index >= 0 ? index : Number.isInteger(value) ? value : undefined;
  }
  if (rendererQuestion.type === "multiple_choice") {
    return (Array.isArray(value) ? value : [value]).map((item) => {
      const index = options.findIndex((option) => option === String(item));
      return index >= 0 ? index : Number(item);
    }).filter((item) => Number.isInteger(item) && item >= 0);
  }
  if (rendererQuestion.type === "true_false") {
    return (Array.isArray(value) ? value : []).map((item) => item === true || String(item).toLowerCase() === "true");
  }
  if (rendererQuestion.type === "matching") {
    const matching = question.matching;
    if (matching) {
      const sourceValues = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
      return Array.from({ length: matching.leftItems.length }, (_, leftIndex) => {
        const raw = String(sourceValues[leftIndex] ?? "").trim();
        if (!raw) return -1;
        const rightNumber = Number(raw);
        if (Number.isInteger(rightNumber) && rightNumber >= 1 && rightNumber <= matching.rightItems.length) return rightNumber - 1;
        const rightIndex = matching.rightItems.findIndex((item, index) => item.value === raw || alphabeticLabel(index, true) === raw.toUpperCase());
        return rightIndex;
      });
    }
    return [];
  }
  if (rendererQuestion.type === "ordering") return (Array.isArray(value) ? value : []).map(String);
  if (rendererQuestion.type === "drag_and_drop") {
    return (Array.isArray(value) ? value : []).map((item) => {
      if (Number.isInteger(item)) return item;
      return options.findIndex((option) => option === String(item));
    });
  }
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function toSourceValue(question: SourceQuestion, value: unknown) {
  const rendererQuestion = toRendererQuestion(question);
  const options = (question.options ?? []).map((option, index) => optionValue(option, index));
  if (value === undefined || value === null) return undefined;
  if (rendererQuestion.type === "single_choice") return options[Number(value)] ?? String(value);
  if (rendererQuestion.type === "multiple_choice") return (Array.isArray(value) ? value : []).map((item) => options[Number(item)] ?? String(item));
  if (rendererQuestion.type === "true_false") return (Array.isArray(value) ? value : []).map((item) => item === true ? "true" : "false");
  if (rendererQuestion.type === "matching") {
    const matching = question.matching;
    if (matching) {
      return Array.from({ length: matching.leftItems.length }, (_, leftIndex) => {
        const raw = Array.isArray(value) ? value[leftIndex] : undefined;
        const rightIndex = Number(raw);
        if (Number.isInteger(rightIndex) && rightIndex >= 0 && rightIndex < matching.rightItems.length) return String(rightIndex + 1);
        return "";
      });
    }
    return [];
  }
  if (rendererQuestion.type === "ordering") return (Array.isArray(value) ? value : []).map(String);
  if (rendererQuestion.type === "drag_and_drop") return (Array.isArray(value) ? value : []).map((item) => options[Number(item)] ?? String(item));
  const values = (Array.isArray(value) ? value : [value]).map(String);
  return question.question_type === "text" && values.length === 1 ? values[0] : values;
}

export function buildRendererPartData(examTitle: string, durationMinutes: number, questions: SourceQuestion[]): RendererPartData {
  const rendererQuestions: RendererQuestion[] = [];
  // MathExam intentionally treats newlines as explicit visual breaks. Normalize
  // each raw source question once, then keep its intentional breaks intact.
  const normalizedQuestions = questions.map(normalizeSourceQuestion);
  let questionIndex = 0;
  while (questionIndex < normalizedQuestions.length) {
    const question = normalizedQuestions[questionIndex];
    const passage = question.passage?.trim() ?? "";
    const groupStart = questionIndex;
    if (passage) {
      questionIndex += 1;
      while (
        questionIndex < normalizedQuestions.length
        && normalizedQuestions[questionIndex].section_id === question.section_id
        && (normalizedQuestions[questionIndex].passage?.trim() ?? "") === passage
      ) questionIndex += 1;
    } else {
      questionIndex += 1;
    }
    const groupLength = questionIndex - groupStart;
    if (passage && groupLength > 0) {
      const groupId = `passage-${groupStart}`;
      normalizedQuestions.slice(groupStart, questionIndex).forEach((groupQuestion) => {
        const rendererQuestion = toRendererQuestion({ ...groupQuestion, passage: null });
        rendererQuestions.push({ ...rendererQuestion, _groupId: groupId, _groupContent: passage });
      });
    } else {
      normalizedQuestions.slice(groupStart, questionIndex).forEach((item) => rendererQuestions.push(toRendererQuestion(item)));
    }
  }
  return { title: examTitle, time: Math.max(1, durationMinutes || 60), questions: rendererQuestions };
}

export function convertAnswersForRenderer(questions: SourceQuestion[], answers: SourceAnswers | null | undefined) {
  return Object.fromEntries(questions.filter(question => !question._loading).map((question) => [question.id, toRendererValue(question, answers?.[question.id])]).filter(([, value]) => value !== undefined));
}

export function convertAnswersForApi(questions: SourceQuestion[], answers: SourceAnswers) {
  return Object.fromEntries(Object.entries(answers).map(([questionId, value]) => {
    const question = questions.find((item) => item.id === questionId);
    return [questionId, question ? toSourceValue(question, value) : value];
  }));
}

type RendererProgress = { answers: SourceAnswers; marked: string[]; visited: string[]; currentIndex: number; remainingSeconds: number; elapsedSeconds: number };
type RendererSubmission = RendererProgress & { partId?: string; answered: number; total: number; timedOut: boolean; submittedAt: string };

export default function RemixStudyEduExamRenderer({
  examTitle,
  examType,
  sectionTitle,
  durationMinutes,
  questions,
  initialAnswers,
  initialRemainingSeconds,
  initialQuestionSeconds = 0,
  initialIndex = 0,
  initialMarked = [],
  initialVisited = [],
  candidateName,
  candidateId,
  timed = true,
  onQuestionRequest,
  onProgress,
  onSubmit,
  navigationPolicy,
  headerExtras,
}: {
  examTitle: string;
  examType: string;
  sectionTitle?: string;
  durationMinutes: number;
  questions: SourceQuestion[];
  initialAnswers?: SourceAnswers | null;
  initialRemainingSeconds: number;
  initialQuestionSeconds?: number;
  initialIndex?: number;
  initialMarked?: string[];
  initialVisited?: string[];
  candidateName: string;
  candidateId: string;
  timed?: boolean;
  onQuestionRequest?: (index: number) => void;
  onProgress: (progress: RendererProgress) => void;
  onSubmit: (submission: RendererSubmission) => void | Promise<void>;
  navigationPolicy?: { allowSkip?: boolean; allowBacktrack?: boolean; requireAnswerBeforeNext?: boolean };
  headerExtras?: ReactNode;
}) {
  const partData = buildRendererPartData(examTitle, durationMinutes, questions);
  const part = { id: "math", label: sectionTitle || examType || "Phòng khảo thí" };
  const initialState = {
    currentIndex: Math.min(Math.max(0, initialIndex), Math.max(0, questions.length - 1)),
    answers: convertAnswersForRenderer(questions, initialAnswers),
    marked: initialMarked,
    visited: initialVisited,
    remainingSeconds: Math.max(0, initialRemainingSeconds),
    questionSeconds: Math.max(0, initialQuestionSeconds),
  };
  const handleProgress = useCallback((progress: RendererProgress & { answers: Record<string, unknown> }) => {
    onProgress({ ...progress, answers: convertAnswersForApi(questions, progress.answers) });
  }, [onProgress, questions]);
  const handleSubmit = useCallback((submission: RendererSubmission & { answers: Record<string, unknown> }) => {
    return onSubmit({ ...submission, answers: convertAnswersForApi(questions, submission.answers) });
  }, [onSubmit, questions]);
  const sharedProps = {
    part,
    partData,
    initialState,
    examTitle,
    candidateName,
    candidateId,
    headerExtras,
    navigationPolicy,
    freezeTimer: !timed,
    onQuestionRequest,
    onProgress: handleProgress,
    onSubmit: handleSubmit,
  };
  if (examType.trim().toUpperCase() === "HSA") {
    return <RemixStudyEduHsaExam {...sharedProps} sectionTitle={sectionTitle} examTitle={examTitle} logoSrc="/logo_hsa.svg" />;
  }
  return <RemixStudyEduMathExam {...sharedProps} />;
}

export { blankCount };
