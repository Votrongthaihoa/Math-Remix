import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseLatexQuestion, type LatexMatchingData, type LatexPartNumber } from "./exam-latex.ts";
import {
  policyFromGuestSettings,
  prepareQuestionIdentityForPolicy,
  type ExamPolicy,
} from "./exam-policy.ts";

export type GuestIdentityField = {
  key: string;
  label: string;
  type: "text" | "email";
  required: boolean;
};

export type GuestExamSettings = {
  guestEnabled: boolean;
  policy?: unknown;
  rosterMode: "open" | "allowlist";
  allowedClasses: string[];
  maxAttempts: number;
  identityFields: GuestIdentityField[];
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  subExamCount: number;
  hideGroupHeaders: boolean;
  resetQuestionIndex: boolean;
  autoMonitor: "off" | "exit" | "advanced";
  showScore: "never" | "after_submit" | "after_slot" | "threshold";
  scoreThreshold: number;
  showAnswers: "never" | "after_submit" | "after_slot" | "threshold";
  answerThreshold: number;
  hideWrongAnswers: boolean;
  exportWindowEnabled: boolean;
};

export type GuestSlotRow = {
  id: string;
  exam_id: string;
  name: string;
  token_hash: string;
  token_hint: string;
  starts_at: string;
  ends_at: string;
  grace_period_minutes: number;
  password_hash: string | null;
  enabled: boolean;
  results_released_at: string | null;
  export_open_at: string | null;
  export_close_at: string | null;
  section_id: string | null;
};

export type GuestExamRow = {
  id: string;
  room_id: string;
  title: string;
  description: string;
  exam_type: string;
  duration_minutes: number;
  published: boolean;
  settings?: unknown;
};

export type GuestRoomRow = {
  id: string;
  title: string;
  published: boolean;
  exam_type: string;
};

export type GuestQuestion = {
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
  option_columns?: number | null;
  matching?: LatexMatchingData;
  part?: LatexPartNumber;
  option_order?: string[];
};

export type GuestSection = {
  id: string;
  title: string;
  duration_minutes: number | null;
  sort_order: number;
  subject_code?: string | null;
};

export const GUEST_SLOT_SELECT = "id,exam_id,name,token_hash,token_hint,starts_at,ends_at,grace_period_minutes,password_hash,enabled,results_released_at,export_open_at,export_close_at,section_id,created_by,created_at,updated_at";
export const GUEST_ATTEMPT_SELECT = "id,slot_id,exam_id,session_hash,client_hash,guest_identity,answers,question_order,option_order,config_snapshot,policy_snapshot,policy_version,monitor_events,progress_version,flagged_questions,exam_code,time_extension_seconds,network_state,scoring_version,answer_key_snapshot,original_score,original_correct_answers,original_total_questions,score,correct_answers,total_questions,status,started_at,submitted_at,duration_seconds,created_at";

export const guestPrivateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
  vary: "cookie",
};

export function guestServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min = 0, max = 100000) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : fallback;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function mode(value: unknown, values: string[], fallback: string) {
  return typeof value === "string" && values.includes(value) ? value : fallback;
}

export function normalizeGuestSettings(value: unknown): GuestExamSettings {
  const raw = asRecord(value);
  const fields = Array.isArray(raw.identityFields) ? raw.identityFields : [];
  const identityFields: GuestIdentityField[] = fields.map((field, index) => {
    const item = asRecord(field);
    const key = String(item.key ?? `field_${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 50) || `field_${index + 1}`;
    return {
      key,
      label: String(item.label ?? key).trim().slice(0, 100) || key,
      type: (item.type === "email" ? "email" : "text") as GuestIdentityField["type"],
      required: item.required !== false,
    };
  }).filter((field, index, list) => list.findIndex(item => item.key === field.key) === index).slice(0, 20);
  return {
    guestEnabled: asBoolean(raw.guestEnabled, false),
    policy: raw.policy,
    rosterMode: mode(raw.rosterMode, ["open", "allowlist"], "open") as GuestExamSettings["rosterMode"],
    allowedClasses: Array.isArray(raw.allowedClasses) ? raw.allowedClasses.filter(item => typeof item === "string").map(item => item.trim()).filter(Boolean).slice(0, 100) : [],
    maxAttempts: asNumber(raw.maxAttempts, 0, 0, 1000),
    identityFields: identityFields.length ? identityFields : [
      { key: "full_name", label: "Họ và tên", type: "text", required: true },
      { key: "class_name", label: "Lớp", type: "text", required: true },
    ],
    shuffleQuestions: asBoolean(raw.shuffleQuestions, false),
    shuffleAnswers: asBoolean(raw.shuffleAnswers, false),
    subExamCount: asNumber(raw.subExamCount, 0, 0, 1000),
    hideGroupHeaders: asBoolean(raw.hideGroupHeaders, false),
    resetQuestionIndex: asBoolean(raw.resetQuestionIndex, false),
    autoMonitor: mode(raw.autoMonitor, ["off", "exit", "advanced"], "off") as GuestExamSettings["autoMonitor"],
    showScore: mode(raw.showScore, ["never", "after_submit", "after_slot", "threshold"], "after_submit") as GuestExamSettings["showScore"],
    scoreThreshold: asNumber(raw.scoreThreshold, 0, 0, 100),
    showAnswers: mode(raw.showAnswers, ["never", "after_submit", "after_slot", "threshold"], "never") as GuestExamSettings["showAnswers"],
    answerThreshold: asNumber(raw.answerThreshold, 0, 0, 100),
    hideWrongAnswers: asBoolean(raw.hideWrongAnswers, false),
    exportWindowEnabled: asBoolean(raw.exportWindowEnabled, false),
  };
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" }, key, 256);
  return new Uint8Array(bits);
}

export async function hashGuestPassword(password: string) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const iterations = 120_000;
  return `pbkdf2$${iterations}$${base64Url(salt)}$${hex(await pbkdf2(password, salt, iterations))}`;
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyGuestPassword(password: string, stored: string | null | undefined) {
  if (!stored) return true;
  const parts = stored.split("$");
  if (parts.length === 4 && parts[0] === "pbkdf2") {
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < 50_000 || iterations > 500_000) return false;
    try {
      const saltText = parts[2].replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - parts[2].length % 4) % 4);
      const saltValue = atob(saltText);
      const salt = Uint8Array.from(saltValue, character => character.charCodeAt(0));
      return constantTimeEqual(hex(await pbkdf2(password, salt, iterations)), parts[3]);
    } catch { return false; }
  }
  // Keep links created before PBKDF2 deployable; new or rotated links use the
  // salted format above.
  return constantTimeEqual(await sha256(password), stored);
}

export function randomToken(byteLength = 24) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function readCookie(request: Request, name: string) {
  const raw = request.headers.get("cookie") ?? "";
  for (const item of raw.split(";")) {
    const [key, ...rest] = item.trim().split("=");
    if (key === name) {
      try { return decodeURIComponent(rest.join("=")); } catch { return ""; }
    }
  }
  return "";
}

export function guestCookieName(slotId: string) {
  return `guest_exam_session_${slotId.replaceAll(/[^a-zA-Z0-9_-]/g, "")}`;
}

export function guestCookieHeader(slotId: string, session: string, secure = true) {
  return `${guestCookieName(slotId)}=${encodeURIComponent(session)}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export async function requestClientHash(request: Request, identity: Record<string, unknown> = {}) {
  const forwarded = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  return sha256(`${forwarded}|${userAgent}|${JSON.stringify(identity)}`);
}

export function slotPhase(slot: Pick<GuestSlotRow, "starts_at" | "ends_at" | "grace_period_minutes" | "enabled">, now = Date.now()) {
  if (!slot.enabled) return "disabled" as const;
  const starts = new Date(slot.starts_at).getTime();
  const ends = new Date(slot.ends_at).getTime();
  const graceEnds = ends + Math.max(0, slot.grace_period_minutes) * 60_000;
  if (now < starts) return "upcoming" as const;
  if (now <= ends) return "open" as const;
  if (now <= graceEnds) return "grace" as const;
  return "closed" as const;
}

/**
 * An export window is optional. When both bounds are empty, the export route
 * intentionally falls back to the slot end/grace values, so a zero-minute
 * grace period must not make slot creation fail by itself.
 */
export function isGuestExportWindowValid(
  endsAt: string | Date,
  gracePeriodMinutes: number,
  exportOpenAt?: string | Date | null,
  exportCloseAt?: string | Date | null,
) {
  if (!exportOpenAt && !exportCloseAt) return true;
  const ends = new Date(endsAt).getTime();
  const open = exportOpenAt ? new Date(exportOpenAt).getTime() : ends;
  const close = exportCloseAt
    ? new Date(exportCloseAt).getTime()
    : ends + Math.max(0, Number(gracePeriodMinutes) || 0) * 60_000;
  return Number.isFinite(open) && Number.isFinite(close) && close > open;
}

/**
 * A candidate gets the configured exam duration, but a kíp can never stay
 * alive beyond its absolute close time (end + grace period). Keeping this
 * calculation server-side prevents a modified browser clock from extending
 * the attempt.
 */
export function guestAttemptDeadline(
  exam: Pick<GuestExamRow, "duration_minutes">,
  slot: Pick<GuestSlotRow, "ends_at" | "grace_period_minutes">,
  startedAt: string,
  durationMinutes?: number,
  extensionSeconds = 0,
) {
  const started = new Date(startedAt).getTime();
  const durationMs = Math.max(1, Number(durationMinutes ?? exam.duration_minutes) || 1) * 60_000;
  const slotClose = new Date(slot.ends_at).getTime() + Math.max(0, Number(slot.grace_period_minutes) || 0) * 60_000;
  if (!Number.isFinite(started)) return new Date(Math.min(Date.now(), slotClose)).toISOString();
  // An approved individual extension is an explicit administrative override
  // of the base deadline. The slot still controls whether a *new* attempt may
  // start; an existing attempt may finish during its approved extension.
  const baseDeadline = Math.min(started + durationMs, slotClose);
  return new Date(baseDeadline + Math.max(0, Number(extensionSeconds) || 0) * 1000).toISOString();
}

export function guestAttemptSecondsRemaining(
  exam: Pick<GuestExamRow, "duration_minutes">,
  slot: Pick<GuestSlotRow, "ends_at" | "grace_period_minutes">,
  startedAt: string,
  now = Date.now(),
  extensionSeconds = 0,
) {
  return Math.max(0, Math.ceil((new Date(guestAttemptDeadline(exam, slot, startedAt, undefined, extensionSeconds)).getTime() - now) / 1000));
}

export async function loadGuestSlot(admin: SupabaseClient, token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const { data: slot } = await admin.from("exam_access_slots").select(GUEST_SLOT_SELECT).eq("token_hash", tokenHash).maybeSingle();
  if (!slot) return null;
  const { data: exam } = await admin.from("exams").select("id,room_id,title,description,exam_type,duration_minutes,published,settings").eq("id", slot.exam_id).maybeSingle();
  if (!exam) return null;
  const { data: room } = await admin.from("exam_rooms").select("id,title,published,exam_type").eq("id", exam.room_id).maybeSingle();
  if (!room || !exam.published || !room.published) return null;
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

export async function loadGuestQuestions(admin: SupabaseClient, examId: string, questionIds?: string[], sectionId?: string | null) {
  let sectionQuery = admin.from("exam_sections").select("id,title,duration_minutes,sort_order,subject_code").eq("exam_id", examId);
  if (sectionId) sectionQuery = sectionQuery.eq("id", sectionId);
  const sectionResult = await sectionQuery.order("sort_order");
  const sections = sectionResult.data ?? [];
  const sectionIds = sections.map(section => section.id);
  if (!sectionIds.length) return { sections, questions: [] as GuestQuestion[] };
  let query = admin.from("exam_questions").select("id,section_id,prompt,question_type,options,points,sort_order,passage,media_url,instruction,latex_source").in("section_id", sectionIds);
  if (questionIds?.length) query = query.in("id", questionIds);
  const result = await query.order("sort_order");
  const sectionOrder = new Map(sections.map((section, index) => [section.id, index]));
  const questions = [...(result.data ?? [])].sort((left, right) => (sectionOrder.get(left.section_id) ?? 0) - (sectionOrder.get(right.section_id) ?? 0) || left.sort_order - right.sort_order) as GuestQuestion[];
  return { sections, questions };
}

function optionValue(option: unknown, index: number) {
  if (typeof option === "string") return option;
  const record = asRecord(option);
  return String(record.value ?? record.id ?? index);
}

export function prepareQuestionsForPolicy(questions: GuestQuestion[], policy: ExamPolicy) {
  const prepared = prepareQuestionIdentityForPolicy(questions.map(question => ({
    ...question,
    optionValues: (() => {
      if (question.latex_source?.trim()) {
        try {
          const parsed = parseLatexQuestion(question.latex_source);
          if (parsed.options.length) return parsed.options.map((option, index) => option.value || String.fromCharCode(65 + index));
        } catch { /* fall back to the structured projection */ }
      }
      return (Array.isArray(question.options) ? question.options : []).map(optionValue);
    })(),
  })), policy);
  const output = prepared.questions.map(question => {
    const options = Array.isArray(question.options) ? [...question.options] : [];
    const keyedOptions = options.map((option, index) => ({ option, value: optionValue(option, index) }));
    const orderedValues = prepared.optionOrder[question.id] ?? keyedOptions.map(item => item.value);
    const optionMap = new Map(keyedOptions.map(item => [item.value, item.option]));
    const orderedOptions: unknown[] = orderedValues.map(value => optionMap.get(value)).filter(option => option !== undefined);
    return { ...question, options: orderedOptions, option_order: prepared.optionOrder[question.id] ?? [] };
  });
  return { questions: output, questionOrder: prepared.questionOrder, optionOrder: prepared.optionOrder };
}

export function prepareGuestQuestions(questions: GuestQuestion[], settings: GuestExamSettings) {
  const policy = policyFromGuestSettings(settings, {
    examType: "OTHER",
    durationMinutes: 0,
    opensAt: null,
    closesAt: null,
    gracePeriodMinutes: 0,
    passwordRequired: false,
  });
  return prepareQuestionsForPolicy(questions, policy);
}

export function applyGuestOrdering(questions: GuestQuestion[], questionOrder: unknown, optionOrder: unknown) {
  const ids = Array.isArray(questionOrder) ? questionOrder.filter(item => typeof item === "string") as string[] : [];
  const source = new Map(questions.map(question => [question.id, question]));
  const ordered = ids.length ? ids.map(id => source.get(id)).filter((question): question is GuestQuestion => Boolean(question)) : questions;
  const optionsByQuestion = asRecord(optionOrder);
  return ordered.map(question => {
    const values = Array.isArray(optionsByQuestion[question.id]) ? optionsByQuestion[question.id] as string[] : [];
    if (!values.length) return question;
    const optionMap = new Map((Array.isArray(question.options) ? question.options : []).map((option, index) => [typeof option === "string" ? option : String(asRecord(option).value ?? asRecord(option).id ?? index), option]));
    return { ...question, options: values.map(value => optionMap.get(value)).filter(option => option !== undefined), option_order: values };
  });
}

export function answerVisibility(settings: GuestExamSettings, slot: GuestSlotRow, score: number, now = Date.now()) {
  const afterSlot = slot.results_released_at ? now >= new Date(slot.results_released_at).getTime() : now >= new Date(slot.ends_at).getTime();
  const scoreVisible = settings.showScore === "after_submit"
    || settings.showScore === "after_slot" && afterSlot
    || settings.showScore === "threshold" && score >= settings.scoreThreshold;
  const configuredAnswersVisible = settings.showAnswers === "after_submit"
    || settings.showAnswers === "after_slot" && afterSlot
    || settings.showAnswers === "threshold" && score >= settings.answerThreshold;
  // Showing the answer key or per-question correctness before the score is
  // released lets a candidate reconstruct the score. Keep both permissions
  // independent in the admin form, but enforce the stricter effective rule at
  // the server boundary.
  return { scoreVisible, answersVisible: scoreVisible && configuredAnswersVisible };
}

export function normalizeGuestIdentity(value: unknown, settings: GuestExamSettings) {
  const raw = asRecord(value);
  const identity: Record<string, string> = {};
  for (const field of settings.identityFields) {
    const text = String(raw[field.key] ?? "").trim().slice(0, 200);
    if (field.required && !text) return { error: `Vui lòng nhập ${field.label.toLowerCase()}.` } as const;
    if (field.type === "email" && text && !/^\S+@\S+\.\S+$/.test(text)) return { error: `${field.label} không hợp lệ.` } as const;
    identity[field.key] = text;
  }
  return { identity } as const;
}

function guestMediaUrl(value: string | null | undefined, attemptId?: string) {
  const source = value?.trim() ?? "";
  if (!source || !attemptId) return source || null;
  const match = source.split(/[?#]/, 1)[0].match(/^(?:https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?){0,1}\/api\/exam-images\/([^/]+)\/([^/]+)$/i);
  if (!match) return source;
  let sectionId = "";
  let asset = "";
  try {
    sectionId = decodeURIComponent(match[1]);
    asset = decodeURIComponent(match[2]);
  } catch {
    return source;
  }
  if (!/^[0-9a-f-]{36}$/i.test(sectionId) || !/^[0-9a-f-]{36}\.[a-z0-9][a-z0-9-]{0,15}$/i.test(asset)) return source;
  return `/api/guest-exams/images/${encodeURIComponent(sectionId)}/${encodeURIComponent(asset)}?attemptId=${encodeURIComponent(attemptId)}`;
}

function guestText(value: string | null | undefined, attemptId?: string) {
  if (!value) return value ?? null;
  const rewritten = attemptId
    ? value.replace(/\/api\/exam-images\/([^/\s{}]+)\/([^/\s{}]+)/g, (match, sectionId: string, asset: string) => guestMediaUrl(`/api/exam-images/${sectionId}/${asset}`, attemptId) ?? match)
    : value;
  // Correctness markers belong only to the answer key. Strip them even when
  // an old structured question has no valid latex_source to parse.
  return rewritten.replace(/\\(?:True|False)\b/g, "").replace(/[ \t]{2,}/g, " ");
}

function safeParsedMatching(value: LatexMatchingData | undefined, attemptId?: string) {
  if (!value) return undefined;
  return {
    leftItems: value.leftItems.map(item => ({ value: item.value, label: guestText(item.label, attemptId) ?? "" })),
    rightItems: value.rightItems.map(item => ({ value: item.value, label: guestText(item.label, attemptId) ?? "" })),
  } satisfies LatexMatchingData;
}

export function publicGuestQuestion(question: GuestQuestion, attemptId?: string) {
  let parsed: ReturnType<typeof parseLatexQuestion> | null = null;
  if (question.latex_source?.trim()) {
    try { parsed = parseLatexQuestion(question.latex_source); } catch { parsed = null; }
  }
  const parsedOptions = parsed?.options?.length ? parsed.options : Array.isArray(question.options) ? question.options : [];
  const sourceOptions = Array.isArray(question.option_order) && question.option_order.length
    ? question.option_order.map(value => parsedOptions.find((option, index) => optionValue(option, index) === value)
      ?? parsedOptions.find((_, index) => String.fromCharCode(65 + index) === value)).filter(option => option !== undefined)
    : parsedOptions;
  const options = sourceOptions.map((option, index) => {
    if (typeof option === "string") return guestText(option, attemptId) ?? "";
    const record = asRecord(option);
    return {
      value: String(record.value ?? record.id ?? String.fromCharCode(65 + index)),
      label: guestText(String(record.label ?? record.text ?? record.value ?? `Phương án ${index + 1}`), attemptId) ?? "",
    };
  });
  return {
    id: question.id,
    section_id: question.section_id,
    prompt: guestText(parsed?.prompt?.trim() || question.prompt, attemptId) ?? "",
    question_type: parsed?.questionType ?? question.question_type,
    // Never expose parser/source metadata or correctness markers to an
    // unauthenticated browser. The authoring LaTeX may contain `\\True` and
    // option objects may contain a `correct` property.
    options,
    points: question.points,
    sort_order: question.sort_order,
    passage: guestText(question.passage, attemptId),
    media_url: guestMediaUrl(question.media_url, attemptId),
    instruction: guestText(question.instruction, attemptId),
    option_columns: parsed?.optionColumns ?? question.option_columns ?? null,
    matching: safeParsedMatching(parsed?.matching ?? question.matching, attemptId),
    part: parsed?.part ?? question.part,
    option_order: Array.isArray(question.option_order) ? question.option_order : undefined,
  };
}
