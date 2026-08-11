import { answersMatch, buildAnswerKeySnapshot, normalizeAnswerMap, readAnswerKeySnapshot, scoreExamQuestions, type ExamAnswerValue, type QuestionScoringOverride } from "../../../lib/exam-answers";
import { jsonBodyError, readJsonBody } from "../../../lib/http-server";
import { consumeRequestBudget } from "../../../lib/rate-limit-server";
import {
  applyGuestOrdering, guestAttemptDeadline, guestCookieHeader, guestCookieName, guestPrivateHeaders, guestServerClient,
  GUEST_ATTEMPT_SELECT, GUEST_SLOT_SELECT, loadGuestQuestions, loadGuestSlot, normalizeGuestIdentity, normalizeGuestSettings, prepareQuestionsForPolicy,
  publicGuestQuestion, randomToken, readCookie, requestClientHash, sha256, slotPhase, verifyGuestPassword,
  type GuestExamRow, type GuestExamSettings, type GuestRoomRow, type GuestSection, type GuestSlotRow,
} from "../../../lib/guest-exam-server";
import { createAttemptPolicy, examCodes, examReleaseVisibility, isExamCodeAllowed, normalizeExamCode, policyFromGuestSettings, publicExamPolicy, resolveAttemptPolicy, type ExamPolicy } from "../../../lib/exam-policy";

type Body = {
  action?: "start" | "resume" | "progress" | "submit";
  token?: string;
  attemptId?: string;
  password?: string;
  identity?: Record<string, unknown>;
  answers?: Record<string, ExamAnswerValue>;
  monitorEvent?: string;
  progressVersion?: number;
  flaggedQuestions?: string[];
  networkState?: string;
  examCode?: string;
};

function json(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(payload, { status, headers: { ...guestPrivateHeaders, ...extraHeaders } });
}

const safeAnswers = normalizeAnswerMap;

function safeIdentity(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, string>;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => typeof item === "string")
      .slice(0, 20)
      .map(([key, item]) => [key, String(item).slice(0, 200)]),
  );
}

function safeMonitorEvent(value: unknown) {
  return typeof value === "string" && [
    "visibility_hidden", "visibility_visible", "fullscreen_exit", "fullscreen_enter",
    "window_blur", "window_focus", "copy", "paste", "cut", "context_menu",
  ].includes(value) ? value : "";
}

type GuestAttemptRow = Record<string, unknown> & {
  id: string;
  slot_id: string;
  exam_id: string;
  answers: unknown;
  question_order: unknown;
  option_order: unknown;
  monitor_events: unknown;
  policy_snapshot: unknown;
  policy_version: number;
  started_at: string;
  submitted_at: string | null;
  status: "in_progress" | "submitted" | "expired" | string;
  score: number | null;
  correct_answers: number;
  total_questions: number;
  duration_seconds: number | null;
  progress_version: number;
  flagged_questions?: unknown;
  exam_code?: string | null;
  time_extension_seconds?: number;
  network_state?: string;
  scoring_version?: number;
};
type GuestContext = { slot: GuestSlotRow; exam: GuestExamRow; room: GuestRoomRow; settings: GuestExamSettings; policy: ExamPolicy; section: GuestSection | null };

function attemptPolicy(context: Pick<GuestContext, "policy">, attempt: Pick<GuestAttemptRow, "policy_snapshot">) {
  return resolveAttemptPolicy(attempt.policy_snapshot, context.policy);
}

function attemptDeadline(context: Pick<GuestContext, "exam" | "slot" | "policy">, attempt: Pick<GuestAttemptRow, "started_at" | "policy_snapshot"> & Partial<Pick<GuestAttemptRow, "time_extension_seconds">>) {
  return guestAttemptDeadline(context.exam, context.slot, attempt.started_at, attemptPolicy(context, attempt).timing.durationMinutes, Number(attempt.time_extension_seconds) || 0);
}

function attemptDurationSeconds(context: Pick<GuestContext, "exam" | "slot" | "policy">, attempt: Pick<GuestAttemptRow, "started_at" | "policy_snapshot"> & Partial<Pick<GuestAttemptRow, "time_extension_seconds">>, now = Date.now()) {
  const started = new Date(attempt.started_at).getTime();
  const deadline = new Date(attemptDeadline(context, attempt)).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(deadline)) return 0;
  return Math.max(0, Math.min(Math.floor((now - started) / 1000), Math.max(0, Math.floor((deadline - started) / 1000))));
}

function publicAttempt(attempt: Pick<GuestAttemptRow, "id" | "answers" | "started_at" | "status" | "policy_snapshot"> & Partial<Pick<GuestAttemptRow, "progress_version" | "guest_identity" | "flagged_questions" | "exam_code" | "network_state" | "time_extension_seconds">>, context: GuestContext) {
  const policy = attemptPolicy(context, attempt);
  return {
    id: attempt.id,
    answers: safeAnswers(attempt.answers),
    identity: safeIdentity(attempt.guest_identity),
    started_at: attempt.started_at,
    deadline_at: attemptDeadline(context, attempt),
    progress_version: Number(attempt.progress_version ?? 0),
    flagged_questions: Array.isArray(attempt.flagged_questions) ? attempt.flagged_questions.filter(item => typeof item === "string") : [],
    exam_code: attempt.exam_code ?? null,
    network_state: typeof attempt.network_state === "string" ? attempt.network_state : "online",
    time_extension_seconds: Math.max(0, Number(attempt.time_extension_seconds) || 0),
    policy: publicExamPolicy(policy),
    status: attempt.status,
  };
}

function policyAnswerVisibility(policy: ExamPolicy, slot: GuestSlotRow, score: number, now = Date.now()) {
  const visibility = examReleaseVisibility(policy, { status: "submitted", score }, {
    releasedAt: slot.results_released_at,
    slotEndsAt: slot.ends_at,
  }, now);
  return { scoreVisible: visibility.scoreVisible, answersVisible: visibility.answersVisible };
}

function snapshotKeyMap(snapshot: unknown, fallback: Array<{ question_id: string; correct_answer: unknown }> = []) {
  const saved = readAnswerKeySnapshot(snapshot);
  if (saved.size) return new Map([...saved.entries()].map(([questionId, entry]) => [questionId, entry.correct_answer]));
  return new Map(fallback.map(key => [key.question_id, key.correct_answer]));
}

function snapshotKeyDetails(snapshot: unknown) {
  return readAnswerKeySnapshot(snapshot);
}

async function guestScoringOverrides(admin: NonNullable<ReturnType<typeof guestServerClient>>, attempt: Pick<GuestAttemptRow, "exam_id" | "scoring_version">) {
  const versionNumber = Number(attempt.scoring_version ?? 1);
  if (!Number.isFinite(versionNumber) || versionNumber <= 1) return new Map<string, QuestionScoringOverride>();
  const { data: version } = await admin.from("exam_scoring_versions").select("id").eq("exam_id", attempt.exam_id).eq("version", versionNumber).maybeSingle();
  if (!version?.id) return new Map<string, QuestionScoringOverride>();
  const { data: rows } = await admin.from("exam_question_overrides").select("question_id,override_mode,accepted_answers").eq("scoring_version_id", version.id);
  return new Map<string, QuestionScoringOverride>((rows ?? []).map(row => [row.question_id, { override_mode: row.override_mode as QuestionScoringOverride["override_mode"], accepted_answers: row.accepted_answers }]));
}

function slotMeta(context: Awaited<ReturnType<typeof loadGuestSlot>>) {
  if (!context) return null;
  const { slot, exam, room, settings, policy } = context;
  return {
    slot: {
      id: slot.id,
      name: slot.name,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      grace_period_minutes: slot.grace_period_minutes,
      enabled: slot.enabled,
      has_password: Boolean(slot.password_hash),
    },
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      exam_type: exam.exam_type,
      duration_minutes: exam.duration_minutes,
    },
    room: { id: room.id, title: room.title, exam_type: room.exam_type },
    section: context.section ? {
      id: context.section.id,
      title: context.section.title,
      duration_minutes: context.section.duration_minutes,
      subject_code: context.section.subject_code ?? null,
    } : null,
    settings: {
      identityFields: settings.identityFields,
      rosterMode: settings.rosterMode,
      allowedClasses: settings.allowedClasses,
      maxAttempts: settings.maxAttempts,
      autoMonitor: settings.autoMonitor,
      hideGroupHeaders: settings.hideGroupHeaders,
      resetQuestionIndex: settings.resetQuestionIndex,
    },
    policy: publicExamPolicy(policy),
    phase: slotPhase(slot),
    serverTime: new Date().toISOString(),
  };
}

async function attemptForSession(admin: NonNullable<ReturnType<typeof guestServerClient>>, attemptId: string, sessionHash: string): Promise<{ attempt: GuestAttemptRow } & GuestContext | null> {
  const { data: rawAttempt } = await admin.from("guest_exam_attempts").select(GUEST_ATTEMPT_SELECT).eq("id", attemptId).eq("session_hash", sessionHash).maybeSingle();
  const attempt = rawAttempt as GuestAttemptRow | null;
  if (!attempt) return null;
  const context = await loadGuestSlotByIds(admin, attempt.slot_id, attempt.exam_id);
  if (!context) return null;
  return { attempt, ...context };
}

async function loadGuestSlotByIds(admin: NonNullable<ReturnType<typeof guestServerClient>>, slotId: string, examId: string): Promise<GuestContext | null> {
  const { data: slot } = await admin.from("exam_access_slots").select(GUEST_SLOT_SELECT).eq("id", slotId).eq("exam_id", examId).maybeSingle();
  if (!slot) return null;
  const { data: exam } = await admin.from("exams").select("id,room_id,title,description,exam_type,duration_minutes,published,settings").eq("id", examId).maybeSingle();
  if (!exam || !exam.published) return null;
  const { data: room } = await admin.from("exam_rooms").select("id,title,published,exam_type").eq("id", exam.room_id).maybeSingle();
  if (!room?.published) return null;
  const { data: section } = slot.section_id
    ? await admin.from("exam_sections").select("id,title,duration_minutes,sort_order,subject_code").eq("id", slot.section_id).eq("exam_id", exam.id).maybeSingle()
    : { data: null };
  if (slot.section_id && !section) return null;
  const settings = normalizeGuestSettings(exam.settings);
  if (!settings.guestEnabled) return null;
  const effectiveExam = section?.duration_minutes ? { ...exam, duration_minutes: section.duration_minutes } : exam;
  const policy = policyFromGuestSettings(settings, {
    examType: effectiveExam.exam_type,
    durationMinutes: effectiveExam.duration_minutes,
    opensAt: slot.starts_at,
    closesAt: slot.ends_at,
    gracePeriodMinutes: slot.grace_period_minutes,
    passwordRequired: Boolean(slot.password_hash),
  });
  return { slot: slot as GuestSlotRow, exam: effectiveExam as GuestExamRow, room: room as GuestRoomRow, settings, policy, section: section as GuestSection | null };
}

async function questionPayload(admin: NonNullable<ReturnType<typeof guestServerClient>>, attempt: GuestAttemptRow, context: GuestContext) {
  const loaded = await loadGuestQuestions(admin, context.exam.id, Array.isArray(attempt.question_order) ? attempt.question_order : undefined, context.section?.id);
  const ordered = applyGuestOrdering(loaded.questions, attempt.question_order, attempt.option_order);
  return { sections: loaded.sections, questions: ordered.map(question => publicGuestQuestion(question, attempt.id)) };
}

async function resultPayload(admin: NonNullable<ReturnType<typeof guestServerClient>>, attempt: GuestAttemptRow, context: GuestContext) {
  const loaded = await loadGuestQuestions(admin, context.exam.id, Array.isArray(attempt.question_order) ? attempt.question_order : undefined, context.section?.id);
  const questions = applyGuestOrdering(loaded.questions, attempt.question_order, attempt.option_order);
  const policy = attemptPolicy(context, attempt);
  const visibility = policyAnswerVisibility(policy, context.slot, Number(attempt.score ?? 0));
  const answerMap = safeAnswers(attempt.answers);
  const overrides = await guestScoringOverrides(admin, attempt);
  const resultAttempt: Record<string, unknown> = {
    id: attempt.id,
    status: attempt.status,
    submitted_at: attempt.submitted_at,
    duration_seconds: attempt.duration_seconds,
  };
  if (visibility.scoreVisible) {
    resultAttempt.score = Number(attempt.score ?? 0);
    resultAttempt.correct_answers = attempt.correct_answers;
    resultAttempt.total_questions = attempt.total_questions;
  }
  const payload: Record<string, unknown> = {
    attempt: resultAttempt,
    // Keep the candidate's display name available after a reload. The full
    // identity is already scoped to this cookie-bound attempt and is filtered
    // to plain strings before it crosses the guest boundary.
    identity: safeIdentity(attempt.guest_identity),
    scoreVisible: visibility.scoreVisible,
    answersVisible: visibility.answersVisible,
  };
  if (visibility.answersVisible) {
    const questionIds = questions.map(question => question.id);
    const { data: keys } = questionIds.length
      ? await admin.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", questionIds)
      : { data: [] };
    const snapshot = snapshotKeyDetails(attempt.answer_key_snapshot);
    const keyMap = snapshot.size
      ? new Map([...snapshot.entries()].map(([questionId, entry]) => [questionId, { question_id: questionId, correct_answer: entry.correct_answer, explanation: entry.explanation }]))
      : new Map((keys ?? []).map(key => [key.question_id, key]));
    const publicQuestions = questions.map(question => publicGuestQuestion(question, attempt.id));
    payload.questions = questions.map((question, index) => {
      const key = keyMap.get(question.id);
      const override = overrides.get(question.id);
      const ordered = ["inline", "true_false", "ordering", "drag_drop"].includes(question.question_type);
      const acceptedAnswers = Array.isArray(override?.accepted_answers) ? override.accepted_answers : [];
      const effectiveCorrectAnswer = override?.override_mode === "void_question"
        ? null
        : override?.override_mode === "accept_multiple" && acceptedAnswers.length
          ? acceptedAnswers
          : key?.correct_answer;
      const correct = override?.override_mode === "void_question"
        ? false
        : override?.override_mode === "award_all"
          ? true
          : override?.override_mode === "accept_multiple"
            ? acceptedAnswers.some(candidate => answersMatch(answerMap[question.id], candidate, ordered))
            : answersMatch(answerMap[question.id], key?.correct_answer, ordered);
      return {
        id: question.id,
        selected: answerMap[question.id] ?? null,
        correct,
        voided: override?.override_mode === "void_question",
        correctAnswer: correct || !policy.release.hideWrongAnswers ? effectiveCorrectAnswer : null,
        explanation: correct || !policy.release.hideWrongAnswers ? key?.explanation ?? "" : "",
        // The browser receives the same safe, parsed projection used by the
        // live runner, never latex_source or answer markers. It is included
        // only when the kíp has released answer review.
        question: publicQuestions[index],
      };
    });
  }
  return payload;
}

export async function GET(request: Request) {
  const admin = guestServerClient();
  if (!admin) return json({ error: "Chưa cấu hình máy chủ khảo thí." }, 503);
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const context = await loadGuestSlot(admin, token);
  if (!context) return json({ error: "Link thi không tồn tại hoặc đã bị khóa." }, 404);
  const metaBudget = await consumeRequestBudget(admin, "guest_meta", await requestClientHash(request, { slotId: context.slot.id }), { capacity: 30, refillSeconds: 2 });
  if (!metaBudget.ready && !metaBudget.allowed) return json({ error: "Lá»›p báº£o vá»‡ kÃ­p thi chÆ°a sẵn sÃ ng." }, 503, { "retry-after": String(metaBudget.retryAfterSeconds) });
  if (!metaBudget.allowed) return json({ error: "QuÃ¡ nhiá»u yÃªu cáº§u. HÃ£y thá»­ láº¡i sau." }, 429, { "retry-after": String(metaBudget.retryAfterSeconds) });
  return json(slotMeta(context));
}

export async function POST(request: Request) {
  const admin = guestServerClient();
  if (!admin) return json({ error: "Chưa cấu hình máy chủ khảo thí." }, 503);
  const parsedBody = await readJsonBody<Body>(request);
  if (!parsedBody.ok) return json(jsonBodyError(parsedBody.error), parsedBody.error === "payload_too_large" ? 413 : 400);
  const body = parsedBody.body;
  const token = body.token?.trim() ?? "";
  const context = await loadGuestSlot(admin, token);
  if (!context) return json({ error: "Link thi không tồn tại hoặc đã bị khóa." }, 404);
  const { slot, exam, settings, policy } = context;
  const requestScope = body.action === "start"
    ? "guest_start"
    : body.action === "progress"
      ? "guest_progress"
      : body.action === "submit"
        ? "guest_submit"
        : "guest_resume";
  const requestCapacity = body.action === "start" ? 6 : body.action === "progress" ? 90 : body.action === "submit" ? 12 : 30;
  const requestRefillSeconds = body.action === "start" ? 10 : body.action === "progress" ? 1 : body.action === "submit" ? 5 : 2;
  const requestSubjectHash = await requestClientHash(request, { slotId: slot.id, attemptId: body.attemptId ?? "" });
  const requestBudget = await consumeRequestBudget(admin, requestScope, requestSubjectHash, { capacity: requestCapacity, refillSeconds: requestRefillSeconds });
  if (!requestBudget.ready && !requestBudget.allowed) return json({ error: "Lá»›p báº£o vá»‡ kÃ­p thi chÆ°a sẵn sÃ ng." }, 503, { "retry-after": String(requestBudget.retryAfterSeconds) });
  if (!requestBudget.allowed) return json({ error: "QuÃ¡ nhiá»u yÃªu cáº§u. HÃ£y thá»­ láº¡i sau." }, 429, { "retry-after": String(requestBudget.retryAfterSeconds) });
  const phase = slotPhase(slot);
  const secureCookie = new URL(request.url).protocol === "https:";
  const session = readCookie(request, guestCookieName(slot.id));
  const sessionHash = session ? await sha256(session) : "";

  if (body.action === "start") {
    if (phase === "upcoming") return json({ error: "Kíp thi chưa mở.", phase }, 409);
    if (phase === "grace" || phase === "closed" || phase === "disabled") return json({ error: "Kíp thi đã kết thúc, không thể bắt đầu lượt mới.", phase }, 410);
    if (slot.password_hash && !(await verifyGuestPassword(body.password?.trim() ?? "", slot.password_hash))) return json({ error: "Mật khẩu đề thi không đúng." }, 403);
    const identityResult = normalizeGuestIdentity(body.identity, settings);
    if ("error" in identityResult) return json({ error: identityResult.error }, 400);
    if (policy.access.rosterMode === "allowlist") {
      const candidateCode = String(identityResult.identity.candidate_code || identityResult.identity.sbd || identityResult.identity.student_code || "").trim().toUpperCase();
      if (!candidateCode) return json({ error: "Kíp thi yêu cầu mã thí sinh trong danh sách được cấp quyền." }, 403);
      const { data: candidate } = await admin.from("exam_slot_candidates").select("id,class_name").eq("slot_id", slot.id).eq("candidate_code", candidateCode).maybeSingle();
      if (!candidate) return json({ error: "Mã thí sinh không thuộc danh sách của kíp thi." }, 403);
      if (policy.access.allowedClasses.length && !policy.access.allowedClasses.includes(String(candidate.class_name ?? ""))) return json({ error: "Lớp của thí sinh không thuộc phạm vi kíp thi." }, 403);
    }
    const activeSession = session || randomToken(24);
    const activeSessionHash = await sha256(activeSession);
    const clientHash = await requestClientHash(request, identityResult.identity);
    const existingResult = await admin.from("guest_exam_attempts").select(GUEST_ATTEMPT_SELECT).eq("slot_id", slot.id).eq("session_hash", activeSessionHash).eq("status", "in_progress").order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (existingResult.data) {
      const deadlineAt = attemptDeadline(context, existingResult.data);
      if (Date.now() <= new Date(deadlineAt).getTime() + 5_000) {
        const payload = await questionPayload(admin, existingResult.data, context);
        return json({ ...slotMeta(context), ...payload, attempt: publicAttempt(existingResult.data, context), resumed: true }, 200, { "set-cookie": guestCookieHeader(slot.id, activeSession, secureCookie) });
      }
      await admin.from("guest_exam_attempts").update({ status: "expired", submitted_at: new Date().toISOString(), duration_seconds: attemptDurationSeconds(context, existingResult.data) }).eq("id", existingResult.data.id).eq("status", "in_progress");
    }
    if (settings.maxAttempts > 0) {
      const { count } = await admin.from("guest_exam_attempts").select("id", { count: "exact", head: true }).eq("slot_id", slot.id).or(`session_hash.eq.${activeSessionHash},client_hash.eq.${clientHash}`);
      if ((count ?? 0) >= settings.maxAttempts) {
        const grant = await admin.rpc("consume_exam_attempt_grant", { target_exam_id: exam.id, target_slot_id: slot.id, target_student_id: null, target_client_hash: clientHash });
        if (grant.error || !grant.data?.[0]?.allowed) return json({ error: "Bạn đã sử dụng hết số lượt làm bài của kíp thi." }, 409);
      }
    }
    const loaded = await loadGuestQuestions(admin, exam.id, undefined, context.section?.id);
    let requestedExamCode = normalizeExamCode(body.examCode);
    if (policy.randomization.randomizationMode === "exam_code") {
      if (body.examCode && !isExamCodeAllowed(policy, body.examCode)) return json({ error: "Mã đề không hợp lệ." }, 400);
      requestedExamCode = requestedExamCode ?? examCodes(policy)[0] ?? null;
    } else {
      requestedExamCode = null;
    }
    const attemptPolicy = createAttemptPolicy(policy, { examCode: requestedExamCode });
    const prepared = prepareQuestionsForPolicy(loaded.questions, attemptPolicy);
    const preparedQuestionIds = prepared.questions.map(question => question.id);
    const { data: preparedKeys, error: preparedKeysError } = preparedQuestionIds.length
      ? await admin.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", preparedQuestionIds)
      : { data: [], error: null };
    if (preparedKeysError) return json({ error: "KhÃ´ng thá»ƒ chuáº©n bá»‹ Ä‘Ã¡p Ã¡n cho lÆ°á»£t thi." }, 503);
    const answerKeySnapshot = buildAnswerKeySnapshot(preparedKeys ?? []);
    const { data: attempt, error } = await admin.from("guest_exam_attempts").insert({
      slot_id: slot.id,
      exam_id: exam.id,
      session_hash: activeSessionHash,
      client_hash: clientHash,
      guest_identity: identityResult.identity,
      answers: {},
      question_order: prepared.questionOrder,
      option_order: prepared.optionOrder,
      exam_code: requestedExamCode,
      config_snapshot: settings,
      policy_snapshot: attemptPolicy,
      policy_version: attemptPolicy.version,
      answer_key_snapshot: answerKeySnapshot,
      total_questions: prepared.questions.length,
    }).select("id,status,answers,started_at,policy_snapshot").single();
    if (error || !attempt) {
      if (error?.code === "23505" || /unique|duplicate/i.test(error?.message ?? "")) {
        const raced = (await admin.from("guest_exam_attempts").select(GUEST_ATTEMPT_SELECT).eq("slot_id", slot.id).eq("session_hash", activeSessionHash).eq("status", "in_progress").order("started_at", { ascending: false }).limit(1).maybeSingle()).data as GuestAttemptRow | null;
        if (raced) {
          const payload = await questionPayload(admin, raced, context);
          return json({ ...slotMeta(context), ...payload, attempt: publicAttempt(raced, context), resumed: true }, 200, { "set-cookie": guestCookieHeader(slot.id, activeSession, secureCookie) });
        }
      }
      return json({ error: "Không thể tạo lượt thi." }, 500);
    }
    return json({ ...slotMeta(context), sections: loaded.sections, questions: prepared.questions.map(question => publicGuestQuestion(question, attempt.id)), attempt: publicAttempt({ ...attempt, answers: {}, policy_snapshot: attemptPolicy, guest_identity: identityResult.identity }, context), resumed: false }, 201, { "set-cookie": guestCookieHeader(slot.id, activeSession, secureCookie) });
  }

  if (!body.attemptId) return json({ error: "Thiếu mã lượt thi." }, 400);
  const current = await attemptForSession(admin, body.attemptId, sessionHash);
  if (!current) return json({ error: "Lượt thi không hợp lệ hoặc phiên làm bài đã hết hạn." }, 403);
  const currentPhase = slotPhase(current.slot);
  const currentDeadline = new Date(attemptDeadline(current, current.attempt)).getTime();
  const pastDeadline = Number.isFinite(currentDeadline) && Date.now() > currentDeadline + 5_000;
  if (current.attempt.status === "in_progress" && (currentPhase === "disabled" || pastDeadline)) {
    await admin.from("guest_exam_attempts").update({ status: "expired", submitted_at: new Date().toISOString(), duration_seconds: attemptDurationSeconds(current, current.attempt) }).eq("id", current.attempt.id).eq("status", "in_progress");
    if (body.action === "resume") return json({ error: "Thời gian làm bài đã kết thúc.", phase: currentPhase }, 410);
    return json({ error: "Thời gian làm bài đã kết thúc." }, 410);
  }
  if (body.action === "resume") {
    if (current.attempt.status === "in_progress") {
      const payload = await questionPayload(admin, current.attempt, current);
      return json({ ...slotMeta(current), ...payload, attempt: publicAttempt(current.attempt, current) });
    }
    return json({ ...slotMeta(current), result: await resultPayload(admin, current.attempt, current), attempt: { id: current.attempt.id, status: current.attempt.status } });
  }
  if (current.attempt.status !== "in_progress") return json({ error: "Lượt thi đã được nộp." }, 409);
  if (body.action === "progress") {
    const answers = safeAnswers(body.answers);
    const events = Array.isArray(current.attempt.monitor_events) ? current.attempt.monitor_events.slice(-99) : [];
    const event = safeMonitorEvent(body.monitorEvent);
    if (event) events.push({ type: event, at: new Date().toISOString() });
    const durationSeconds = attemptDurationSeconds(current, current.attempt);
    const progressVersion = Number.isInteger(body.progressVersion) ? Math.min(2_000_000_000, Math.max(1, Number(body.progressVersion))) : null;
    const flaggedQuestions = body.flaggedQuestions === undefined
      ? (Array.isArray(current.attempt.flagged_questions) ? current.attempt.flagged_questions : [])
      : [...new Set(body.flaggedQuestions.filter(item => typeof item === "string").map(item => item.trim()).filter(Boolean))].slice(0, 2000);
    const networkState = typeof body.networkState === "string" && ["online", "saving", "saved", "offline", "retrying", "conflict", "failed"].includes(body.networkState) ? body.networkState : "online";
    let progressUpdate = admin.from("guest_exam_attempts").update({ answers, flagged_questions: flaggedQuestions, network_state: networkState, monitor_events: events, duration_seconds: durationSeconds, ...(progressVersion ? { progress_version: progressVersion } : {}) }).eq("id", current.attempt.id).eq("status", "in_progress");
    if (progressVersion) progressUpdate = progressUpdate.lt("progress_version", progressVersion);
    const { data: saved, error } = await progressUpdate.select("id").maybeSingle();
    if (error) return json({ error: "Không thể lưu đáp án tạm thời." }, 500);
    // A missing row with a version means a newer request already won the
    // race. It is safe to report success to the debounced client.
    if (!saved && progressVersion) return json({ saved: true, stale: true });
    if (!saved) return json({ error: "Lượt thi đã kết thúc hoặc đã được nộp." }, 409);
    return json({ saved: true, deadlineAt: attemptDeadline(current, current.attempt) });
  }
  if (body.action === "submit") {
    const answerMap = safeAnswers(body.answers);
    const loaded = await loadGuestQuestions(admin, current.exam.id, Array.isArray(current.attempt.question_order) ? current.attempt.question_order : undefined, current.section?.id);
    const questions = applyGuestOrdering(loaded.questions, current.attempt.question_order, current.attempt.option_order);
    const questionIds = questions.map(question => question.id);
    const { data: keys } = questionIds.length
      ? await admin.from("exam_question_keys").select("question_id,correct_answer").in("question_id", questionIds)
      : { data: [] };
    const keyMap = snapshotKeyMap(current.attempt.answer_key_snapshot, keys ?? []);
    const scored = scoreExamQuestions(questions, answerMap, keyMap);
    const correctAnswers = scored.correctAnswers;
    const score = scored.score;
    const durationSeconds = attemptDurationSeconds(current, current.attempt);
    const submittedAt = new Date().toISOString();
    const { data: saved, error } = await admin.from("guest_exam_attempts").update({ answers: answerMap, correct_answers: correctAnswers, total_questions: questions.length, score, duration_seconds: durationSeconds, scoring_version: current.attempt.scoring_version ?? attemptPolicy(current, current.attempt).review.regradeVersion, original_score: current.attempt.original_score ?? score, original_correct_answers: current.attempt.original_correct_answers ?? correctAnswers, original_total_questions: current.attempt.original_total_questions ?? questions.length, status: "submitted", submitted_at: submittedAt }).eq("id", current.attempt.id).eq("status", "in_progress").select("id,status,submitted_at").maybeSingle();
    if (error) return json({ error: "Không thể nộp bài thi." }, 500);
    if (!saved) {
      const latest = await attemptForSession(admin, current.attempt.id, sessionHash);
      if (latest && latest.attempt.status !== "in_progress") return json({ result: await resultPayload(admin, latest.attempt, latest) });
      return json({ error: "Lượt thi đã kết thúc hoặc đã được nộp." }, 409);
    }
    const submitted = { ...current.attempt, answers: answerMap, correct_answers: correctAnswers, total_questions: questions.length, score, duration_seconds: durationSeconds, status: "submitted", submitted_at: saved.submitted_at ?? submittedAt };
    return json({ result: await resultPayload(admin, submitted, current) });
  }
  return json({ error: "Yêu cầu không hợp lệ." }, 400);
}
