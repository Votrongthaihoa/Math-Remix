import { matchingError, parseLatexDocument, type LatexQuestionType, type ParsedLatexQuestion } from "./exam-latex.ts";
import type { QuestionType } from "./exam-config.ts";
import { normalizeQuestionBankContent, validateQuestionBankContent } from "./question-bank.ts";
import katex from "katex";

export type LatexImportPreviewItem = {
  index: number;
  source: string;
  prompt: string;
  question_type: QuestionType;
  options: Array<{ value: string; label: string }>;
  correct_answer: string | string[] | null;
  explanation: string;
  solution_source: string;
  errors: string[];
};

export type LatexImportPreview = {
  items: LatexImportPreviewItem[];
  fileError: string;
};

const QUESTION_TYPES: Record<LatexQuestionType, QuestionType> = {
  single: "single",
  multiple: "multiple",
  text: "text",
  inline: "inline",
  true_false: "true_false",
  ordering: "ordering",
  drag_drop: "drag_drop",
};

function hasUnbalancedBraces(value: string) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\") {
      index += 1;
      continue;
    }
    if (value[index] === "{") depth += 1;
    if (value[index] === "}") {
      depth -= 1;
      if (depth < 0) return true;
    }
  }
  return depth !== 0;
}

function mathSyntaxError(value: string) {
  const delimiterMatches = value.match(/(?<!\\)\$/g) ?? [];
  if (delimiterMatches.length % 2 !== 0) return "Dấu $ trong công thức chưa được đóng.";
  const fragments = value.match(/(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$|(?<!\\)\$[^$\n]+?(?<!\\)\$/g) ?? [];
  for (const fragment of fragments) {
    const body = fragment.startsWith("$$") ? fragment.slice(2, -2) : fragment.slice(1, -1);
    if (hasUnbalancedBraces(body)) return "Công thức LaTeX có ngoặc nhọn chưa cân bằng.";
    if (/^\\?\/image(?:-row)?\b/.test(body.trim())) continue;
    try {
      katex.renderToString(body, { throwOnError: true, trust: false, strict: "ignore" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "cú pháp không hợp lệ";
      return `Lỗi KaTeX: ${message}`;
    }
  }
  return "";
}

function parsedItem(parsed: ParsedLatexQuestion, index: number): LatexImportPreviewItem {
  // The shared parser treats every \cham command as a short-answer marker.
  // In a Question Bank, multiple answer markers are an ordered inline item;
  // preserving that shape here keeps its answer key compatible with the
  // learner renderer without changing the existing exam-editor parser.
  const blanks = (parsed.prompt.match(/_{3,}/g) ?? []).length;
  const questionType = parsed.questionType === "text" && Array.isArray(parsed.correctAnswer) && blanks > 1
    ? "inline"
    : QUESTION_TYPES[parsed.questionType];
  const content = normalizeQuestionBankContent({
    prompt: parsed.prompt,
    question_type: questionType,
    options: parsed.options.map(option => ({ value: option.value, label: option.label })),
    correct_answer: parsed.correctAnswer || null,
    explanation: parsed.solution,
    solution_source: parsed.solution,
  });
  const semanticErrors = Object.values(validateQuestionBankContent(content).fieldErrors);
  const errors = [
    matchingError(parsed),
    mathSyntaxError(`${parsed.prompt}\n${parsed.solution}\n${parsed.options.map(option => option.label).join("\n")}`),
    ...semanticErrors,
  ].filter((error): error is string => Boolean(error));
  const correctAnswer = typeof content.correct_answer === "string"
    ? content.correct_answer
    : Array.isArray(content.correct_answer) && content.correct_answer.every((item): item is string => typeof item === "string")
      ? content.correct_answer
      : null;
  return {
    index,
    source: parsed.source,
    prompt: content.prompt,
    question_type: content.question_type,
    options: content.options,
    correct_answer: correctAnswer,
    explanation: content.explanation,
    solution_source: content.solution_source,
    errors,
  };
}

export function buildLatexQuestionPreview(source: string): LatexImportPreview {
  const input = source.trim();
  if (!input) return { items: [], fileError: "Tệp LaTeX đang trống." };
  try {
    const parsed = parseLatexDocument(input);
    if (!parsed.length) return { items: [], fileError: "Không tìm thấy câu hỏi trong môi trường \\begin{ex}...\\end{ex}." };
    return { items: parsed.map(parsedItem), fileError: "" };
  } catch (error) {
    return {
      items: [],
      fileError: error instanceof Error ? error.message : "Không thể phân tích tệp LaTeX.",
    };
  }
}
