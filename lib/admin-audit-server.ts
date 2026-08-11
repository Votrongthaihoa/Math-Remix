import type { SupabaseClient } from "@supabase/supabase-js";

export const EXAM_ADMIN_AUDIT_ACTIONS = [
  "save_exam_access_config",
  "publish_exam",
  "create_exam_access_slot",
  "update_exam_access_slot",
  "rotate_exam_access_slot",
  "release_exam_results",
  "export_exam_results",
  "extend_exam_attempt_time",
  "grant_exam_attempt_retry",
  "import_exam_slot_candidates",
  "create_exam_scoring_version",
  "preview_exam_regrade",
  "apply_exam_regrade",
  "override_exam_question",
  "delete_exam_history",
] as const;

export type ExamAdminAuditAction = typeof EXAM_ADMIN_AUDIT_ACTIONS[number];
export type ExamAdminAuditStatus = "started" | "succeeded" | "failed";
export type AuditScalar = string | number | boolean | null;
export type AuditMetadata = Record<string, AuditScalar>;

const MAX_METADATA_ENTRIES = 24;
const MAX_METADATA_KEY_LENGTH = 64;
const MAX_METADATA_STRING_LENGTH = 256;
const SENSITIVE_KEY = /(password|token|secret|hash|answer|identity|student|candidate|raw|cookie|authorization)/i;

export type StartExamAdminAuditInput = {
  adminId?: string | null;
  examId?: string | null;
  roomId?: string | null;
  slotId?: string | null;
  action: ExamAdminAuditAction;
  metadata?: Record<string, unknown>;
};

export type ExamAdminAuditHandle = { id: number };

export type StartExamAdminAuditResult =
  | { ok: true; audit: ExamAdminAuditHandle }
  | { ok: false; error: unknown };

function boundedString(value: string) {
  return value.slice(0, MAX_METADATA_STRING_LENGTH);
}

/**
 * Keep audit metadata deliberately boring: only bounded scalar values are
 * accepted. This prevents an accidental config/identity/answer dump from
 * becoming a permanent audit record.
 */
export function sanitizeAuditMetadata(input: Record<string, unknown> | undefined): AuditMetadata {
  const output: AuditMetadata = {};
  if (!input || typeof input !== "object") return output;
  for (const [rawKey, value] of Object.entries(input)) {
    if (Object.keys(output).length >= MAX_METADATA_ENTRIES) break;
    const key = rawKey.trim().slice(0, MAX_METADATA_KEY_LENGTH);
    if (!key || SENSITIVE_KEY.test(key)) continue;
    if (typeof value === "string") output[key] = boundedString(value);
    else if (typeof value === "boolean") output[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) output[key] = value;
    else if (value === null) output[key] = null;
  }
  return output;
}

function nullableId(value: string | null | undefined) {
  return value?.trim() || null;
}

export async function startExamAdminAudit(
  admin: SupabaseClient,
  input: StartExamAdminAuditInput,
): Promise<StartExamAdminAuditResult> {
  try {
    const { data, error } = await admin.from("exam_admin_audit_logs").insert({
      admin_id: nullableId(input.adminId),
      exam_id: nullableId(input.examId),
      room_id: nullableId(input.roomId),
      slot_id: nullableId(input.slotId),
      action: input.action,
      status: "started",
      metadata: sanitizeAuditMetadata(input.metadata),
    }).select("id").single();
    if (error || !data || typeof data.id !== "number") return { ok: false, error: error ?? new Error("audit_insert_missing_id") };
    return { ok: true, audit: { id: data.id } };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Completion is best-effort: the protected mutation has already happened. */
export async function finishExamAdminAudit(
  admin: SupabaseClient,
  auditId: number,
  status: ExamAdminAuditStatus,
  metadata?: Record<string, unknown>,
) {
  const update: Record<string, unknown> = {
    status,
    completed_at: new Date().toISOString(),
  };
  if (metadata) update.metadata = sanitizeAuditMetadata(metadata);
  try {
    await admin.from("exam_admin_audit_logs").update(update).eq("id", auditId);
  } catch {
    // Do not turn a completed exam-access operation into a failed request when
    // only the audit completion update is unavailable.
  }
}
