export type HsaQuestionLike = {
  id: string;
  _groupId?: string;
  _groupContent?: string;
};

export type HsaQuestionGroup<T extends HsaQuestionLike> = {
  id: string;
  content: string;
  questions: T[];
};

/** The subject codes used by the HSA Part 3 source markers. */
export type HsaSubjectCode = "vatly" | "hoahoc" | "sinhhoc" | "lichsu" | "dialy" | "tienganh";

export type HsaCombinationMode = "science" | "english";

export type HsaCombination = {
  code: string;
  label: string;
  shortLabel: string;
  mode: HsaCombinationMode;
  subjects: HsaSubjectCode[];
};

export const HSA_PART3_SUBJECTS: ReadonlyArray<{ code: HsaSubjectCode; title: string; shortTitle: string }> = [
  { code: "vatly", title: "Vật lí", shortTitle: "Lí" },
  { code: "hoahoc", title: "Hóa học", shortTitle: "Hóa" },
  { code: "sinhhoc", title: "Sinh học", shortTitle: "Sinh" },
  { code: "lichsu", title: "Lịch sử", shortTitle: "Sử" },
  { code: "dialy", title: "Địa lí", shortTitle: "Địa" },
  { code: "tienganh", title: "Tiếng Anh", shortTitle: "Anh" },
] as const;

/**
 * Official-style HSA Part 3 codes observed in the test room. Q01–Q10 are
 * three-subject science combinations; Q21 is the English alternative.
 * Keeping this catalog in one place lets the authoring UI, runner and server
 * agree on the same code without duplicating a fragile subject mapping.
 */
export const HSA_COMBINATIONS: readonly HsaCombination[] = [
  { code: "Q01", label: "Vật lí – Hóa học – Sinh học", shortLabel: "Lý – Hóa – Sinh", mode: "science", subjects: ["vatly", "hoahoc", "sinhhoc"] },
  { code: "Q02", label: "Vật lí – Hóa học – Lịch sử", shortLabel: "Lý – Hóa – Sử", mode: "science", subjects: ["vatly", "hoahoc", "lichsu"] },
  { code: "Q03", label: "Vật lí – Hóa học – Địa lí", shortLabel: "Lý – Hóa – Địa", mode: "science", subjects: ["vatly", "hoahoc", "dialy"] },
  { code: "Q04", label: "Vật lí – Sinh học – Lịch sử", shortLabel: "Lý – Sinh – Sử", mode: "science", subjects: ["vatly", "sinhhoc", "lichsu"] },
  { code: "Q05", label: "Vật lí – Sinh học – Địa lí", shortLabel: "Lý – Sinh – Địa", mode: "science", subjects: ["vatly", "sinhhoc", "dialy"] },
  { code: "Q06", label: "Hóa học – Sinh học – Lịch sử", shortLabel: "Hóa – Sinh – Sử", mode: "science", subjects: ["hoahoc", "sinhhoc", "lichsu"] },
  { code: "Q07", label: "Hóa học – Sinh học – Địa lí", shortLabel: "Hóa – Sinh – Địa", mode: "science", subjects: ["hoahoc", "sinhhoc", "dialy"] },
  { code: "Q08", label: "Vật lí – Lịch sử – Địa lí", shortLabel: "Lý – Sử – Địa", mode: "science", subjects: ["vatly", "lichsu", "dialy"] },
  { code: "Q09", label: "Hóa học – Lịch sử – Địa lí", shortLabel: "Hóa – Sử – Địa", mode: "science", subjects: ["hoahoc", "lichsu", "dialy"] },
  { code: "Q10", label: "Sinh học – Lịch sử – Địa lí", shortLabel: "Sinh – Sử – Địa", mode: "science", subjects: ["sinhhoc", "lichsu", "dialy"] },
  { code: "Q21", label: "Tiếng Anh", shortLabel: "Tiếng Anh", mode: "english", subjects: ["tienganh"] },
] as const;

export const DEFAULT_HSA_COMBINATION_CODE = "Q01";
/** Reserved answer-map field used to resume/review the selected Part 3 set. */
export const HSA_SELECTION_ANSWER_KEY = "__hsa_selection_code";
/** Reserved answer-map field used while Parts 1 and 2 are complete but Part 3 has not started. */
export const HSA_PART3_SELECTION_PENDING_KEY = "__hsa_part3_selection_pending";

export function getHsaCombination(value: unknown): HsaCombination | null {
  const code = String(value ?? "").trim().toUpperCase();
  return HSA_COMBINATIONS.find(combination => combination.code === code) ?? null;
}

export function resolveHsaCombination(value: unknown): HsaCombination {
  return getHsaCombination(value) ?? HSA_COMBINATIONS[0];
}

/**
 * Describe the database reads needed after the candidate has committed to an
 * HSA combination. Parts 1 and 2 are shared; Part 3 is read only for the
 * selected subject banks. Keeping this pure makes the API query boundary easy
 * to verify without coupling it to a Supabase client.
 */
export function buildHsaQuestionLoadPlan(
  sections: Array<{ id: string; sort_order?: number | null }>,
  combination: HsaCombination | null,
) {
  const selected = combination ?? HSA_COMBINATIONS[0];
  const part3SectionId = sections.find(section => section.sort_order === 2)?.id ?? sections[2]?.id ?? null;
  return {
    fixedSectionIds: sections.filter(section => section.id !== part3SectionId).map(section => section.id),
    part3SectionId,
    subjects: [...selected.subjects],
  };
}

/**
 * Read the optional marker used by the LaTeX authoring workflow. The marker
 * deliberately lives inside each `ex` block so the existing editor persists
 * it in `latex_source` without requiring a new database column.
 *
 * Accepted examples:
 *   % hsa-subject: vatly
 *   % HSA_SUBJECT: tienganh
 */
export function hsaSubjectCodeFromLatex(value: string | null | undefined): HsaSubjectCode | null {
  const match = String(value ?? "").match(/%\s*hsa[-_\s]?subject\s*:\s*([a-z]+)/i);
  if (!match) return null;
  const normalized = match[1].toLocaleLowerCase("vi-VN");
  if (normalized === "english" || normalized === "anh") return "tienganh";
  return ["vatly", "hoahoc", "sinhhoc", "lichsu", "dialy", "tienganh"].includes(normalized)
    ? normalized as HsaSubjectCode
    : null;
}

/**
 * Filter only the HSA Part 3 questions selected by a combination. When a
 * section has no subject markers, the complete legacy question set is kept;
 * this preserves existing exams while new LaTeX packages opt into exact
 * Q01–Q10/Q21 selection simply by adding the marker above.
 */
export function filterHsaQuestionsForCombination<T extends { section_id?: string | null; latex_source?: string | null }>(
  questions: T[],
  combination: HsaCombination,
  part3SectionId?: string,
) {
  if (!part3SectionId) return questions;
  const part3Questions = questions.filter(question => question.section_id === part3SectionId);
  const hasSubjectMarkers = part3Questions.some(question => hsaSubjectCodeFromLatex(question.latex_source) !== null);
  if (!hasSubjectMarkers) return questions;
  return questions.filter(question => {
    if (question.section_id !== part3SectionId) return true;
    const subject = hsaSubjectCodeFromLatex(question.latex_source);
    return subject !== null && combination.subjects.includes(subject);
  });
}

export type HsaPart3SubjectBank = {
  code: HsaSubjectCode;
  title: string;
  start: number;
  end: number;
  source: string;
  questionCount: number;
};

function lastEnvironmentTokenIndex(source: string, environment: string, kind: "begin" | "end", before: number) {
  const pattern = new RegExp(`\\\\${kind}\\s*\\{\\s*${environment}\\s*\\}`, "gi");
  let last = -1;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) && match.index < before) last = match.index;
  return last;
}

function subjectQuestionContainerStart(source: string, markerIndex: number) {
  const exStart = lastEnvironmentTokenIndex(source, "ex", "begin", markerIndex);
  const baidocStart = lastEnvironmentTokenIndex(source, "baidoc", "begin", markerIndex);
  const baidocEnd = lastEnvironmentTokenIndex(source, "baidoc", "end", markerIndex);
  return baidocStart > baidocEnd ? baidocStart : Math.max(0, exStart);
}

/**
 * Split the combined Part 3 LaTeX into editable subject slices. A bank is
 * accepted only when each subject is contiguous; otherwise the editor falls
 * back to the full-source view instead of risking a lossy rewrite.
 */
export function splitHsaPart3SubjectBanks(source: string): HsaPart3SubjectBank[] {
  const markerPattern = /%\s*hsa[-_\s]?subject\s*:\s*([a-z]+)/gi;
  const markers: Array<{ code: HsaSubjectCode; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = markerPattern.exec(source))) {
    const code = hsaSubjectCodeFromLatex(match[0]);
    if (code) markers.push({ code, index: match.index });
  }
  if (!markers.length) return [];

  const transitions = markers.filter((marker, index) => index === 0 || markers[index - 1].code !== marker.code);
  if (new Set(transitions.map(item => item.code)).size !== transitions.length) return [];

  const starts = transitions.map(item => subjectQuestionContainerStart(source, item.index));
  const firstQuestionStart = starts[0];
  const partMarkers = [...source.slice(0, firstQuestionStart).matchAll(/\\phan3\b/gi)];
  const partMarker = partMarkers.at(-1);
  if (partMarker?.index !== undefined) {
    const markerEnd = partMarker.index + partMarker[0].length;
    const lineEnd = source.indexOf("\n", markerEnd);
    starts[0] = lineEnd >= 0 ? lineEnd + 1 : markerEnd;
  }

  return transitions.map((transition, index) => {
    const start = starts[index];
    const end = starts[index + 1] ?? source.length;
    const definition = HSA_PART3_SUBJECTS.find(subject => subject.code === transition.code);
    return {
      code: transition.code,
      title: definition?.title ?? transition.code,
      start,
      end,
      source: source.slice(start, end),
      questionCount: markers.filter(marker => marker.code === transition.code).length,
    };
  });
}

export function replaceHsaPart3SubjectBank(source: string, code: HsaSubjectCode, replacement: string) {
  const bank = splitHsaPart3SubjectBanks(source).find(item => item.code === code);
  if (!bank) return source;
  return `${source.slice(0, bank.start)}${replacement}${source.slice(bank.end)}`;
}

/**
 * Keeps HSA information blocks together while preserving the source order.
 * A question without a passage is its own group so the runner can scroll to
 * it without inventing a shared container.
 */
export function buildHsaQuestionGroups<T extends HsaQuestionLike>(questions: T[]): HsaQuestionGroup<T>[] {
  const groups: HsaQuestionGroup<T>[] = [];

  for (const question of questions) {
    const groupId = question._groupId ?? `question-${question.id}`;
    const previous = groups.at(-1);
    if (previous?.id === groupId) {
      previous.questions.push(question);
      continue;
    }
    groups.push({
      id: groupId,
      content: question._groupContent ?? "",
      questions: [question],
    });
  }

  return groups;
}
