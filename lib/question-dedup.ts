export type DedupQuestion = { id: string; prompt: string | null | undefined; questionType?: string | null };
export type DuplicateGroup = { itemIds: string[]; similarity: number; representativeId: string };
export type PotentialDuplicate = { id: string; prompt: string; questionType: string | null; similarity: number };

export const DEFAULT_DUPLICATE_THRESHOLD = 0.86;

export function normalizeQuestionText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLocaleLowerCase("vi-VN")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(value: string) { return new Set(normalizeQuestionText(value).split(" ").filter(Boolean)); }

export function questionSimilarity(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeQuestionText(left);
  const b = normalizeQuestionText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const leftTokens = tokens(a);
  const rightTokens = tokens(b);
  let intersection = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
  const union = leftTokens.size + rightTokens.size - intersection;
  return union ? intersection / union : 0;
}

/**
 * Compare one authoring draft with the current items in a bank.  This is kept
 * separate from group detection because the authoring flow needs an ordered,
 * small review list rather than every connected duplicate group.
 */
export function findPotentialDuplicates(
  draft: Pick<DedupQuestion, "prompt" | "questionType">,
  items: readonly DedupQuestion[],
  options: { threshold?: number; excludeItemId?: string; limit?: number } = {},
): PotentialDuplicate[] {
  const normalizedDraft = normalizeQuestionText(draft.prompt);
  if (!normalizedDraft) return [];

  const threshold = Math.min(1, Math.max(0, options.threshold ?? DEFAULT_DUPLICATE_THRESHOLD));
  const limit = Math.max(1, Math.min(20, Math.floor(options.limit ?? 5)));
  const draftType = draft.questionType ?? null;

  return items
    .filter(item => item.id !== options.excludeItemId)
    .filter(item => !draftType || !item.questionType || item.questionType === draftType)
    .map(item => ({
      id: item.id,
      prompt: String(item.prompt ?? "").trim(),
      questionType: item.questionType ?? null,
      similarity: questionSimilarity(normalizedDraft, item.prompt),
    }))
    .filter(item => item.prompt && item.similarity >= threshold)
    .sort((left, right) => right.similarity - left.similarity || left.id.localeCompare(right.id))
    .slice(0, limit)
    .map(item => ({ ...item, similarity: Number(item.similarity.toFixed(4)) }));
}

export function findDuplicateGroups(items: readonly DedupQuestion[], threshold = DEFAULT_DUPLICATE_THRESHOLD) {
  const safeThreshold = Math.min(1, Math.max(0, threshold));
  const parent = items.map((_item, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const join = (left: number, right: number) => { const a = find(left); const b = find(right); if (a !== b) parent[b] = a; };
  const normalized = items.map(item => normalizeQuestionText(item.prompt));
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      if (items[left].questionType && items[right].questionType && items[left].questionType !== items[right].questionType) continue;
      if (questionSimilarity(normalized[left], normalized[right]) >= safeThreshold) join(left, right);
    }
  }
  const groups = new Map<number, number[]>();
  parent.forEach((_value, index) => { const root = find(index); const group = groups.get(root) ?? []; group.push(index); groups.set(root, group); });
  return Array.from(groups.values()).filter(group => group.length > 1).map(group => {
    const first = group[0];
    const similarities = group.slice(1).map(index => questionSimilarity(normalized[first], normalized[index]));
    return { itemIds: group.map(index => items[index].id), similarity: Number(Math.min(...similarities).toFixed(4)), representativeId: items[first].id };
  });
}
