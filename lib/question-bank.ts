import type { QuestionType } from "./exam-config";

export const QUESTION_BANK_DIFFICULTIES = ["NB", "TH", "VD", "VDC"] as const;
export type QuestionBankDifficulty = typeof QUESTION_BANK_DIFFICULTIES[number];

export const QUESTION_BANK_NODE_TYPES = ["topic", "unit"] as const;
export type QuestionBankNodeType = typeof QUESTION_BANK_NODE_TYPES[number];

export const QUESTION_BANK_QUESTION_TYPES = ["single", "multiple", "text", "inline", "true_false", "ordering", "drag_drop"] as const satisfies readonly QuestionType[];

export function isQuestionBankQuestionType(value: unknown): value is QuestionType {
  return typeof value === "string" && QUESTION_BANK_QUESTION_TYPES.includes(value as QuestionType);
}

export type QuestionBank = {
  id: string;
  name: string;
  subject_code: string;
  grade: string;
  curriculum: string;
  description: string;
  status: "draft" | "active" | "archived";
  created_at: string;
  updated_at: string;
};

export type QuestionBankNode = {
  id: string;
  bank_id: string;
  parent_id: string | null;
  title: string;
  node_type: QuestionBankNodeType;
  sort_order: number;
};

export type QuestionBankItem = {
  id: string;
  bank_id: string;
  node_id: string | null;
  current_version: number;
  difficulty: QuestionBankDifficulty | null;
  tags: string[];
  status: "draft" | "active" | "archived";
  prompt: string;
  question_type: QuestionType;
  options: Array<{ value: string; label: string }>;
  correct_answer: unknown;
  explanation: string;
  passage: string | null;
  media_url: string | null;
  instruction: string | null;
  solution_source: string;
  created_at: string;
  updated_at: string;
};

export type QuestionBankSourceExam = {
  id: string;
  title: string;
  exam_type: string;
  published?: boolean;
};

export type QuestionBankSourceSection = {
  id: string;
  exam_id: string;
  title: string;
  sort_order: number;
};

export function normalizeDifficulty(value: unknown): QuestionBankDifficulty | null {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return QUESTION_BANK_DIFFICULTIES.includes(normalized as QuestionBankDifficulty)
    ? normalized as QuestionBankDifficulty
    : null;
}

export function normalizeTags(value: unknown, maxItems = 20): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return Array.from(new Set(values
    .filter(item => typeof item === "string")
    .map(item => item.trim().slice(0, 60))
    .filter(Boolean))).slice(0, maxItems);
}

export function normalizeQuestionBankContent(value: unknown) {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const questionType = typeof raw.question_type === "string" ? raw.question_type : "single";
  const options = Array.isArray(raw.options)
    ? raw.options.slice(0, 20).map((option, index) => {
      const item = option && typeof option === "object" && !Array.isArray(option) ? option as Record<string, unknown> : {};
      return {
        value: String(item.value ?? String.fromCharCode(65 + index)).trim().slice(0, 20),
        label: String(item.label ?? "").trim().slice(0, 10_000),
      };
    })
    : [];
  return {
    prompt: String(raw.prompt ?? "").trim().slice(0, 50_000),
    question_type: isQuestionBankQuestionType(questionType) ? questionType : "single" as QuestionType,
    options,
    correct_answer: raw.correct_answer ?? null,
    explanation: String(raw.explanation ?? "").trim().slice(0, 20_000),
    passage: String(raw.passage ?? "").trim().slice(0, 50_000) || null,
    media_url: String(raw.media_url ?? "").trim().slice(0, 2_000) || null,
    instruction: String(raw.instruction ?? "").trim().slice(0, 2_000) || null,
    solution_source: String(raw.solution_source ?? "").trim().slice(0, 50_000),
  };
}

export type QuestionBankContentField = "questionType" | "prompt" | "options" | "correctAnswer" | "mediaUrl";
export type QuestionBankContentFieldErrors = Partial<Record<QuestionBankContentField, string>>;
export type QuestionBankContentValidation = {
  valid: boolean;
  fieldErrors: QuestionBankContentFieldErrors;
};

type NormalizedQuestionBankContent = ReturnType<typeof normalizeQuestionBankContent>;

function totalBlankCount(content: Pick<NormalizedQuestionBankContent, "prompt" | "passage" | "instruction">) {
  return [content.instruction, content.passage, content.prompt]
    .map(value => value ?? "")
    .reduce((count, value) => count + (value.match(/_{3,}/g) ?? []).length, 0);
}

/**
 * Inline and drag/drop inputs are rendered from the prompt only. A blank in a
 * passage or instruction is descriptive text, not an answerable learner slot.
 */
function promptBlankCount(content: Pick<NormalizedQuestionBankContent, "prompt">) {
  return (content.prompt.match(/_{3,}/g) ?? []).length;
}

function stringAnswers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim());
}

function hasOnlyNonEmptyStrings(value: unknown) {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "string" && item.trim().length > 0);
}

function optionValues(content: NormalizedQuestionBankContent, fieldErrors: QuestionBankContentFieldErrors, minimum: number) {
  if (content.options.length < minimum) {
    fieldErrors.options = minimum === 1
      ? "Nhập ít nhất một phương án có mã và nội dung."
      : `Nhập ít nhất ${minimum} phương án có mã và nội dung.`;
    return null;
  }

  const values = content.options.map(option => option.value.trim());
  if (values.some(value => !value) || content.options.some(option => !option.label.trim())) {
    fieldErrors.options = "Mỗi phương án cần có cả mã và nội dung.";
    return null;
  }
  if (new Set(values.map(value => value.toLocaleLowerCase("vi"))).size !== values.length) {
    fieldErrors.options = "Mã phương án không được trùng nhau.";
    return null;
  }
  return new Set(values);
}

function answerMatchesOptions(answers: string[], values: Set<string> | null) {
  return values !== null && answers.every(answer => values.has(answer));
}

/**
 * Learner-facing media is deliberately limited to ordinary web URLs or a
 * same-origin root-relative path. It avoids accepting executable/data URLs
 * after the authoring form opts into custom validation with noValidate.
 */
export function isAllowedQuestionBankMediaUrl(value: string | null) {
  if (!value) return true;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    try {
      const resolved = new URL(value, "https://question-bank.invalid");
      return resolved.origin === "https://question-bank.invalid";
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Validates the content contract that every Question Bank item must satisfy
 * before it can be persisted or copied into a learner-facing exam. This is
 * deliberately independent from Supabase so all write paths can use it.
 */
export function validateQuestionBankContent(value: unknown): QuestionBankContentValidation {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const content = normalizeQuestionBankContent(raw);
  const fieldErrors: QuestionBankContentFieldErrors = {};

  if (!content.prompt) fieldErrors.prompt = "Nhập nội dung câu hỏi trước khi lưu.";
  if (!isAllowedQuestionBankMediaUrl(content.media_url)) {
    fieldErrors.mediaUrl = "Dùng URL hình ảnh http(s) hợp lệ hoặc đường dẫn bắt đầu bằng /.";
  }

  if (!isQuestionBankQuestionType(raw.question_type)) {
    fieldErrors.questionType = "Chọn một dạng câu hỏi được hỗ trợ.";
    return { valid: false, fieldErrors };
  }

  if (content.question_type === "ordering") {
    fieldErrors.questionType = "Dạng ghép nối chưa được Ngân hàng câu hỏi lưu đủ dữ liệu cặp ghép. Hãy biên soạn trực tiếp trong Trình soạn đề.";
    return { valid: false, fieldErrors };
  }

  if (content.question_type === "single") {
    const values = optionValues(content, fieldErrors, 2);
    if (typeof content.correct_answer !== "string" || !content.correct_answer.trim() || !answerMatchesOptions([content.correct_answer.trim()], values)) {
      fieldErrors.correctAnswer = "Chọn đúng một mã đáp án có trong danh sách phương án.";
    }
  }

  if (content.question_type === "multiple") {
    const values = optionValues(content, fieldErrors, 2);
    const answers = stringAnswers(content.correct_answer);
    if (!Array.isArray(content.correct_answer) || answers.length < 2 || new Set(answers).size !== answers.length || !answerMatchesOptions(answers, values)) {
      fieldErrors.correctAnswer = "Chọn ít nhất hai mã đáp án khác nhau có trong danh sách phương án.";
    }
  }

  if (content.question_type === "text") {
    const hasAnswer = typeof content.correct_answer === "string" && content.correct_answer.trim().length > 0;
    if (!hasAnswer) fieldErrors.correctAnswer = "Nhập một đáp án ngắn cho câu hỏi này.";
    if (totalBlankCount(content) > 1) {
      fieldErrors.prompt = "Câu trả lời ngắn chỉ hỗ trợ một ô trống. Dùng dạng “Nhiều ô trống trong câu” khi cần nhiều đáp án theo thứ tự.";
    }
  }

  if (content.question_type === "inline") {
    const blanks = promptBlankCount(content);
    const answers = stringAnswers(content.correct_answer);
    if (!blanks) fieldErrors.prompt = "Dùng ít nhất một chuỗi gạch dưới (ví dụ: ____) để tạo ô trống.";
    if (!hasOnlyNonEmptyStrings(content.correct_answer) || answers.length !== blanks) {
      fieldErrors.correctAnswer = "Nhập một đáp án không rỗng cho từng ô trống, theo đúng thứ tự.";
    }
  }

  if (content.question_type === "true_false") {
    const values = optionValues(content, fieldErrors, 2);
    const answers = stringAnswers(content.correct_answer);
    if (!hasOnlyNonEmptyStrings(content.correct_answer) || answers.length !== content.options.length || answers.some(answer => answer !== "true" && answer !== "false") || !values) {
      fieldErrors.correctAnswer = "Nhập true hoặc false cho từng phát biểu, theo đúng thứ tự.";
    }
  }

  if (content.question_type === "drag_drop") {
    const blanks = promptBlankCount(content);
    const values = optionValues(content, fieldErrors, Math.max(1, blanks));
    const answers = stringAnswers(content.correct_answer);
    if (!blanks) fieldErrors.prompt = "Dùng ít nhất một chuỗi gạch dưới (ví dụ: ____) để tạo vị trí thả.";
    if (!hasOnlyNonEmptyStrings(content.correct_answer) || answers.length !== blanks || new Set(answers).size !== answers.length || !answerMatchesOptions(answers, values)) {
      fieldErrors.correctAnswer = "Chọn một mã phương án khác nhau cho từng vị trí thả, theo đúng thứ tự.";
    }
  }

  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors };
}

export function selectCurrentVersions<T extends { item_id: string; version: number }>(
  items: Array<{ id: string; current_version: number }>,
  versions: T[],
) {
  const current = new Map(items.map(item => [item.id, item.current_version]));
  return versions.filter(version => current.get(version.item_id) === version.version);
}
