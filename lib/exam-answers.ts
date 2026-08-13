// Shared by the exam API (official scoring) and the result page (per-section
// breakdown) so a student never sees a section total that disagrees with the
// score the server recorded.

import { normalizeLatexForMatch } from "./exam-latex.ts";

/** A stored answer key can predate the LaTeX parser and be present but empty. */
export function hasAnswerValue<T>(value: T): value is Exclude<T, null | undefined> {
  if (Array.isArray(value)) return value.some(item => item !== null && item !== undefined && String(item).trim().length > 0);
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

export type AnswerCompletenessQuestion = {
  question_type: string;
  prompt?: string | null;
  options?: readonly unknown[] | null;
  _loading?: boolean;
};

/**
 * Shared answer-completeness contract for the source question model used by
 * the exam API and the authenticated/guest renderers. This does not score an
 * answer; it only decides whether navigation may treat it as fully answered.
 */
export function isExamAnswerComplete(question: AnswerCompletenessQuestion, value: unknown) {
  if (question._loading) return false;
  if (!Array.isArray(value)) return hasAnswerValue(value);
  if (!value.length || value.some(item => !hasAnswerValue(item))) return false;

  const optionCount = question.options?.length ?? 0;
  if (question.question_type === "true_false" || question.question_type === "ordering") {
    return optionCount > 0 && value.length >= optionCount;
  }
  if (question.question_type === "inline" || question.question_type === "drag_drop") {
    const blankCount = Math.max(1, (question.prompt?.match(/_{3,}/g) ?? []).length);
    return value.length >= blankCount;
  }
  return true;
}

function normalizeMathAnswer(value: string) {
  // LaTeX commonly protects a decimal comma as `0{,}36`, while students
  // naturally type `0,36` into the answer box. Treat both spellings equally.
  const decimalComma = value.replace(/\{\s*,\s*\}/g, ",");
  return /[\\$]/.test(decimalComma) ? normalizeLatexForMatch(decimalComma) : decimalComma;
}

export function normalizeAnswer(value: unknown, ordered = false) {
  if (Array.isArray(value)) {
    const items = value.map(item => normalizeMathAnswer(String(item).trim()));
    return ordered ? items : items.sort();
  }
  const item = String(value ?? "").trim();
  return normalizeMathAnswer(item).toLocaleLowerCase("vi");
}

export type ExamAnswerValue = string | string[];

export type AnswerKeySnapshotEntry = {
  correct_answer: unknown;
  explanation: string;
};

export type AnswerKeySnapshot = Record<string, AnswerKeySnapshotEntry>;

/**
 * Freeze the scoring inputs that were published with an attempt. This stays
 * server-side; callers must deliberately project it before returning an
 * attempt to a learner.
 */
export function buildAnswerKeySnapshot(rows: ReadonlyArray<{ question_id: string; correct_answer: unknown; explanation?: unknown }>): AnswerKeySnapshot {
  return Object.fromEntries(rows
    .filter(row => typeof row.question_id === "string" && row.question_id.length > 0)
    .map(row => [row.question_id, {
      correct_answer: row.correct_answer,
      explanation: typeof row.explanation === "string" ? row.explanation.slice(0, 20_000) : "",
    }]));
}

export function readAnswerKeySnapshot(value: unknown): Map<string, AnswerKeySnapshotEntry> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return new Map();
  return new Map(Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry && typeof entry === "object" && !Array.isArray(entry))
    .map(([questionId, entry]) => {
      const record = entry as Record<string, unknown>;
      return [questionId, {
        correct_answer: record.correct_answer,
        explanation: typeof record.explanation === "string" ? record.explanation : "",
      } satisfies AnswerKeySnapshotEntry];
    }));
}

const MAX_ANSWER_ENTRIES = 2_000;
const MAX_ANSWER_KEY_LENGTH = 128;
const MAX_ANSWER_TEXT_LENGTH = 2_000;
const MAX_ANSWER_ITEMS = 100;

/**
 * Keep answer payloads bounded before they are persisted. The browser only
 * produces strings and string arrays, so malformed values are ignored rather
 * than being serialized into a JSONB column. Empty strings are retained: an
 * explicit clear action should be able to overwrite a previous answer.
 */
export function normalizeAnswerMap(value: unknown): Record<string, ExamAnswerValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, ExamAnswerValue> = {};
  for (const [rawKey, answer] of Object.entries(value as Record<string, unknown>).slice(0, MAX_ANSWER_ENTRIES)) {
    const key = rawKey.trim();
    if (!key || key.length > MAX_ANSWER_KEY_LENGTH) continue;
    if (typeof answer === "string") {
      output[key] = answer.slice(0, MAX_ANSWER_TEXT_LENGTH);
      continue;
    }
    if (Array.isArray(answer)) {
      const items = answer
        .filter((item): item is string => typeof item === "string")
        .slice(0, MAX_ANSWER_ITEMS)
        .map(item => item.slice(0, MAX_ANSWER_TEXT_LENGTH));
      output[key] = items;
    }
  }
  return output;
}

export function answersMatch(answer: unknown, correct: unknown, ordered = false) {
  // An unanswered question must never be counted as correct, even when the
  // stored answer key is missing or empty.
  if (!hasAnswerValue(answer) || !hasAnswerValue(correct)) return false;
  const left = normalizeAnswer(answer, ordered);
  const right = normalizeAnswer(correct, ordered);
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => item === right[index]);
  return left === right;
}

export type ScoringQuestion = {
  id: string;
  question_type: string;
};

export type ExamScoringContext = {
  examType?: string | null;
  subjectCode?: string | null;
  subjectTitle?: string | null;
};

type ThptqgScoringGroup = "math" | "natural" | "social_technology" | "foreign_language";

const THPTQG_TRUE_FALSE_POINTS = [0, 0.1, 0.25, 0.5, 1] as const;

function normalizedSubject(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9]/g, "");
}

function thptqgScoringGroup(context: ExamScoringContext): ThptqgScoringGroup | null {
  if (String(context.examType ?? "").trim().toUpperCase() !== "THPTQG") return null;
  const subject = `${normalizedSubject(context.subjectCode)}${normalizedSubject(context.subjectTitle)}`;
  if (/(^|.*)toan/.test(subject)) return "math";
  if (/(vatly|vatli|hoahoc|sinhhoc|dialy|diali)/.test(subject)) return "natural";
  if (/(lichsu|gdktpl|giaoduckinhtevaphapluat|congnghe|tinhoc)/.test(subject)) return "social_technology";
  if (/(tieng(anh|trung|phap|nga|duc|nhat|han)|english|chinese|french|russian|german|japanese|korean)/.test(subject)) return "foreign_language";
  return null;
}

function matchingTrueFalseItems(answer: unknown, correct: unknown) {
  if (!Array.isArray(answer) || !Array.isArray(correct)) return 0;
  let matching = 0;
  for (let index = 0; index < Math.min(4, correct.length); index += 1) {
    if (answersMatch(answer[index], correct[index], true)) matching += 1;
  }
  return matching;
}

function thptqgQuestionPoints(question: ScoringQuestion, answer: unknown, correct: unknown, group: ThptqgScoringGroup) {
  if (question.question_type === "true_false") {
    return THPTQG_TRUE_FALSE_POINTS[matchingTrueFalseItems(answer, correct)] ?? 1;
  }
  if (!answersMatch(answer, correct, ["inline", "ordering", "drag_drop"].includes(question.question_type))) return 0;
  if (question.question_type === "single") return 0.25;
  if (question.question_type === "text" || question.question_type === "inline") {
    if (group === "math") return 0.5;
    if (group === "natural") return 0.25;
  }
  return 0;
}

function roundedThptqgScore(score: number) {
  return Math.min(10, Math.round((score + Number.EPSILON) * 100) / 100);
}

export type QuestionScoringOverride = {
  override_mode: "normal" | "accept_multiple" | "void_question" | "award_all";
  accepted_answers?: unknown;
};

/**
 * Keep server scoring identical for authenticated and guest attempts. The
 * answer key is deliberately passed in by the trusted server route; this
 * helper never loads or exposes answer keys itself.
 */
export function scoreExamQuestions(
  questions: readonly ScoringQuestion[],
  answers: Record<string, unknown>,
  answerKeys: ReadonlyMap<string, unknown>,
) {
  const correctAnswers = questions.reduce((count, question) => count + (
    answerKeys.has(question.id)
      && answersMatch(
        answers[question.id],
        answerKeys.get(question.id),
        ["inline", "true_false", "ordering", "drag_drop"].includes(question.question_type),
      )
      ? 1
      : 0
  ), 0);
  const totalQuestions = questions.length;
  return {
    correctAnswers,
    totalQuestions,
    score: totalQuestions ? Math.round(correctAnswers / totalQuestions * 100) : 0,
  };
}

/**
 * Apply the official 10-point THPTQG rubric only when both the exam type and
 * subject identify a supported THPTQG subject group. Other exam types (and
 * manually graded subjects such as Ngữ văn) keep the legacy percentage score.
 */
export function scoreExamQuestionsForContext(
  questions: readonly ScoringQuestion[],
  answers: Record<string, unknown>,
  answerKeys: ReadonlyMap<string, unknown>,
  context: ExamScoringContext,
) {
  const group = thptqgScoringGroup(context);
  if (!group) return scoreExamQuestions(questions, answers, answerKeys);
  let correctAnswers = 0;
  let score = 0;
  for (const question of questions) {
    if (!answerKeys.has(question.id)) continue;
    const correct = answerKeys.get(question.id);
    const ordered = ["inline", "true_false", "ordering", "drag_drop"].includes(question.question_type);
    if (answersMatch(answers[question.id], correct, ordered)) correctAnswers += 1;
    score += thptqgQuestionPoints(question, answers[question.id], correct, group);
  }
  return {
    correctAnswers,
    totalQuestions: questions.length,
    score: roundedThptqgScore(score),
  };
}

export function scoreExamQuestionsWithOverrides(
  questions: readonly ScoringQuestion[],
  answers: Record<string, unknown>,
  answerKeys: ReadonlyMap<string, unknown>,
  overrides: ReadonlyMap<string, QuestionScoringOverride>,
) {
  let correctAnswers = 0;
  let totalQuestions = 0;
  let voidedQuestions = 0;
  for (const question of questions) {
    const override = overrides.get(question.id);
    if (override?.override_mode === "void_question") {
      voidedQuestions += 1;
      continue;
    }
    totalQuestions += 1;
    const ordered = ["inline", "true_false", "ordering", "drag_drop"].includes(question.question_type);
    const isCorrect = override?.override_mode === "award_all"
      ? true
      : override?.override_mode === "accept_multiple"
        ? (Array.isArray(override.accepted_answers) ? override.accepted_answers : []).some(candidate => answersMatch(answers[question.id], candidate, ordered))
        : answersMatch(answers[question.id], answerKeys.get(question.id), ordered);
    if (isCorrect) correctAnswers += 1;
  }
  return {
    correctAnswers,
    totalQuestions,
    voidedQuestions,
    score: totalQuestions ? Math.round(correctAnswers / totalQuestions * 100) : 0,
  };
}


export function scoreExamQuestionsWithOverridesForContext(
  questions: readonly ScoringQuestion[],
  answers: Record<string, unknown>,
  answerKeys: ReadonlyMap<string, unknown>,
  overrides: ReadonlyMap<string, QuestionScoringOverride>,
  context: ExamScoringContext,
) {
  const group = thptqgScoringGroup(context);
  if (!group) return scoreExamQuestionsWithOverrides(questions, answers, answerKeys, overrides);
  let correctAnswers = 0;
  let totalQuestions = 0;
  let voidedQuestions = 0;
  let score = 0;
  for (const question of questions) {
    const override = overrides.get(question.id);
    if (override?.override_mode === "void_question") {
      voidedQuestions += 1;
      continue;
    }
    totalQuestions += 1;
    const ordered = ["inline", "true_false", "ordering", "drag_drop"].includes(question.question_type);
    const accepted = Array.isArray(override?.accepted_answers) ? override.accepted_answers : [];
    const candidates = override?.override_mode === "accept_multiple" ? accepted : [answerKeys.get(question.id)];
    const fullCredit = override?.override_mode === "award_all"
      || candidates.some(candidate => answersMatch(answers[question.id], candidate, ordered));
    if (fullCredit) correctAnswers += 1;
    if (override?.override_mode === "award_all") {
      const syntheticCorrect = question.question_type === "true_false" ? ["true", "true", "true", "true"] : "correct";
      const syntheticAnswer = syntheticCorrect;
      score += thptqgQuestionPoints(question, syntheticAnswer, syntheticCorrect, group);
    } else if (override?.override_mode === "accept_multiple") {
      score += Math.max(0, ...candidates.map(candidate => thptqgQuestionPoints(question, answers[question.id], candidate, group)));
    } else if (answerKeys.has(question.id)) {
      score += thptqgQuestionPoints(question, answers[question.id], answerKeys.get(question.id), group);
    }
  }
  return {
    correctAnswers,
    totalQuestions,
    voidedQuestions,
    score: roundedThptqgScore(score),
  };
}
