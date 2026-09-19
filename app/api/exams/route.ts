import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildAnswerKeySnapshot, isExamAnswerComplete, normalizeAnswerMap, readAnswerKeySnapshot, scoreExamQuestions, scoreExamQuestionsForContext, type ExamAnswerValue } from "../../../lib/exam-answers";
import { isIndependentSubjectExamType, normalizeExamType } from "../../../lib/exam-config";
import { applyQuestionSnapshotOrder, EXAM_ATTEMPT_SELECT, EXAM_ROOM_SELECT, EXAM_SELECT, optionIdentity, questionIdsFromSnapshot } from "../../../lib/exam-content-server";
import { latexPartSequence, parseLatexQuestion } from "../../../lib/exam-latex";
import { buildHsaQuestionLoadPlan, filterHsaQuestionsForCombination, getHsaCombination, HSA_PART3_SELECTION_PENDING_KEY, HSA_SELECTION_ANSWER_KEY, type HsaCombination } from "../../../lib/hsa-exam";
import { createAttemptPolicy, examCodes, examReleaseVisibility, isExamCodeAllowed, normalizeExamCode, policyFromExamSettings, prepareQuestionIdentityForPolicy, publicExamPolicy, resolveAttemptPolicy, type ExamPolicy, type ExamPolicyMode } from "../../../lib/exam-policy";
import { safeExamMonitorEvents } from "../../../lib/exam-monitor";
import { jsonBodyError, readJsonBody } from "../../../lib/http-server";
import { ensureActiveAccount, guardExamStartRisk } from "../../../lib/security-server";

type ExamUser = { id: string; role: "student" | "admin" };
type ExamAuthentication = { ok: true; user: ExamUser } | { ok: false; response: Response };
type LoadedExamQuestion = {
  id: string;
  section_id: string;
  prompt: string;
  question_type: string;
  options: unknown[];
  points: number;
  sort_order: number;
  passage?: string | null;
  media_url?: string | null;
  instruction?: string | null;
  latex_source?: string | null;
};
const SECTION_PROGRESS_KEY = "__exam_section_progress";
const NETWORK_STATES = ["online", "saving", "saved", "offline", "retrying", "conflict", "failed"] as const;
type NetworkState = typeof NETWORK_STATES[number];

function isHsaExam(roomType: string | null | undefined, examType: string | null | undefined) {
  return normalizeExamType(roomType) === "HSA" || normalizeExamType(examType) === "HSA";
}

function scoringContext(room: { exam_type?: string | null }, exam: { exam_type?: string | null }, sections: Array<{ id: string; subject_code?: string | null; title?: string | null }>, sectionId?: string | null) {
  const section = sectionId ? sections.find(item => item.id === sectionId) : undefined;
  const examType = [room.exam_type, exam.exam_type].find(value => normalizeExamType(value) === "THPTQG") ?? exam.exam_type ?? room.exam_type;
  return { examType, subjectCode: section?.subject_code, subjectTitle: section?.title };
}

function hsaPart3SectionId(sections: Array<{ id: string; sort_order?: number | null }>) {
  return sections.find(section => section.sort_order === 2)?.id ?? sections[2]?.id;
}

function savedHsaSelectionCode(answers: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return undefined;
  const value = (answers as Record<string, unknown>)[HSA_SELECTION_ANSWER_KEY];
  return getHsaCombination(value)?.code;
}

function hsaPart3SelectionPending(answers: unknown, part3SectionId?: string | null) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return false;
  const value = (answers as Record<string, unknown>)[HSA_PART3_SELECTION_PENDING_KEY];
  return typeof value === "string" && Boolean(value) && (!part3SectionId || value === part3SectionId);
}

function snapshotRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function sectionProgress(answers: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return { sectionId: null, startedAt: null };
  const raw = (answers as Record<string, unknown>)[SECTION_PROGRESS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { sectionId: null, startedAt: null };
  const value = raw as Record<string, unknown>;
  return {
    sectionId: typeof value.sectionId === "string" ? value.sectionId : null,
    startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
  };
}

function annotateAttempt<T extends { answers?: unknown; started_at?: string | null }>(attempt: T | null | undefined, sections: Array<{ id: string }>) {
  if (!attempt) return attempt;
  const progress = sectionProgress(attempt.answers);
  const directSectionId = "section_id" in attempt && typeof attempt.section_id === "string" ? attempt.section_id : null;
  const awaitingHsaPart3Selection = hsaPart3SelectionPending(attempt.answers, progress.sectionId);
  return {
    ...attempt,
    current_section_id: directSectionId ?? progress.sectionId ?? sections[0]?.id ?? null,
    section_started_at: awaitingHsaPart3Selection ? null : progress.startedAt ?? attempt.started_at ?? null,
    hsa_part3_selection_required: awaitingHsaPart3Selection,
  };
}

function withoutSectionProgress(answers: Record<string, unknown>) {
  const clean = { ...answers };
  delete clean[SECTION_PROGRESS_KEY];
  return clean;
}

function safeFlaggedQuestions(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter(item => typeof item === "string").map(item => item.trim()).filter(Boolean))].slice(0, 2000)
    : [];
}

function safeNetworkState(value: unknown): NetworkState {
  return typeof value === "string" && (NETWORK_STATES as readonly string[]).includes(value) ? value as NetworkState : "online";
}

function optionValuesForQuestion(question: { question_type?: string | null; options?: unknown; latex_source?: string | null }) {
  if (question.latex_source?.trim()) {
    try {
      const parsed = parseLatexQuestion(question.latex_source);
      if (!["single", "multiple"].includes(parsed.questionType)) return [];
      if (parsed.options.length) return parsed.options.map((option, index) => option.value || String.fromCharCode(65 + index));
    } catch { /* structured options remain the compatibility fallback */ }
  }
  if (!["single", "multiple"].includes(String(question.question_type ?? ""))) return [];
  return (Array.isArray(question.options) ? question.options : []).map(optionIdentity);
}

function prepareAccountQuestions<T extends { id: string; question_type?: string | null; options?: unknown; latex_source?: string | null; section_id?: string | null; passage?: string | null }>(questions: T[], policy: ExamPolicy) {
  const sourceParts = policy.examType === "THPTQG" ? latexPartSequence(questions) : questions.map(() => undefined);
  const prepared = prepareQuestionIdentityForPolicy(questions.map((question, index) => ({
    ...question,
    randomizationGroup: sourceParts[index] ? `part:${sourceParts[index]}` : null,
    optionValues: optionValuesForQuestion(question),
  })), policy);
  const optionOrder = prepared.optionOrder;
  const output = prepared.questions.map(question => ({
    ...question,
    option_order: optionOrder[question.id] ?? [],
  }));
  return { questions: output, questionOrder: prepared.questionOrder, optionOrder };
}

function attemptDurationSeconds(attempt: { started_at?: string | null; time_extension_seconds?: number | null }, policy: ExamPolicy, now = Date.now()) {
  const started = new Date(attempt.started_at ?? "").getTime();
  if (!Number.isFinite(started)) return 0;
  const configured = Math.max(1, Number(policy.timing.durationMinutes) || 1) * 60;
  const extension = Math.max(0, Number(attempt.time_extension_seconds) || 0);
  return Math.max(0, Math.min(Math.floor((now - started) / 1000), configured + extension));
}

function attemptDeadline(attempt: { started_at?: string | null; time_extension_seconds?: number | null }, policy: ExamPolicy) {
  const started = new Date(attempt.started_at ?? "").getTime();
  if (!Number.isFinite(started)) return null;
  const duration = Math.max(1, Number(policy.timing.durationMinutes) || 1) * 60_000;
  const extension = Math.max(0, Number(attempt.time_extension_seconds) || 0) * 1000;
  return new Date(started + duration + extension).toISOString();
}

function snapshotKeyMap(snapshot: unknown, fallback: Array<{ question_id: string; correct_answer: unknown }> = []) {
  const saved = readAnswerKeySnapshot(snapshot);
  if (saved.size) return new Map([...saved.entries()].map(([questionId, entry]) => [questionId, entry.correct_answer]));
  return new Map(fallback.map(key => [key.question_id, key.correct_answer]));
}

function attemptQuestions<T extends { id: string; options?: unknown[] }>(questions: T[], attempt: { question_order?: unknown; option_order?: unknown }) {
  return applyQuestionSnapshotOrder(questions, attempt.question_order, attempt.option_order);
}

function questionCountsForAttempt(questions: Array<{ id: string; section_id?: string | null }>, sections: Array<{ id: string }>, attempt?: { question_order?: unknown }) {
  const order = Array.isArray(attempt?.question_order) ? attempt?.question_order.filter(item => typeof item === "string") as string[] : [];
  const source = new Map(questions.map(question => [question.id, question]));
  const selected = order.length ? order.map(id => source.get(id)).filter((question): question is { id: string; section_id?: string | null } => Boolean(question)) : questions;
  const counts: Record<string, number> = Object.fromEntries(sections.map(section => [section.id, 0]));
  selected.forEach(question => { if (question.section_id) counts[question.section_id] = (counts[question.section_id] ?? 0) + 1; });
  return counts;
}

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;
}

async function authenticate(request: Request, admin: SupabaseClient): Promise<ExamAuthentication> {
  const security = await ensureActiveAccount(request, admin);
  if (!security.ok) return { ok: false, response: security.response };
  const user: ExamUser = { id: security.user.id, role: security.profile.role === "admin" ? "admin" : "student" };
  return { ok: true, user };
}

async function canAccessRoom(admin: SupabaseClient, user: ExamUser, roomId: string) {
  const { data: room } = await admin.from("exam_rooms").select(EXAM_ROOM_SELECT).eq("id", roomId).single();
  if (!room || user.role !== "admin" && !room.published) return null;
  if (user.role === "admin" || room.access_mode === "open") return room;
  const { data: enrollment } = await admin.from("exam_room_enrollments").select("room_id").eq("room_id", roomId).eq("student_id", user.id).maybeSingle();
  return enrollment ? room : null;
}

async function loadExam(admin: SupabaseClient, user: ExamUser, examId: string, options: { sectionId?: string; includeQuestions?: boolean; mode?: ExamPolicyMode; hsaCombination?: HsaCombination; deferHsaPart3?: boolean } = {}) {
  const { data: rawExam } = await admin.from("exams").select(`${EXAM_SELECT},settings,structure_config`).eq("id", examId).single();
  if (!rawExam || user.role !== "admin" && !rawExam.published) return null;
  const room = await canAccessRoom(admin, user, rawExam.room_id);
  if (!room) return null;
  const { data: sections } = await admin.from("exam_sections").select("id,exam_id,title,duration_minutes,sort_order,subject_code").eq("exam_id", examId).order("sort_order");
  const orderedSections = sections ?? [];
  if (options.sectionId && !orderedSections.some(section => section.id === options.sectionId)) return null;
  const sectionIds = orderedSections.map(section => section.id);
  const questionSectionIds = options.sectionId ? [options.sectionId] : sectionIds;
  const questionSelect = "id,section_id,prompt,question_type,options,points,sort_order,passage,media_url,instruction,latex_source";
  let questionRows: LoadedExamQuestion[] = [];
  if (options.includeQuestions !== false && questionSectionIds.length) {
    if (options.deferHsaPart3 && !options.sectionId) {
      const loadPlan = buildHsaQuestionLoadPlan(orderedSections, null);
      const fixedResult = loadPlan.fixedSectionIds.length
        ? await admin.from("exam_questions").select(questionSelect).in("section_id", loadPlan.fixedSectionIds).order("sort_order")
        : { data: [], error: null };
      questionRows = fixedResult.data ?? [];
    } else if (options.hsaCombination && !options.sectionId) {
      const loadPlan = buildHsaQuestionLoadPlan(orderedSections, options.hsaCombination);
      const [fixedResult, subjectResults] = await Promise.all([
        loadPlan.fixedSectionIds.length
          ? admin.from("exam_questions").select(questionSelect).in("section_id", loadPlan.fixedSectionIds).order("sort_order")
          : Promise.resolve({ data: [], error: null }),
        loadPlan.part3SectionId
          ? Promise.all(loadPlan.subjects.map(subject => admin
            .from("exam_questions")
            .select(questionSelect)
            .eq("section_id", loadPlan.part3SectionId)
            .ilike("latex_source", `%hsa%subject%${subject}%`)
            .order("sort_order")))
          : Promise.resolve([]),
      ]);
      const selectedPart3Rows = subjectResults.flatMap(result => result.data ?? []);
      let legacyPart3Rows: LoadedExamQuestion[] = [];
      if (loadPlan.part3SectionId && !selectedPart3Rows.length) {
        const markerProbe = await admin
          .from("exam_questions")
          .select("id")
          .eq("section_id", loadPlan.part3SectionId)
          .ilike("latex_source", "%hsa%subject%")
          .limit(1);
        if (!markerProbe.data?.length) {
          const legacyResult = await admin
            .from("exam_questions")
            .select(questionSelect)
            .eq("section_id", loadPlan.part3SectionId)
            .order("sort_order");
          legacyPart3Rows = legacyResult.data ?? [];
        }
      }
      questionRows = [...(fixedResult.data ?? []), ...selectedPart3Rows, ...legacyPart3Rows];
    } else {
      const questionResult = await admin.from("exam_questions").select(questionSelect).in("section_id", questionSectionIds).order("sort_order");
      questionRows = questionResult.data ?? [];
    }
  }
  const sectionOrder = new Map(orderedSections.map((section, index) => [section.id, index]));
  const questions = [...questionRows].sort((left, right) => {
    const sectionDifference = (sectionOrder.get(left.section_id) ?? 0) - (sectionOrder.get(right.section_id) ?? 0);
    return sectionDifference || left.sort_order - right.sort_order;
  });
  const examSettings = (rawExam as Record<string, unknown>).settings;
  const safeExam = { ...rawExam };
  delete (safeExam as Record<string, unknown>).settings;
  delete (safeExam as Record<string, unknown>).structure_config;
  const selectedSection = options.sectionId ? orderedSections.find(section => section.id === options.sectionId) : null;
  const policy = policyFromExamSettings(examSettings, {
    examType: rawExam.exam_type,
    mode: options.mode ?? "practice",
    audience: "account",
    durationMinutes: selectedSection?.duration_minutes ?? rawExam.duration_minutes,
  });
  return { room, exam: safeExam, sections: orderedSections, questions, policy };
}

async function questionCountsForSections(admin: SupabaseClient, sectionIds: string[]) {
  const counts: Record<string, number> = Object.fromEntries(sectionIds.map(sectionId => [sectionId, 0]));
  if (!sectionIds.length) return counts;
  const { data } = await admin.from("exam_questions").select("section_id").in("section_id", sectionIds);
  for (const question of data ?? []) counts[question.section_id] = (counts[question.section_id] ?? 0) + 1;
  return counts;
}

async function questionCountsForSnapshot(admin: SupabaseClient, sections: Array<{ id: string }>, questionOrder: unknown) {
  const counts: Record<string, number> = Object.fromEntries(sections.map(section => [section.id, 0]));
  const questionIds = questionIdsFromSnapshot(questionOrder);
  if (!questionIds.length) return counts;
  const { data, error } = await admin.from("exam_questions").select("id,section_id").in("id", questionIds);
  if (error) return counts;
  for (const question of data ?? []) {
    if (question.section_id) counts[question.section_id] = (counts[question.section_id] ?? 0) + 1;
  }
  return counts;
}

const privateHeaders = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

function examPolicyMode(mode: unknown): ExamPolicyMode {
  return mode === "scheduled" ? "official" : "practice";
}

type ExamSummaryRow = Record<string, unknown> & {
  id: string;
  published?: boolean;
  exam_type?: string | null;
  mode?: string | null;
  duration_minutes?: number | null;
  settings?: unknown;
};

type PublicExamSummary = Omit<ExamSummaryRow, "settings"> & {
  section_count: number;
  max_attempts: number;
};

function publicExamSummary(exam: ExamSummaryRow, sectionCount: number): PublicExamSummary {
  const { settings: _settings, ...safeExam } = exam;
  const policy = policyFromExamSettings(exam.settings, {
    examType: exam.exam_type,
    mode: examPolicyMode(exam.mode),
    durationMinutes: exam.duration_minutes,
  });
  return {
    ...safeExam,
    section_count: Math.max(0, sectionCount),
    max_attempts: policy.access.maxAttempts,
  };
}

function publicAttemptWithPolicy(attempt: Record<string, unknown> | null | undefined, fallback: ExamPolicy) {
  if (!attempt) return attempt;
  const policy = resolveAttemptPolicy(attempt.policy_snapshot, fallback);
  const safeAttempt = { ...attempt };
  delete safeAttempt.policy_snapshot;
  delete safeAttempt.policy_version;
  delete safeAttempt.answer_key_snapshot;
  const deadlineAt = attemptDeadline({
    started_at: typeof attempt.started_at === "string" ? attempt.started_at : null,
    time_extension_seconds: typeof attempt.time_extension_seconds === "number" ? attempt.time_extension_seconds : Number(attempt.time_extension_seconds) || 0,
  }, policy);
  if (deadlineAt) safeAttempt.deadline_at = deadlineAt;
  return { ...safeAttempt, policy: publicExamPolicy(policy) };
}

function publicResultAttempt(attempt: Record<string, unknown>, fallback: ExamPolicy, releasedAt?: string | null) {
  const policy = resolveAttemptPolicy(attempt.policy_snapshot, fallback);
  const visibility = examReleaseVisibility(policy, attempt, { releasedAt, slotEndsAt: policy.timing.closesAt });
  const safeAttempt = { ...attempt };
  delete safeAttempt.policy_snapshot;
  delete safeAttempt.policy_version;
  delete safeAttempt.answer_key_snapshot;
  delete safeAttempt.answers;
  if (!visibility.scoreVisible) {
    safeAttempt.score = null;
    safeAttempt.correct_answers = null;
  }
  return {
    ...safeAttempt,
    policy: publicExamPolicy(policy),
    result_visibility: visibility,
  };
}

export async function GET(request: Request) {
  const admin = serverClient();
  if (!admin) return Response.json({ error: "Chưa cấu hình máy chủ khảo thí." }, { status: 503 });
  const authentication = await authenticate(request, admin);
  if (!authentication.ok) return authentication.response;
  const user = authentication.user;
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope") ?? "rooms";

  if (scope === "history") {
    const { data: attempts, error } = await admin
      .from("exam_attempts")
      .select("id,title,score,correct_answers,total_questions,submitted_at,status,exam_id,section_id,started_at,duration_seconds,exam_code,scoring_version,original_score,original_correct_answers,original_total_questions,mode,policy_snapshot,time_extension_seconds")
      .eq("student_id", user.id)
      .order("submitted_at", { ascending: false });
    if (error) return Response.json({ error: "Không thể tải lịch sử làm bài." }, { status: 503, headers: privateHeaders });
    const examIds = [...new Set((attempts ?? []).map(attempt => attempt.exam_id).filter(Boolean))];
    const exams = examIds.length
      ? (await admin.from("exams").select("id,exam_type,duration_minutes,settings,results_released_at").in("id", examIds)).data ?? []
      : [];
    const examById = new Map(exams.map(exam => [exam.id, exam]));
    return Response.json({ attempts: (attempts ?? []).map(attempt => {
      const exam = examById.get(attempt.exam_id);
      const fallback = policyFromExamSettings(exam?.settings, { examType: exam?.exam_type, mode: attempt.mode === "exam" ? "official" : "practice", durationMinutes: exam?.duration_minutes });
      return { ...publicResultAttempt(attempt, fallback, exam?.results_released_at), exam_type: exam?.exam_type ?? null };
    }) }, { headers: privateHeaders });
  }

  if (scope === "rooms") {
    const { data: rows, error } = await admin.from("exam_rooms").select(EXAM_ROOM_SELECT).order("sort_order").order("created_at");
    if (error) return Response.json({ error: "Chưa có cấu trúc dữ liệu phòng khảo thí." }, { status: 503, headers: privateHeaders });
    const candidateRooms = user.role === "admin" ? rows ?? [] : (rows ?? []).filter(room => room.published);
    const assignedIds = user.role === "admin" ? [] : (await admin.from("exam_room_enrollments").select("room_id").eq("student_id", user.id)).data?.map(row => row.room_id) ?? [];
    const rooms = candidateRooms.filter(room => room.access_mode === "open" || assignedIds.includes(room.id) || user.role === "admin");
    const roomIds = rooms.map(room => room.id);
    const exams = roomIds.length ? (await admin.from("exams").select("id,room_id,title,exam_type,mode,duration_minutes,published,results_released_at,sort_order,settings").in("room_id", roomIds).order("sort_order")).data ?? [] : [];
    const examIds = exams.map(exam => exam.id);
    const sectionRows = examIds.length
      ? (await admin.from("exam_sections").select("exam_id").in("exam_id", examIds)).data ?? []
      : [];
    const sectionCounts = new Map<string, number>();
    for (const section of sectionRows) sectionCounts.set(section.exam_id, (sectionCounts.get(section.exam_id) ?? 0) + 1);
    const safeExams = exams.map(exam => publicExamSummary(exam, sectionCounts.get(exam.id) ?? 0));
    const attempts = examIds.length ? (await admin.from("exam_attempts").select("id,exam_id,section_id,title,status,score,correct_answers,total_questions,submitted_at,started_at,duration_seconds,mode,policy_snapshot").eq("student_id", user.id).in("exam_id", examIds).order("started_at", { ascending: false })).data ?? [] : [];
    const examById = new Map(exams.map(exam => [exam.id, exam]));
    const safeAttempts = attempts.map(attempt => {
      const exam = examById.get(attempt.exam_id);
      return publicResultAttempt(attempt, policyFromExamSettings(exam?.settings, { examType: exam?.exam_type, mode: attempt.mode === "exam" ? "official" : "practice", durationMinutes: exam?.duration_minutes }), exam?.results_released_at);
    });
    return Response.json({ rooms, exams: user.role === "admin" ? safeExams : safeExams.filter(exam => exam.published), attempts: safeAttempts }, { headers: privateHeaders });
  }

  if (scope === "room") {
    const roomId = params.get("roomId") ?? "";
    const room = await canAccessRoom(admin, user, roomId);
    if (!room) return Response.json({ error: "Không tìm thấy phòng thi hoặc bạn chưa được cấp quyền." }, { status: 404 });
    const { data: examRows } = await admin.from("exams").select("id,room_id,title,description,exam_type,mode,duration_minutes,published,results_released_at,sort_order,created_at,settings").eq("room_id", roomId).order("sort_order");
    const rawExams = examRows ?? [];
    const examIds = rawExams.map(exam => exam.id);
    const sections = examIds.length
      ? (await admin.from("exam_sections").select("id,exam_id,title,duration_minutes,sort_order,subject_code").in("exam_id", examIds).order("sort_order")).data ?? []
      : [];
    const sectionCounts = new Map<string, number>();
    for (const section of sections) sectionCounts.set(section.exam_id, (sectionCounts.get(section.exam_id) ?? 0) + 1);
    const projectedExams = rawExams.map(exam => publicExamSummary(exam, sectionCounts.get(exam.id) ?? 0));
    const visibleProjectedExams = user.role === "admin" ? projectedExams : projectedExams.filter(exam => exam.published);
    const attempts = examIds.length ? (await admin.from("exam_attempts").select("id,exam_id,section_id,status,score,correct_answers,total_questions,submitted_at,started_at,duration_seconds,mode,policy_snapshot").eq("student_id", user.id).in("exam_id", examIds).order("started_at", { ascending: false })).data ?? [] : [];
    const examById = new Map((examRows ?? []).map(exam => [exam.id, exam]));
    const safeAttempts = attempts.map(attempt => {
      const exam = examById.get(attempt.exam_id);
      return publicResultAttempt(attempt, policyFromExamSettings(exam?.settings, { examType: exam?.exam_type, mode: attempt.mode === "exam" ? "official" : "practice", durationMinutes: exam?.duration_minutes }), exam?.results_released_at);
    });
    return Response.json({ room, exams: visibleProjectedExams, sections, attempts: safeAttempts }, { headers: privateHeaders });
  }

  if (scope === "exam") {
    const requestedMode: ExamPolicyMode = params.get("mode") === "exam" ? "official" : "practice";
    const bundle = await loadExam(admin, user, params.get("examId") ?? "", {
      sectionId: params.get("sectionId") || undefined,
      mode: requestedMode,
      // The learner-facing exam shell must never contain question content.
      // Admin authoring has its own protected surface; keeping this projection
      // metadata-only also prevents an admin session from exposing raw LaTeX
      // when the exam-taking route is inspected in DevTools.
      includeQuestions: false,
    });
    if (!bundle) return Response.json({ error: "Không tìm thấy đề thi hoặc bạn chưa được cấp quyền." }, { status: 404 });
    let questionCounts = await questionCountsForSections(admin, bundle.sections.map(section => section.id));
    const isThptqg = isIndependentSubjectExamType(bundle.room.exam_type) || isIndependentSubjectExamType(bundle.exam.exam_type);
    const isHsa = isHsaExam(bundle.room.exam_type, bundle.exam.exam_type);
    let activeQuery = admin.from("exam_attempts").select("id,exam_id,section_id,answers,question_order,option_order,flagged_questions,exam_code,progress_version,time_extension_seconds,network_state,monitor_events,started_at,duration_seconds,status,mode,policy_snapshot,policy_version").eq("student_id", user.id).eq("exam_id", bundle.exam.id).eq("status", "in_progress").order("started_at", { ascending: false });
    if (isThptqg) {
      if (params.get("sectionId")) activeQuery = activeQuery.eq("section_id", params.get("sectionId"));
    } else {
      activeQuery = activeQuery.is("section_id", null);
    }
    const activeRows = (await activeQuery.limit(isThptqg && !params.get("sectionId") ? 100 : 1)).data ?? [];
    const activeAttempt = activeRows[0] ?? null;
    if (isHsa && activeAttempt) {
      questionCounts = await questionCountsForSnapshot(admin, bundle.sections, activeAttempt.question_order);
      const part3SectionId = hsaPart3SectionId(bundle.sections);
      if (part3SectionId && hsaPart3SelectionPending(activeAttempt.answers, part3SectionId)) {
        const rawCounts = await questionCountsForSections(admin, [part3SectionId]);
        questionCounts[part3SectionId] = rawCounts[part3SectionId] || 50;
      }
    }
    if (isThptqg) {
      const { data: subjectAttempts } = await admin.from("exam_attempts").select("id,exam_id,section_id,status,score,correct_answers,total_questions,submitted_at,started_at,duration_seconds,exam_code,scoring_version,mode,policy_snapshot").eq("student_id", user.id).eq("exam_id", bundle.exam.id).order("started_at", { ascending: false });
      const safeSubjectAttempts = (subjectAttempts ?? []).map(attempt => publicResultAttempt(attempt, bundle.policy, bundle.exam.results_released_at));
      return Response.json({ ...bundle, policy: publicExamPolicy(bundle.policy), questionCounts, activeAttempt: publicAttemptWithPolicy(annotateAttempt(activeAttempt, bundle.sections), bundle.policy), subjectAttempts: safeSubjectAttempts }, { headers: privateHeaders });
    }
    return Response.json({ ...bundle, policy: publicExamPolicy(bundle.policy), questionCounts, activeAttempt: publicAttemptWithPolicy(annotateAttempt(activeAttempt, bundle.sections), bundle.policy) }, { headers: privateHeaders });
  }

  if (scope === "result") {
    const attemptId = params.get("attemptId") ?? "";
    const { data: attempt } = await admin.from("exam_attempts").select(EXAM_ATTEMPT_SELECT).eq("id", attemptId).single();
    if (!attempt || attempt.student_id !== user.id && user.role !== "admin" || attempt.status === "in_progress") return Response.json({ error: "Không tìm thấy kết quả bài thi." }, { status: 404 });
    const shell = await loadExam(admin, user, attempt.exam_id, { includeQuestions: false });
    if (!shell) return Response.json({ error: "Không tìm thấy đề thi." }, { status: 404 });
    const isThptqg = isIndependentSubjectExamType(shell.room.exam_type) || isIndependentSubjectExamType(shell.exam.exam_type);
    const bundle = await loadExam(admin, user, attempt.exam_id, { sectionId: isThptqg ? attempt.section_id ?? undefined : undefined, mode: attempt.mode === "exam" ? "official" : "practice" });
    if (!bundle) return Response.json({ error: "Không tìm thấy đề thi." }, { status: 404 });
    const orderedQuestions = attemptQuestions(bundle.questions, attempt);
    const questionIds = orderedQuestions.map(question => question.id);
    const keys = questionIds.length ? (await admin.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", questionIds)).data ?? [] : [];
    const answerMap = attempt.answers && typeof attempt.answers === "object" && !Array.isArray(attempt.answers)
      ? attempt.answers as Record<string, unknown>
      : {};
    const submittedAnswers = withoutSectionProgress(answerMap);
    const keyMap = snapshotKeyMap(attempt.answer_key_snapshot, keys);
     const scored = scoreExamQuestionsForContext(orderedQuestions, submittedAnswers, keyMap, scoringContext(bundle.room, bundle.exam, bundle.sections, attempt.section_id));
     const isRegraded = Number(attempt.scoring_version ?? 1) > 1;
     const correctAnswers = isRegraded ? Number(attempt.correct_answers ?? scored.correctAnswers) : scored.correctAnswers;
     const score = isRegraded ? Number(attempt.score ?? scored.score) : scored.score;
    const totalQuestions = isRegraded ? Number(attempt.total_questions ?? orderedQuestions.length) : orderedQuestions.length;
     const projectedAttempt = { ...attempt, correct_answers: correctAnswers, total_questions: totalQuestions, score };
     const safeAttempt = publicResultAttempt(projectedAttempt, bundle.policy, bundle.exam.results_released_at);
    return Response.json({ room: bundle.room, exam: bundle.exam, sections: bundle.sections, attempt: safeAttempt }, { headers: privateHeaders });
  }

  return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
}

export async function POST(request: Request) {
  const admin = serverClient();
  if (!admin) return Response.json({ error: "Chưa cấu hình máy chủ khảo thí." }, { status: 503 });
  const authentication = await authenticate(request, admin);
  if (!authentication.ok) return authentication.response;
  const user = authentication.user;
  const parsedBody = await readJsonBody<{ action?: "start" | "progress" | "submit" | "submit_section"; examId?: string; attemptId?: string; sectionId?: string; mode?: "practice" | "exam"; examCode?: string; hsaSelectionCode?: string; answers?: Record<string, ExamAnswerValue>; flaggedQuestions?: string[]; networkState?: string; progressVersion?: number; monitorEvent?: string; monitorEvents?: string[] }>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400 });
  const body = {
    ...parsedBody.body,
    answers: parsedBody.body.answers === undefined ? undefined : normalizeAnswerMap(parsedBody.body.answers),
  };

  if (body.action === "start" && body.examId) {
    if (user.role !== "admin") {
      const riskGuard = await guardExamStartRisk(admin, user.id, request);
      if (!riskGuard.ok) return riskGuard.response;
    }
    const requestedMode: ExamPolicyMode = body.mode === "exam" ? "official" : "practice";
    const examShell = await loadExam(admin, user, body.examId, { includeQuestions: false, mode: requestedMode });
    if (!examShell) return Response.json({ error: "Đề thi không tồn tại hoặc chưa được mở." }, { status: 404 });
    const policyNow = Date.now();
    const policyOpens = examShell.policy.timing.opensAt ? new Date(examShell.policy.timing.opensAt).getTime() : NaN;
    const policyCloses = examShell.policy.timing.closesAt ? new Date(examShell.policy.timing.closesAt).getTime() : NaN;
    if (Number.isFinite(policyOpens) && policyNow < policyOpens) return Response.json({ error: "Đề thi chưa mở.", opensAt: examShell.policy.timing.opensAt }, { status: 409 });
    if (Number.isFinite(policyCloses) && policyNow > policyCloses + Math.max(0, examShell.policy.timing.gracePeriodMinutes) * 60_000) return Response.json({ error: "Đề thi đã đóng.", closesAt: examShell.policy.timing.closesAt }, { status: 410 });
    const isThptqg = isIndependentSubjectExamType(examShell.room.exam_type) || isIndependentSubjectExamType(examShell.exam.exam_type);
    const isHsa = isHsaExam(examShell.room.exam_type, examShell.exam.exam_type);
    const requestedHsaCombination = getHsaCombination(body.hsaSelectionCode);
    if (isThptqg && !body.sectionId) return Response.json({ error: "Hãy chọn môn thi trước khi bắt đầu." }, { status: 400 });
    // The server creates the immutable question/option permutation before the
    // first content request. The question body never crosses this route; it is
    // only used to create the snapshot consumed by the encrypted content API.
    const bundle = await loadExam(admin, user, body.examId, { sectionId: isThptqg ? body.sectionId : undefined, includeQuestions: true, mode: requestedMode, deferHsaPart3: isHsa });
    if (!bundle) return Response.json({ error: "Đề thi không tồn tại hoặc chưa được mở." }, { status: 404 });
    const selectedQuestions = bundle.questions;
    let existingQuery = admin.from("exam_attempts").select(EXAM_ATTEMPT_SELECT).eq("student_id", user.id).eq("exam_id", body.examId).eq("status", "in_progress").order("started_at", { ascending: false });
    if (isThptqg) existingQuery = existingQuery.eq("section_id", body.sectionId);
    else existingQuery = existingQuery.is("section_id", null);
    const { data: existing } = await existingQuery.limit(1).maybeSingle();
    if (existing) {
      if (existing.mode && (existing.mode === "exam" ? "official" : "practice") !== requestedMode) return Response.json({ error: "Bạn đang có một lượt thi ở chế độ khác. Hãy hoàn tất hoặc thoát lượt hiện tại trước." }, { status: 409 });
      const part3SectionId = hsaPart3SectionId(bundle.sections);
      if (isHsa && hsaPart3SelectionPending(existing.answers, part3SectionId)) {
        if (!requestedHsaCombination) return Response.json({ error: "Hãy chọn tổ hợp HSA cho Phần 3 trước khi bắt đầu." }, { status: 400 });
        const selectedBundle = await loadExam(admin, user, body.examId, { includeQuestions: true, mode: requestedMode, hsaCombination: requestedHsaCombination });
        if (!selectedBundle || !part3SectionId) return Response.json({ error: "Không thể tải Phần 3 của đề thi." }, { status: 404 });
        const selectedPart3Questions = filterHsaQuestionsForCombination(selectedBundle.questions, requestedHsaCombination, part3SectionId)
          .filter(question => question.section_id === part3SectionId);
        if (!selectedPart3Questions.length) return Response.json({ error: `Tổ hợp ${requestedHsaCombination.code} chưa có câu hỏi đã xuất bản.` }, { status: 409 });

        const existingPolicy = resolveAttemptPolicy(existing.policy_snapshot, selectedBundle.policy);
        const preparedPart3 = prepareAccountQuestions(selectedPart3Questions, existingPolicy);
        const preparedPart3QuestionIds = preparedPart3.questions.map(question => question.id);
        const { data: part3Keys, error: part3KeysError } = preparedPart3QuestionIds.length
          ? await admin.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", preparedPart3QuestionIds)
          : { data: [], error: null };
        if (part3KeysError) return Response.json({ error: "Không thể chuẩn bị đáp án cho Phần 3." }, { status: 503 });

        const existingQuestionOrder = questionIdsFromSnapshot(existing.question_order);
        const existingOptionOrder = snapshotRecord(existing.option_order);
        const existingAnswerKeySnapshot = snapshotRecord(existing.answer_key_snapshot);
        const part3AnswerKeySnapshot = buildAnswerKeySnapshot(part3Keys ?? []);
        const finalizedAnswers = snapshotRecord(existing.answers);
        delete finalizedAnswers[HSA_PART3_SELECTION_PENDING_KEY];
        finalizedAnswers[HSA_SELECTION_ANSWER_KEY] = requestedHsaCombination.code;
        finalizedAnswers[SECTION_PROGRESS_KEY] = { sectionId: part3SectionId, startedAt: new Date().toISOString() };
        const { data: finalized, error: finalizeError } = await admin.from("exam_attempts").update({
          answers: finalizedAnswers,
          question_order: [...existingQuestionOrder, ...preparedPart3.questionOrder],
          option_order: { ...existingOptionOrder, ...preparedPart3.optionOrder },
          answer_key_snapshot: { ...existingAnswerKeySnapshot, ...part3AnswerKeySnapshot },
          total_questions: existingQuestionOrder.length + preparedPart3.questionOrder.length,
          progress_version: Number(existing.progress_version ?? 0) + 1,
        }).eq("id", existing.id).eq("status", "in_progress").contains("answers", { [HSA_PART3_SELECTION_PENDING_KEY]: part3SectionId }).select(EXAM_ATTEMPT_SELECT).maybeSingle();
        if (finalizeError) return Response.json({ error: "Không thể bắt đầu Phần 3." }, { status: 500 });
        if (!finalized) {
          const latest = (await admin.from("exam_attempts").select(EXAM_ATTEMPT_SELECT).eq("id", existing.id).maybeSingle()).data;
          const latestCode = savedHsaSelectionCode(latest?.answers);
          if (!latest || latest.status !== "in_progress" || latestCode !== requestedHsaCombination.code) {
            return Response.json({ error: "Trạng thái Phần 3 đã thay đổi, hãy tải lại trang." }, { status: 409 });
          }
          const latestAnnotated = annotateAttempt(latest, selectedBundle.sections);
          const latestPublic = publicAttemptWithPolicy(latestAnnotated, existingPolicy);
          const latestCounts = await questionCountsForSnapshot(admin, selectedBundle.sections, latest.question_order);
          return Response.json({ attempt: latestPublic, policy: latestPublic?.policy, resumed: true, hsaSelectionCode: latestCode, contentManifest: { activeSectionId: latestAnnotated?.current_section_id ?? part3SectionId, questionCounts: latestCounts } }, { headers: privateHeaders });
        }
        const finalizedAnnotated = annotateAttempt(finalized, selectedBundle.sections);
        const finalizedPublic = publicAttemptWithPolicy(finalizedAnnotated, existingPolicy);
        const finalizedCounts = await questionCountsForSnapshot(admin, selectedBundle.sections, finalized.question_order);
        return Response.json({ attempt: finalizedPublic, policy: finalizedPublic?.policy, resumed: true, hsaSelectionCode: requestedHsaCombination.code, contentManifest: { activeSectionId: finalizedAnnotated?.current_section_id ?? part3SectionId, questionCounts: finalizedCounts } }, { headers: privateHeaders });
      }
      if (isHsa && existing.answers && typeof existing.answers === "object" && !Array.isArray(existing.answers)) {
        const existingCombination = getHsaCombination((existing.answers as Record<string, unknown>)[HSA_SELECTION_ANSWER_KEY]);
        if (requestedHsaCombination && existingCombination && existingCombination.code !== requestedHsaCombination.code) {
          return Response.json({ error: `Bạn đang có lượt thi HSA theo tổ hợp ${existingCombination.code}. Hãy tiếp tục lượt hiện tại hoặc nộp bài trước khi chọn tổ hợp khác.` }, { status: 409 });
        }
      }
      const annotated = annotateAttempt(existing, bundle.sections);
      const existingPublic = publicAttemptWithPolicy(annotated, bundle.policy);
      const existingCounts = await questionCountsForSnapshot(admin, bundle.sections, existing.question_order);
      return Response.json({
        attempt: existingPublic,
        policy: existingPublic?.policy,
        resumed: true,
        hsaSelectionCode: isHsa ? savedHsaSelectionCode(existing.answers) : undefined,
        contentManifest: { activeSectionId: annotated?.current_section_id ?? bundle.sections[0]?.id ?? null, questionCounts: existingCounts },
      }, { headers: privateHeaders });
    }
    const attemptPolicyBase = bundle.policy;
    let requestedExamCode = normalizeExamCode(body.examCode);
    if (attemptPolicyBase.randomization.randomizationMode === "exam_code") {
      if (body.examCode && !isExamCodeAllowed(attemptPolicyBase, body.examCode)) return Response.json({ error: "Mã đề không hợp lệ." }, { status: 400 });
      requestedExamCode = requestedExamCode ?? examCodes(attemptPolicyBase)[0] ?? null;
    } else {
      requestedExamCode = null;
    }
    const attemptPolicy = createAttemptPolicy(attemptPolicyBase, { examCode: requestedExamCode });
    const prepared = prepareAccountQuestions(selectedQuestions, attemptPolicy);
    const preparedQuestionIds = prepared.questions.map(question => question.id);
    const { data: preparedKeys, error: preparedKeysError } = preparedQuestionIds.length
      ? await admin.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", preparedQuestionIds)
      : { data: [], error: null };
    if (preparedKeysError) return Response.json({ error: "KhÃ´ng thá»ƒ chuáº©n bá»‹ Ä‘Ã¡p Ã¡n cho lÆ°á»£t thi." }, { status: 503 });
    const answerKeySnapshot = buildAnswerKeySnapshot(preparedKeys ?? []);
    const preparedCounts = Object.fromEntries(bundle.sections.map(section => [section.id, 0]));
    prepared.questions.forEach(question => { if (question.section_id) preparedCounts[question.section_id] = (preparedCounts[question.section_id] ?? 0) + 1; });
    const totalQuestionCount = prepared.questions.length;
    if (attemptPolicy.access.maxAttempts > 0) {
      let countQuery = admin.from("exam_attempts").select("id", { count: "exact", head: true }).eq("student_id", user.id).eq("exam_id", body.examId).neq("status", "in_progress");
      if (isThptqg) countQuery = countQuery.eq("section_id", body.sectionId);
      else countQuery = countQuery.is("section_id", null);
      const { count, error: countError } = await countQuery;
      if (countError) return Response.json({ error: "Không thể kiểm tra số lượt làm bài." }, { status: 503 });
      if ((count ?? 0) >= attemptPolicy.access.maxAttempts) {
        const grant = await admin.rpc("consume_exam_attempt_grant", { target_exam_id: body.examId, target_slot_id: null, target_student_id: user.id, target_client_hash: null });
        if (grant.error || !grant.data?.[0]?.allowed) return Response.json({ error: "Bạn đã dùng hết số lượt làm bài của đề thi." }, { status: 409 });
      }
    }
    const sectionStartedAt = new Date().toISOString();
    const initialAnswers = isThptqg
      ? {}
      : {
        [SECTION_PROGRESS_KEY]: { sectionId: bundle.sections[0]?.id ?? null, startedAt: sectionStartedAt },
      };
    const { data: attempt, error } = await admin.from("exam_attempts").insert({
      student_id: user.id,
      exam_id: body.examId,
      section_id: isThptqg ? body.sectionId : null,
      title: bundle.exam.title,
      mode: body.mode === "exam" ? "exam" : "practice",
      status: "in_progress",
      score: 0,
      correct_answers: 0,
      total_questions: totalQuestionCount,
      answers: initialAnswers,
      question_order: prepared.questionOrder,
      option_order: prepared.optionOrder,
      flagged_questions: [],
      exam_code: attemptPolicy.examCode,
      progress_version: 0,
      time_extension_seconds: 0,
      network_state: "online",
      scoring_version: attemptPolicy.review.regradeVersion,
      answer_key_snapshot: answerKeySnapshot,
      monitor_events: [],
      policy_snapshot: attemptPolicy,
      policy_version: attemptPolicy.version,
      submitted_at: null,
    }).select(EXAM_ATTEMPT_SELECT).single();
    if (error || !attempt) {
      // The active-attempt unique index is the final arbiter when two tabs
      // start at the same time. Re-read its winner instead of surfacing a
      // misleading 500 to the candidate.
      if (error?.code === "23505" || /unique|duplicate/i.test(error?.message ?? "")) {
        let racedQuery = admin.from("exam_attempts").select(EXAM_ATTEMPT_SELECT).eq("student_id", user.id).eq("exam_id", body.examId).eq("status", "in_progress").order("started_at", { ascending: false });
        if (isThptqg) racedQuery = racedQuery.eq("section_id", body.sectionId);
        else racedQuery = racedQuery.is("section_id", null);
        const raced = (await racedQuery.limit(1).maybeSingle()).data;
        if (raced) {
          const racedAttempt = annotateAttempt(raced, bundle.sections);
          const racedPublic = publicAttemptWithPolicy(racedAttempt, bundle.policy);
          const racedCounts = await questionCountsForSnapshot(admin, bundle.sections, raced.question_order);
          return Response.json({ attempt: racedPublic, policy: racedPublic?.policy, resumed: true, hsaSelectionCode: isHsa ? savedHsaSelectionCode(raced.answers) : undefined, contentManifest: { activeSectionId: racedAttempt?.current_section_id ?? bundle.sections[0]?.id ?? null, questionCounts: racedCounts } }, { headers: privateHeaders });
        }
      }
      return Response.json({ error: "Không thể khởi tạo lượt thi." }, { status: 500 });
    }
    const annotated = annotateAttempt(attempt, bundle.sections);
    return Response.json({
      attempt: publicAttemptWithPolicy(annotated, attemptPolicy),
      policy: publicExamPolicy(attemptPolicy),
      resumed: false,
      hsaSelectionCode: undefined,
      contentManifest: { activeSectionId: annotated?.current_section_id ?? bundle.sections[0]?.id ?? null, questionCounts: preparedCounts },
    }, { headers: privateHeaders });
  }

  if (body.action === "progress" && body.attemptId && body.answers !== undefined) {
    const { data: attempt } = await admin.from("exam_attempts").select("id,student_id,section_id,answers,policy_snapshot,started_at,status,progress_version,flagged_questions,monitor_events,network_state,time_extension_seconds").eq("id", body.attemptId).single();
    if (!attempt || attempt.student_id !== user.id || attempt.status !== "in_progress") return Response.json({ error: "Lượt thi không hợp lệ hoặc đã nộp." }, { status: 409 });
    if (attempt.section_id && body.sectionId && attempt.section_id !== body.sectionId) return Response.json({ error: "Môn thi không khớp với lượt thi." }, { status: 409 });
    const fallbackPolicy = policyFromExamSettings({}, { durationMinutes: 90 });
    const progressPolicy = resolveAttemptPolicy(attempt.policy_snapshot, fallbackPolicy);
    const progressDeadline = attemptDeadline(attempt, progressPolicy);
    if (progressDeadline && Date.now() > new Date(progressDeadline).getTime() + 5_000) {
      return Response.json({ error: "Thời gian làm bài đã kết thúc.", deadlineAt: progressDeadline }, { status: 410, headers: privateHeaders });
    }
    const previousAnswers = attempt.answers && typeof attempt.answers === "object" && !Array.isArray(attempt.answers) ? attempt.answers as Record<string, unknown> : {};
    const mergedAnswers = {
      ...previousAnswers,
      ...body.answers,
      ...(!attempt.section_id && previousAnswers[SECTION_PROGRESS_KEY] ? { [SECTION_PROGRESS_KEY]: previousAnswers[SECTION_PROGRESS_KEY] } : {}),
      ...(previousAnswers[HSA_SELECTION_ANSWER_KEY] ? { [HSA_SELECTION_ANSWER_KEY]: previousAnswers[HSA_SELECTION_ANSWER_KEY] } : {}),
      ...(previousAnswers[HSA_PART3_SELECTION_PENDING_KEY] ? { [HSA_PART3_SELECTION_PENDING_KEY]: previousAnswers[HSA_PART3_SELECTION_PENDING_KEY] } : {}),
    };
    const flaggedQuestions = body.flaggedQuestions === undefined ? safeFlaggedQuestions(attempt.flagged_questions) : safeFlaggedQuestions(body.flaggedQuestions);
    const events = Array.isArray(attempt.monitor_events) ? attempt.monitor_events.slice(-199) : [];
    const monitorEvents = safeExamMonitorEvents(body.monitorEvents ?? body.monitorEvent);
    const eventTime = new Date().toISOString();
    for (const monitorEvent of monitorEvents) events.push({ type: monitorEvent, at: eventTime });
    const boundedMonitorEvents = events.slice(-200);
    const requestedVersion = Number.isInteger(body.progressVersion) ? Math.min(2_000_000_000, Math.max(1, Number(body.progressVersion))) : null;
    const durationSeconds = attemptDurationSeconds(attempt, progressPolicy);
    const update = { answers: mergedAnswers, flagged_questions: flaggedQuestions, monitor_events: boundedMonitorEvents, network_state: safeNetworkState(body.networkState), duration_seconds: durationSeconds, ...(requestedVersion ? { progress_version: requestedVersion } : {}) };
    let progressQuery = admin.from("exam_attempts").update(update).eq("id", attempt.id).eq("status", "in_progress");
    if (requestedVersion) progressQuery = progressQuery.lt("progress_version", requestedVersion);
    const { data: saved, error } = await progressQuery.select("id,progress_version,network_state").maybeSingle();
    if (error) return Response.json({ error: "Không thể lưu đáp án tạm." }, { status: 500 });
    if (!saved && requestedVersion) return Response.json({ saved: true, stale: true, progressVersion: requestedVersion }, { headers: privateHeaders });
    if (!saved) return Response.json({ error: "Lượt thi đã được nộp hoặc không còn hoạt động." }, { status: 409 });
    return Response.json({ saved: true, progressVersion: saved.progress_version, networkState: "saved", deadlineAt: progressDeadline }, { headers: privateHeaders });
  }

  if (body.action === "submit_section" && body.attemptId && body.sectionId && body.answers) {
    const { data: attempt } = await admin.from("exam_attempts").select(EXAM_ATTEMPT_SELECT).eq("id", body.attemptId).single();
    if (!attempt || attempt.student_id !== user.id || attempt.status !== "in_progress") return Response.json({ error: "Lượt thi không hợp lệ hoặc đã nộp." }, { status: 409 });
    const bundle = await loadExam(admin, user, attempt.exam_id, { mode: attempt.mode === "exam" ? "official" : "practice", includeQuestions: true });
    if (!bundle) return Response.json({ error: "Không tìm thấy đề thi." }, { status: 404 });
    const isThptqg = isIndependentSubjectExamType(bundle.room.exam_type) || isIndependentSubjectExamType(bundle.exam.exam_type);
    const isHsa = isHsaExam(bundle.room.exam_type, bundle.exam.exam_type);
    if (isThptqg || attempt.section_id) return Response.json({ error: "THPTQG nộp kết quả theo từng môn, không chuyển phần trong cùng lượt thi." }, { status: 400 });
    const orderedAllQuestions = attemptQuestions(bundle.questions, attempt);
    const attemptPolicy = resolveAttemptPolicy(attempt.policy_snapshot, bundle.policy);
    const sectionIndex = bundle.sections.findIndex(section => section.id === body.sectionId);
    if (sectionIndex < 0) return Response.json({ error: "Phần thi không hợp lệ." }, { status: 400 });
    const currentProgress = sectionProgress(attempt.answers);
    const currentSectionIndex = currentProgress.sectionId
      ? bundle.sections.findIndex(section => section.id === currentProgress.sectionId)
      : 0;
    if (currentSectionIndex >= 0 && currentSectionIndex !== sectionIndex) return Response.json({ error: "Phần thi hiện tại đã thay đổi, hãy tải lại trang." }, { status: 409 });

    const previousAnswers = attempt.answers && typeof attempt.answers === "object" && !Array.isArray(attempt.answers) ? attempt.answers as Record<string, unknown> : {};
    const mergedAnswers = { ...previousAnswers, ...body.answers };
    const durationSeconds = attemptDurationSeconds(attempt, attemptPolicy);
    const deadlineAt = attemptDeadline(attempt, attemptPolicy);
    const deadlineExpired = Boolean(deadlineAt && Date.now() > new Date(deadlineAt).getTime());
    const nextSection = bundle.sections[sectionIndex + 1];
    if (nextSection && !deadlineExpired) {
      if (attemptPolicy.navigation.requireAnswerBeforeNext) {
        const currentQuestions = orderedAllQuestions.filter(question => question.section_id === body.sectionId);
        const missing = currentQuestions.some(question => !isExamAnswerComplete(question, body.answers?.[question.id]));
        if (missing) return Response.json({ error: "Hãy trả lời đầy đủ phần hiện tại trước khi chuyển phần." }, { status: 409 });
      }
      const part3SectionId = hsaPart3SectionId(bundle.sections);
      if (isHsa && part3SectionId === nextSection.id) {
        const part3QuestionIds = new Set(bundle.questions.filter(question => question.section_id === part3SectionId).map(question => question.id));
        const fixedQuestionOrder = questionIdsFromSnapshot(attempt.question_order).filter(questionId => !part3QuestionIds.has(questionId));
        const existingOptionOrder = snapshotRecord(attempt.option_order);
        const fixedOptionOrder = Object.fromEntries(Object.entries(existingOptionOrder).filter(([questionId]) => !part3QuestionIds.has(questionId)));
        const existingAnswerKeySnapshot = snapshotRecord(attempt.answer_key_snapshot);
        const fixedAnswerKeySnapshot = Object.fromEntries(Object.entries(existingAnswerKeySnapshot).filter(([questionId]) => !part3QuestionIds.has(questionId)));
        const pendingAnswers = { ...mergedAnswers };
        delete pendingAnswers[HSA_SELECTION_ANSWER_KEY];
        for (const questionId of part3QuestionIds) delete pendingAnswers[questionId];
        pendingAnswers[HSA_PART3_SELECTION_PENDING_KEY] = part3SectionId;
        pendingAnswers[SECTION_PROGRESS_KEY] = { sectionId: part3SectionId, startedAt: null };
        const pendingFlags = safeFlaggedQuestions(body.flaggedQuestions ?? attempt.flagged_questions).filter(questionId => !part3QuestionIds.has(questionId));
        const { data: pendingPart3, error: pendingError } = await admin.from("exam_attempts").update({
          answers: pendingAnswers,
          question_order: fixedQuestionOrder,
          option_order: fixedOptionOrder,
          answer_key_snapshot: fixedAnswerKeySnapshot,
          total_questions: fixedQuestionOrder.length,
          duration_seconds: durationSeconds,
          flagged_questions: pendingFlags,
          progress_version: Math.max(Number(attempt.progress_version ?? 0) + 1, Number(body.progressVersion ?? 0)),
        }).eq("id", attempt.id).eq("status", "in_progress").select("id,exam_id,section_id,answers,started_at,duration_seconds,status,progress_version,flagged_questions,network_state,time_extension_seconds").maybeSingle();
        if (pendingError || !pendingPart3) return Response.json({ error: "Không thể mở bước chọn tổ hợp Phần 3." }, { status: 500 });
        const pendingCounts = questionCountsForAttempt(bundle.questions, bundle.sections, { question_order: fixedQuestionOrder });
        return Response.json({ completed: false, nextSectionId: nextSection.id, requiresHsaSelection: true, attempt: annotateAttempt(pendingPart3, bundle.sections), contentManifest: { activeSectionId: nextSection.id, questionCounts: pendingCounts } }, { headers: privateHeaders });
      }
      const sectionStartedAt = new Date().toISOString();
      const { data: progressed, error } = await admin.from("exam_attempts").update({
        answers: { ...mergedAnswers, [SECTION_PROGRESS_KEY]: { sectionId: nextSection.id, startedAt: sectionStartedAt } },
        total_questions: orderedAllQuestions.length,
        duration_seconds: durationSeconds,
        ...(body.flaggedQuestions !== undefined ? { flagged_questions: safeFlaggedQuestions(body.flaggedQuestions) } : {}),
        progress_version: Math.max(Number(attempt.progress_version ?? 0) + 1, Number(body.progressVersion ?? 0)),
      }).eq("id", attempt.id).eq("status", "in_progress").select("id,exam_id,section_id,answers,started_at,duration_seconds,status").maybeSingle();
      if (error || !progressed) return Response.json({ error: "Không thể lưu phần thi." }, { status: 500 });
      return Response.json({ completed: false, nextSectionId: nextSection.id, attempt: annotateAttempt(progressed, bundle.sections) }, { headers: privateHeaders });
    }

    const questionIds = orderedAllQuestions.map(question => question.id);
    const keys = questionIds.length ? (await admin.from("exam_question_keys").select("question_id,correct_answer").in("question_id", questionIds)).data ?? [] : [];
    const keyMap = snapshotKeyMap(attempt.answer_key_snapshot, keys);
    const submittedAnswers = withoutSectionProgress(deadlineExpired ? previousAnswers : mergedAnswers);
     const scored = scoreExamQuestions(orderedAllQuestions, submittedAnswers, keyMap);
     const correctAnswers = scored.correctAnswers;
     const score = scored.score;
    const { data: result, error } = await admin.from("exam_attempts").update({
      answers: submittedAnswers,
      correct_answers: correctAnswers,
       total_questions: orderedAllQuestions.length,
       score,
       duration_seconds: durationSeconds,
       original_score: attempt.original_score ?? score,
       original_correct_answers: attempt.original_correct_answers ?? correctAnswers,
       original_total_questions: attempt.original_total_questions ?? orderedAllQuestions.length,
      status: "submitted",
      submitted_at: new Date().toISOString(),
     }).eq("id", attempt.id).eq("status", "in_progress").select("id,score,correct_answers,total_questions,submitted_at,duration_seconds,status,scoring_version").maybeSingle();
    if (error) return Response.json({ error: "Không thể nộp bài thi." }, { status: 500 });
    if (!result) {
      const latest = await admin.from("exam_attempts").select("id,score,correct_answers,total_questions,submitted_at,duration_seconds,status").eq("id", attempt.id).maybeSingle();
      if (latest.data && ["submitted", "completed", "graded"].includes(String(latest.data.status))) return Response.json({ completed: true, result: latest.data }, { headers: privateHeaders });
      return Response.json({ error: "Lượt thi đã kết thúc hoặc đã được nộp." }, { status: 409 });
    }
    return Response.json({ completed: true, result }, { headers: privateHeaders });
  }

  if (body.action === "submit" && body.attemptId && body.answers) {
    const { data: attempt } = await admin.from("exam_attempts").select(EXAM_ATTEMPT_SELECT).eq("id", body.attemptId).single();
    if (!attempt || attempt.student_id !== user.id) return Response.json({ error: "Lượt thi không hợp lệ hoặc đã nộp." }, { status: 409 });
    if (attempt.status !== "in_progress") {
      if (["submitted", "completed", "graded"].includes(attempt.status)) return Response.json({ completed: true, result: { id: attempt.id, score: attempt.score, correct_answers: attempt.correct_answers, total_questions: attempt.total_questions, submitted_at: attempt.submitted_at, duration_seconds: attempt.duration_seconds, status: attempt.status } }, { headers: privateHeaders });
      return Response.json({ error: "Lượt thi không còn hoạt động." }, { status: 409 });
    }
    const shell = await loadExam(admin, user, attempt.exam_id, { includeQuestions: false, mode: attempt.mode === "exam" ? "official" : "practice" });
    if (!shell) return Response.json({ error: "Không tìm thấy đề thi." }, { status: 404 });
    const isThptqg = isIndependentSubjectExamType(shell.room.exam_type) || isIndependentSubjectExamType(shell.exam.exam_type);
    if (isThptqg && !attempt.section_id) return Response.json({ error: "Lượt thi THPTQG chưa gắn môn thi." }, { status: 409 });
    if (isThptqg && body.sectionId && body.sectionId !== attempt.section_id) return Response.json({ error: "Môn thi không khớp với lượt thi." }, { status: 409 });
    const bundle = await loadExam(admin, user, attempt.exam_id, { sectionId: isThptqg ? attempt.section_id : undefined, includeQuestions: true, mode: attempt.mode === "exam" ? "official" : "practice" });
    if (!bundle) return Response.json({ error: "Không tìm thấy đề thi." }, { status: 404 });
    const orderedQuestions = attemptQuestions(bundle.questions, attempt);
    const attemptPolicy = resolveAttemptPolicy(attempt.policy_snapshot, bundle.policy);
    const deadlineAt = attemptDeadline(attempt, attemptPolicy);
    const deadlineExpired = Boolean(deadlineAt && Date.now() > new Date(deadlineAt).getTime());
    const questionIds = orderedQuestions.map(question => question.id);
    const keys = questionIds.length ? (await admin.from("exam_question_keys").select("question_id,correct_answer").in("question_id", questionIds)).data ?? [] : [];
    const keyMap = snapshotKeyMap(attempt.answer_key_snapshot, keys);
     const storedAnswers = attempt.answers && typeof attempt.answers === "object" && !Array.isArray(attempt.answers) ? withoutSectionProgress(attempt.answers as Record<string, unknown>) : {};
     const isHsa = isHsaExam(shell.room.exam_type, shell.exam.exam_type);
     const scoringAnswers = deadlineExpired
       ? storedAnswers
       : {
         ...body.answers,
         ...(isHsa && storedAnswers[HSA_SELECTION_ANSWER_KEY] ? { [HSA_SELECTION_ANSWER_KEY]: storedAnswers[HSA_SELECTION_ANSWER_KEY] } : {}),
       };
     const scored = scoreExamQuestionsForContext(orderedQuestions, scoringAnswers, keyMap, scoringContext(bundle.room, bundle.exam, bundle.sections, attempt.section_id));
     const correctAnswers = scored.correctAnswers;
     const score = scored.score;
     const durationSeconds = attemptDurationSeconds(attempt, attemptPolicy);
     const { data: result, error } = await admin.from("exam_attempts").update({ answers: scoringAnswers, correct_answers: correctAnswers, total_questions: orderedQuestions.length, score, duration_seconds: durationSeconds, flagged_questions: body.flaggedQuestions === undefined || deadlineExpired ? attempt.flagged_questions : safeFlaggedQuestions(body.flaggedQuestions), scoring_version: attempt.scoring_version ?? attemptPolicy.review.regradeVersion, original_score: attempt.original_score ?? score, original_correct_answers: attempt.original_correct_answers ?? correctAnswers, original_total_questions: attempt.original_total_questions ?? orderedQuestions.length, status: "submitted", submitted_at: new Date().toISOString() }).eq("id", attempt.id).eq("status", "in_progress").select("id,score,correct_answers,total_questions,submitted_at,duration_seconds,status").maybeSingle();
    if (error) return Response.json({ error: "Không thể nộp bài thi." }, { status: 500 });
    if (!result) {
      const latest = await admin.from("exam_attempts").select("id,score,correct_answers,total_questions,submitted_at,duration_seconds,status").eq("id", attempt.id).maybeSingle();
      if (latest.data && ["submitted", "completed", "graded"].includes(String(latest.data.status))) return Response.json({ completed: true, result: latest.data }, { headers: privateHeaders });
      return Response.json({ error: "Lượt thi đã kết thúc hoặc đã được nộp." }, { status: 409 });
    }
    return Response.json({ completed: true, result }, { headers: privateHeaders });
  }

  return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
}
