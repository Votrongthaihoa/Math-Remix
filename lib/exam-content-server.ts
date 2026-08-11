import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isIndependentSubjectExamType } from "./exam-config";
import { ensureActiveAccount } from "./security-server";

export type ExamAccessUser = { id: string; role: "student" | "admin" };
export type ExamAttemptRecord = Record<string, unknown> & {
  id: string;
  student_id: string;
  exam_id: string;
  section_id?: string | null;
  status: string;
  answers?: unknown;
  policy_snapshot?: unknown;
  policy_version?: number;
  question_order?: unknown;
  option_order?: unknown;
  flagged_questions?: unknown;
  exam_code?: string | null;
  progress_version?: number;
  time_extension_seconds?: number;
  network_state?: string;
  scoring_version?: number;
  answer_key_snapshot?: unknown;
  correct_answers?: number;
  total_questions?: number;
  score?: number | string;
};
export type ExamRecord = Record<string, unknown> & { id: string; room_id: string; published: boolean; exam_type?: string; results_released_at?: string | null };
export type ExamRoomRecord = Record<string, unknown> & { id: string; published: boolean; access_mode: string; exam_type?: string };
export type ExamSectionRecord = Record<string, unknown> & { id: string; exam_id: string; title: string; duration_minutes: number | null; sort_order: number; subject_code?: string | null };
export type ExamAttemptContext = {
  attempt: ExamAttemptRecord;
  exam: ExamRecord;
  room: ExamRoomRecord;
  sections: ExamSectionRecord[];
  isThptqg: boolean;
};

export const EXAM_SECTION_PROGRESS_KEY = "__exam_section_progress";
export const EXAM_ATTEMPT_SELECT = "id,student_id,exam_id,section_id,title,mode,status,score,correct_answers,total_questions,answers,question_order,option_order,flagged_questions,exam_code,policy_snapshot,policy_version,progress_version,time_extension_seconds,network_state,scoring_version,answer_key_snapshot,original_score,original_correct_answers,original_total_questions,started_at,submitted_at,duration_seconds,created_at";
export const EXAM_SELECT = "id,room_id,title,description,dashboard_title,exam_type,mode,duration_minutes,published,results_released_at,sort_order,created_at";
export const EXAM_ROOM_SELECT = "id,title,description,exam_type,access_mode,registration_start,registration_end,exam_start,exam_end,published,sort_order,created_at";
export const EXAM_QUESTION_SELECT = "id,section_id,prompt,question_type,options,points,sort_order,passage,media_url,instruction,latex_source";
export const examPrivateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  vary: "authorization, x-supabase-access-token",
  "x-content-type-options": "nosniff",
};

export function examServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;
}

export async function authenticateExamRequest(request: Request, admin: SupabaseClient) {
  const security = await ensureActiveAccount(request, admin);
  if (!security.ok) return { ok: false as const, response: security.response };
  const user: ExamAccessUser = { id: security.user.id, role: security.profile.role === "admin" ? "admin" : "student" };
  return { ok: true as const, user };
}

export function readSectionProgress(answers: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return { sectionId: null, startedAt: null };
  const raw = (answers as Record<string, unknown>)[EXAM_SECTION_PROGRESS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { sectionId: null, startedAt: null };
  const value = raw as Record<string, unknown>;
  return {
    sectionId: typeof value.sectionId === "string" ? value.sectionId : null,
    startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
  };
}

async function canReadRoom(admin: SupabaseClient, user: ExamAccessUser, room: ExamRoomRecord) {
  if (user.role === "admin") return true;
  if (!room.published) return false;
  if (room.access_mode === "open") return true;
  const { data: enrollment } = await admin.from("exam_room_enrollments").select("room_id").eq("room_id", room.id).eq("student_id", user.id).maybeSingle();
  return Boolean(enrollment);
}

export async function loadExamAttemptContext(
  admin: SupabaseClient,
  user: ExamAccessUser,
  attemptId: string,
  options: { requireOwner?: boolean; requireInProgress?: boolean } = {},
): Promise<ExamAttemptContext | null> {
  const { data: attempt } = await admin.from("exam_attempts").select(EXAM_ATTEMPT_SELECT).eq("id", attemptId).maybeSingle();
  if (!attempt) return null;
  if ((options.requireOwner ?? true) && attempt.student_id !== user.id) return null;
  if (!options.requireOwner && attempt.student_id !== user.id && user.role !== "admin") return null;
  if (options.requireInProgress && attempt.status !== "in_progress") return null;
  if (!options.requireInProgress && attempt.status === "in_progress") return null;

  const { data: exam } = await admin.from("exams").select(EXAM_SELECT).eq("id", attempt.exam_id).maybeSingle();
  if (!exam || user.role !== "admin" && !exam.published) return null;
  const { data: room } = await admin.from("exam_rooms").select(EXAM_ROOM_SELECT).eq("id", exam.room_id).maybeSingle();
  if (!room || !await canReadRoom(admin, user, room)) return null;
  const { data: sections } = await admin.from("exam_sections").select("id,exam_id,title,duration_minutes,sort_order,subject_code").eq("exam_id", exam.id).order("sort_order");
  return {
    attempt: attempt as ExamAttemptRecord,
    exam: exam as ExamRecord,
    room: room as ExamRoomRecord,
    sections: (sections ?? []) as ExamSectionRecord[],
    isThptqg: isIndependentSubjectExamType(room.exam_type) || isIndependentSubjectExamType(exam.exam_type),
  };
}

export function activeAttemptSectionId(context: ExamAttemptContext) {
  if (context.isThptqg) return typeof context.attempt.section_id === "string" ? context.attempt.section_id : null;
  return readSectionProgress(context.attempt.answers).sectionId ?? context.sections[0]?.id ?? null;
}

export function orderedRows<T extends { id: string; sort_order?: number | null }>(rows: T[], ids: string[]) {
  if (!ids.length) return [...rows];
  const order = new Map(ids.map((id, index) => [id, index]));
  return [...rows].filter(row => order.has(row.id)).sort((left, right) => {
    const leftOrder = order.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || (left.sort_order ?? 0) - (right.sort_order ?? 0);
  });
}

export function questionIdsFromSnapshot(questionOrder: unknown) {
  if (!Array.isArray(questionOrder)) return [];
  return [...new Set(questionOrder
    .filter(item => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean))];
}

export function optionIdentity(option: unknown, index: number) {
  if (typeof option === "string" || typeof option === "number") return String(option);
  if (option && typeof option === "object" && !Array.isArray(option)) {
    const record = option as Record<string, unknown>;
    return String(record.value ?? record.id ?? String.fromCharCode(65 + index));
  }
  return String.fromCharCode(65 + index);
}

export function reorderOptions<T>(options: T[] | null | undefined, order: unknown) {
  const source = Array.isArray(options) ? [...options] : [];
  const values = Array.isArray(order) ? order.filter(item => typeof item === "string").map(String) : [];
  if (!values.length || !source.length) return source;
  const direct = new Map(source.map((option, index) => [optionIdentity(option, index), option]));
  const ordered: T[] = [];
  const used = new Set<number>();
  for (const value of values) {
    const directOption = direct.get(value);
    if (directOption !== undefined) {
      const index = source.indexOf(directOption);
      if (index >= 0 && !used.has(index)) { ordered.push(directOption); used.add(index); }
      continue;
    }
    const letterIndex = /^[A-Z]$/.test(value) ? value.charCodeAt(0) - 65 : -1;
    if (letterIndex >= 0 && letterIndex < source.length && !used.has(letterIndex)) {
      ordered.push(source[letterIndex]);
      used.add(letterIndex);
    }
  }
  source.forEach((option, index) => { if (!used.has(index)) ordered.push(option); });
  return ordered;
}

export function applyQuestionSnapshotOrder<T extends { id: string; options?: unknown[] }>(rows: T[], questionOrder: unknown, optionOrder: unknown) {
  const ids = questionIdsFromSnapshot(questionOrder);
  const ordered = orderedRows(rows, ids);
  const orders = optionOrder && typeof optionOrder === "object" && !Array.isArray(optionOrder)
    ? optionOrder as Record<string, unknown>
    : {};
  return ordered.map(row => Array.isArray(row.options) && Array.isArray(orders[row.id])
    ? { ...row, options: reorderOptions(row.options, orders[row.id]) }
    : row);
}
