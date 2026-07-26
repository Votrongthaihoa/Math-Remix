// Shared by the exam API (official scoring) and the result page (per-section
// breakdown) so a student never sees a section total that disagrees with the
// score the server recorded.

export function normalizeAnswer(value: unknown) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).sort();
  return String(value ?? "").trim().toLocaleLowerCase("vi");
}

export function answersMatch(answer: unknown, correct: unknown) {
  const left = normalizeAnswer(answer);
  const right = normalizeAnswer(correct);
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => item === right[index]);
  return left === right;
}
