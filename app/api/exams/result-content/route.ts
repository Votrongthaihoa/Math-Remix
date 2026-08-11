import { answersMatch, normalizeAnswerMap, readAnswerKeySnapshot, scoreExamQuestionsWithOverridesForContext, type QuestionScoringOverride } from "../../../../lib/exam-answers";
import { encryptExamPayload, validateExamPublicKey, type ExamEnvelopeBinding } from "../../../../lib/exam-content-crypto";
import {
  EXAM_QUESTION_SELECT,
  EXAM_SECTION_PROGRESS_KEY,
  authenticateExamRequest,
  applyQuestionSnapshotOrder,
  examPrivateHeaders,
  examServerClient,
  loadExamAttemptContext,
  questionIdsFromSnapshot,
} from "../../../../lib/exam-content-server";
import { examReleaseVisibility, policyFromExamSettings, resolveAttemptPolicy } from "../../../../lib/exam-policy";
import { latexPartInstruction, parseLatexQuestion, type LatexPartNumber } from "../../../../lib/exam-latex";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{20,80}$/;

type ResultContentRequest = {
  attemptId?: string;
  clientPublicKey?: JsonWebKey;
  nonce?: string;
};

function error(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: examPrivateHeaders });
}

function cleanSubmittedAnswers(value: unknown) {
  const answers = normalizeAnswerMap(value);
  delete answers[EXAM_SECTION_PROGRESS_KEY];
  return answers;
}

type ResultQuestionSource = Record<string, unknown> & {
  section_id?: string | null;
  latex_source?: string | null;
};

function projectResultQuestions<T extends ResultQuestionSource>(questions: T[]) {
  const metadataItems = questions.map(question => {
    try {
      const parsed = question.latex_source?.trim() ? parseLatexQuestion(question.latex_source) : null;
      return {
        optionColumns: parsed?.optionColumns ?? 1,
        part: parsed?.part,
        matching: parsed?.matching ? {
          leftItems: parsed.matching.leftItems.map(item => ({ value: item.value, label: item.label })),
          rightItems: parsed.matching.rightItems.map(item => ({ value: item.value, label: item.label })),
        } : undefined,
      };
    } catch {
      return { optionColumns: 1, part: undefined, matching: undefined };
    }
  });
  const presentation = new Map<number, { displayNumber: number; partInstruction?: string }>();
  const sectionIndexes = new Map<string, number[]>();
  questions.forEach((question, index) => {
    const sectionId = String(question.section_id ?? "");
    sectionIndexes.set(sectionId, [...(sectionIndexes.get(sectionId) ?? []), index]);
  });
  sectionIndexes.forEach(indexes => {
    const partStarts = indexes.flatMap((questionIndex, localIndex) => {
      const part = metadataItems[questionIndex]?.part;
      return part ? [{ localIndex, part }] : [];
    });
    indexes.forEach((questionIndex, localIndex) => {
      const start = partStarts.filter(item => item.localIndex <= localIndex).at(-1);
      if (!start) {
        presentation.set(questionIndex, { displayNumber: localIndex + 1 });
        return;
      }
      const nextStart = partStarts.find(item => item.localIndex > start.localIndex)?.localIndex ?? indexes.length;
      presentation.set(questionIndex, {
        displayNumber: localIndex - start.localIndex + 1,
        partInstruction: localIndex === start.localIndex
          ? latexPartInstruction(start.part as LatexPartNumber, nextStart - start.localIndex)
          : undefined,
      });
    });
  });
  return questions.map((question, index) => {
    const safeQuestion = { ...question };
    delete safeQuestion.latex_source;
    const metadata = metadataItems[index] ?? { optionColumns: 1, part: undefined, matching: undefined };
    const { displayNumber = index + 1, partInstruction } = presentation.get(index) ?? {};
    return {
      ...safeQuestion,
      option_columns: metadata.optionColumns,
      part: metadata.part,
      matching: metadata.matching,
      _displayNumber: displayNumber,
      _partInstruction: partInstruction,
    };
  });
}

export async function POST(request: Request) {
  const admin = examServerClient();
  if (!admin) return error("Chưa cấu hình máy chủ khảo thí.", 503);
  const authentication = await authenticateExamRequest(request, admin);
  if (!authentication.ok) return authentication.response;
  const user = authentication.user;

  const parsedBody = await readJsonBody<ResultContentRequest>(request);
  if (!parsedBody.ok) return error(jsonBodyError(parsedBody.error).error, parsedBody.error === "payload_too_large" ? 413 : 400);
  const body = parsedBody.body;
  if (!body.attemptId || !UUID_PATTERN.test(body.attemptId) || !body.nonce || !NONCE_PATTERN.test(body.nonce)) {
    return error("Yêu cầu kết quả bài thi không hợp lệ.", 400);
  }
  try {
    validateExamPublicKey(body.clientPublicKey);
  } catch (value) {
    return error(value instanceof Error ? value.message : "Khóa phiên bài thi không hợp lệ.", 400);
  }

  const context = await loadExamAttemptContext(admin, user, body.attemptId, { requireOwner: false, requireInProgress: false });
  if (!context) return error("Không tìm thấy kết quả bài thi.", 404);
  const selectedSections = context.isThptqg
    ? context.sections.filter(section => section.id === context.attempt.section_id)
    : context.sections;
  const sectionIds = selectedSections.map(section => section.id);
  const snapshotQuestionIds = questionIdsFromSnapshot(context.attempt.question_order);
  const questionQuery = admin.from("exam_questions").select(EXAM_QUESTION_SELECT).in("section_id", sectionIds);
  const { data: questionRows, error: questionError } = sectionIds.length
    ? await (snapshotQuestionIds.length ? questionQuery.in("id", snapshotQuestionIds) : questionQuery).order("sort_order")
    : { data: [], error: null };
  if (questionError) return error("Không thể tải nội dung kết quả.", 503);
  const sectionOrder = new Map(sectionIds.map((sectionId, index) => [sectionId, index]));
  const sourceQuestions = [...(questionRows ?? [])].sort((left, right) => {
    const sectionDifference = (sectionOrder.get(left.section_id) ?? 0) - (sectionOrder.get(right.section_id) ?? 0);
    return sectionDifference || Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0);
  });
  // Result review must use the immutable permutation captured at attempt
  // start. Without this, reordering or a question pool can make the review
  // display a different paper from the one that was scored.
  const questions = applyQuestionSnapshotOrder(sourceQuestions, context.attempt.question_order, context.attempt.option_order);
  const questionIds = questions.map(question => question.id);
  const { data: keys, error: keyError } = questionIds.length
    ? await admin.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", questionIds)
    : { data: [], error: null };
  if (keyError) return error("Không thể tải đáp án bài thi.", 503);

  const submittedAnswers = cleanSubmittedAnswers(context.attempt.answers);
  const examSettings = (await admin.from("exams").select("settings,duration_minutes").eq("id", context.exam.id).maybeSingle()).data;
  const fallbackPolicy = policyFromExamSettings(examSettings?.settings, {
    examType: context.exam.exam_type,
    mode: (context.attempt.mode === "exam" ? "official" : "practice"),
    durationMinutes: examSettings?.duration_minutes,
  });
  const policy = resolveAttemptPolicy(context.attempt.policy_snapshot, fallbackPolicy);
  const visibility = examReleaseVisibility(policy, context.attempt, {
    releasedAt: context.exam.results_released_at,
    slotEndsAt: policy.timing.closesAt,
  });
  const snapshot = readAnswerKeySnapshot(context.attempt.answer_key_snapshot);
  const keyMap = snapshot.size
    ? new Map([...snapshot.entries()].map(([questionId, entry]) => [questionId, entry.correct_answer]))
    : new Map((keys ?? []).map(key => [key.question_id, key.correct_answer]));
  const scoringVersion = Number(context.attempt.scoring_version ?? 1);
  let overrides = new Map<string, QuestionScoringOverride>();
  if (scoringVersion > 1) {
    const { data: version } = await admin.from("exam_scoring_versions").select("id,version").eq("exam_id", context.attempt.exam_id).eq("version", scoringVersion).maybeSingle();
    if (version?.id) {
      const { data: rows } = await admin.from("exam_question_overrides").select("question_id,override_mode,accepted_answers").eq("scoring_version_id", version.id);
      overrides = new Map((rows ?? []).map(row => [row.question_id, { override_mode: row.override_mode as QuestionScoringOverride["override_mode"], accepted_answers: row.accepted_answers }]));
    }
  }
  const subjectSection = context.attempt.section_id ? context.sections.find(section => section.id === context.attempt.section_id) : undefined;
  const examType = [context.room.exam_type, context.exam.exam_type].find(value => String(value ?? "").trim().toUpperCase() === "THPTQG") ?? context.exam.exam_type;
  const scored = scoreExamQuestionsWithOverridesForContext(questions, submittedAnswers, keyMap, overrides, {
    examType,
    subjectCode: subjectSection?.subject_code,
    subjectTitle: subjectSection?.title,
  });
  const correctAnswers = scored.correctAnswers;
  const score = scored.score;
  const currentKeyDetails = new Map((keys ?? []).map(key => [key.question_id, key]));
  const resultKeys = visibility.answersVisible ? questionIds.map(questionId => {
    const snapshotEntry = snapshot.get(questionId);
    const currentEntry = currentKeyDetails.get(questionId);
    const correctAnswer = snapshotEntry?.correct_answer ?? currentEntry?.correct_answer ?? null;
    const questionType = questions.find(question => question.id === questionId)?.question_type ?? "";
    const ordered = ["inline", "true_false", "ordering", "drag_drop"].includes(questionType);
    const override = overrides.get(questionId);
    const acceptedAnswers = Array.isArray(override?.accepted_answers) ? override.accepted_answers : [];
    const effectiveCorrectAnswer = override?.override_mode === "void_question"
      ? null
      : override?.override_mode === "accept_multiple" && acceptedAnswers.length
        ? acceptedAnswers
        : correctAnswer;
    const isCorrect = override?.override_mode === "void_question"
      ? false
      : override?.override_mode === "award_all"
        ? true
        : override?.override_mode === "accept_multiple"
          ? acceptedAnswers.some(candidate => answersMatch(submittedAnswers[questionId], candidate, ordered))
          : answersMatch(submittedAnswers[questionId], correctAnswer, ordered);
    return {
      question_id: questionId,
      voided: override?.override_mode === "void_question",
      correct_answer: policy.release.hideWrongAnswers && !isCorrect ? null : effectiveCorrectAnswer,
      explanation: visibility.solutionsVisible && (!policy.release.hideWrongAnswers || isCorrect)
        ? snapshotEntry?.explanation || currentEntry?.explanation || ""
        : "",
    };
  }) : [];
  const repairedAttempt = {
    ...context.attempt,
    answers: submittedAnswers,
    correct_answers: visibility.scoreVisible ? correctAnswers : null,
    total_questions: questions.length,
    score: visibility.scoreVisible ? score : null,
  };
  delete repairedAttempt.answer_key_snapshot;
  if (context.attempt.correct_answers !== correctAnswers || context.attempt.total_questions !== questions.length || Number(context.attempt.score) !== score) {
    await admin.from("exam_attempts").update({ correct_answers: correctAnswers, total_questions: questions.length, score }).eq("id", context.attempt.id);
  }

  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const binding: ExamEnvelopeBinding = {
    version: 1,
    kind: "result",
    attemptId: context.attempt.id,
    sectionId: null,
    index: null,
    nonce: body.nonce,
    expiresAt,
  };
  try {
    const envelope = await encryptExamPayload({
      room: context.room,
      exam: context.exam,
      sections: selectedSections,
      questions: visibility.answersVisible ? projectResultQuestions(questions) : [],
      attempt: repairedAttempt,
      keys: resultKeys,
      resultVisibility: visibility,
    }, body.clientPublicKey, binding);
    return Response.json(envelope, { headers: examPrivateHeaders });
  } catch {
    return error("Không thể mã hóa kết quả bài thi.", 500);
  }
}
