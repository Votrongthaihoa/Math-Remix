import {
  examReleaseVisibility,
  policyFromExamSettings,
  resolveAttemptPolicy,
} from "./exam-policy.ts";

export type QuestionSearchAttempt = {
  student_id?: string | null;
  exam_id?: string | null;
  status?: string | null;
  score?: number | string | null;
  question_order?: unknown;
  policy_snapshot?: unknown;
  mode?: string | null;
};

export type QuestionSearchExam = {
  id?: string | null;
  room_id?: string | null;
  published?: boolean | null;
  exam_type?: string | null;
  duration_minutes?: number | null;
  settings?: unknown;
  results_released_at?: string | null;
};

export type QuestionSearchRoom = {
  id?: string | null;
  published?: boolean | null;
  access_mode?: string | null;
};

const COMPLETED_ATTEMPT_STATUSES = new Set(["completed", "submitted", "graded"]);
// Keep the PostgREST `.in(...)` filter below common proxy URL limits. Search is
// discovery, so a bounded recent scope is preferable to an oversized request.
const DEFAULT_MAX_QUESTION_IDS = 200;

function snapshotQuestionIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean))];
}

/**
 * Build the smallest learner search scope that the current schema can prove.
 *
 * A room assignment alone is not enough: raw questions remain hidden until a
 * completed, owned attempt has answer review released by the same policy used
 * by the result API. Question IDs must also come from that attempt's immutable
 * question-order snapshot; legacy attempts without a snapshot fail closed.
 */
export function releasedQuestionSearchScope(input: {
  userId: string;
  attempts: readonly QuestionSearchAttempt[];
  exams: readonly QuestionSearchExam[];
  rooms: readonly QuestionSearchRoom[];
  enrolledRoomIds: ReadonlySet<string>;
  now?: number;
  maxQuestionIds?: number;
}) {
  const questionIds = new Set<string>();
  const examIds = new Set<string>();
  const examById = new Map(input.exams
    .filter(exam => typeof exam.id === "string" && exam.id.length > 0)
    .map(exam => [exam.id as string, exam]));
  const roomById = new Map(input.rooms
    .filter(room => typeof room.id === "string" && room.id.length > 0)
    .map(room => [room.id as string, room]));
  const maxQuestionIds = Math.max(0, Math.min(DEFAULT_MAX_QUESTION_IDS, input.maxQuestionIds ?? DEFAULT_MAX_QUESTION_IDS));

  for (const attempt of input.attempts) {
    if (questionIds.size >= maxQuestionIds) break;
    if (attempt.student_id !== input.userId || !COMPLETED_ATTEMPT_STATUSES.has(String(attempt.status ?? ""))) continue;
    const exam = typeof attempt.exam_id === "string" ? examById.get(attempt.exam_id) : undefined;
    if (!exam || exam.published !== true || typeof exam.id !== "string" || typeof exam.room_id !== "string") continue;
    const room = roomById.get(exam.room_id);
    const currentlyAuthorized = room?.published === true
      && (room.access_mode === "open" || input.enrolledRoomIds.has(exam.room_id));
    if (!currentlyAuthorized) continue;

    const fallback = policyFromExamSettings(exam.settings, {
      examType: exam.exam_type,
      mode: attempt.mode === "exam" ? "official" : "practice",
      durationMinutes: exam.duration_minutes,
    });
    const policy = resolveAttemptPolicy(attempt.policy_snapshot, fallback);
    const visibility = examReleaseVisibility(policy, attempt, {
      releasedAt: exam.results_released_at,
      slotEndsAt: policy.timing.closesAt,
    }, input.now);
    if (!visibility.answersVisible) continue;

    const releasedIds = snapshotQuestionIds(attempt.question_order);
    if (!releasedIds.length) continue;
    examIds.add(exam.id);
    for (const questionId of releasedIds) {
      questionIds.add(questionId);
      if (questionIds.size >= maxQuestionIds) break;
    }
  }

  return { questionIds, examIds };
}
