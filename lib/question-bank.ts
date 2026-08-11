import type { QuestionType } from "./exam-config";

export const QUESTION_BANK_DIFFICULTIES = ["NB", "TH", "VD", "VDC"] as const;
export type QuestionBankDifficulty = typeof QUESTION_BANK_DIFFICULTIES[number];

export const QUESTION_BANK_NODE_TYPES = ["topic", "unit"] as const;
export type QuestionBankNodeType = typeof QUESTION_BANK_NODE_TYPES[number];

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
  const allowedTypes: QuestionType[] = ["single", "multiple", "text", "inline", "true_false", "ordering", "drag_drop"];
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
    question_type: allowedTypes.includes(questionType as QuestionType) ? questionType as QuestionType : "single" as QuestionType,
    options,
    correct_answer: raw.correct_answer ?? null,
    explanation: String(raw.explanation ?? "").trim().slice(0, 20_000),
    passage: String(raw.passage ?? "").trim().slice(0, 50_000) || null,
    media_url: String(raw.media_url ?? "").trim().slice(0, 2_000) || null,
    instruction: String(raw.instruction ?? "").trim().slice(0, 2_000) || null,
    solution_source: String(raw.solution_source ?? "").trim().slice(0, 50_000),
  };
}

export function selectCurrentVersions<T extends { item_id: string; version: number }>(
  items: Array<{ id: string; current_version: number }>,
  versions: T[],
) {
  const current = new Map(items.map(item => [item.id, item.current_version]));
  return versions.filter(version => current.get(version.item_id) === version.version);
}

