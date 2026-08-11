import { ensureActiveAccount } from "../../../../lib/security-server";
import {
  GUEST_SLOT_SELECT, hashGuestPassword, isGuestExportWindowValid, normalizeGuestSettings, randomToken, sha256,
  type GuestExamSettings,
} from "../../../../lib/guest-exam-server";
import { normalizeExamType } from "../../../../lib/exam-config";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { finishExamAdminAudit, startExamAdminAudit } from "../../../../lib/admin-audit-server";
import { runExamPreflight } from "../../../../lib/exam-preflight-server";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

async function adminRequest(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security;
  if (security.profile.role !== "admin") return { ok: false as const, response: Response.json({ error: "Bạn không có quyền quản trị." }, { status: 403, headers }) };
  return security;
}

function asDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function optionalDate(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return asDate(value);
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : fallback;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers });
}

function auditUnavailableResponse() {
  return errorResponse("Không thể ghi nhật ký thao tác quản trị. Vui lòng thử lại sau.", 503);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function schemaErrorMessage(message: string) {
  if (/column .*settings does not exist|column .*section_id does not exist|column .*progress_version does not exist|relation .*exam_access_slots|relation .*guest_exam_attempts/i.test(message)) {
    return "Cơ sở dữ liệu chưa có schema kíp thi. Hãy áp dụng lần lượt các migration 017_guest_exam_slots.sql, 018_exam_structure_profiles.sql, 019_guest_progress_version.sql và 020_guest_slot_sections.sql rồi tải lại trang.";
  }
  return message;
}

function settingsForSave(value: unknown): GuestExamSettings & { policy?: unknown } {
  const settings = normalizeGuestSettings(value);
  const normalized = normalizeGuestSettings({
    ...settings,
    identityFields: settings.identityFields.map(field => ({
      ...field,
      key: field.key.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 50),
      label: field.label.slice(0, 100),
    })),
  });
  const policy = asRecord(value).policy;
  return policy ? { ...normalized, policy } : normalized;
}

export async function GET(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const admin = security.admin;
  const params = new URL(request.url).searchParams;
  const examId = params.get("examId")?.trim() ?? "";
  const slotId = params.get("slotId")?.trim() ?? "";
  if (!examId) return errorResponse("Thiếu mã đề thi.");
  const [{ data: exam, error: examError }, { data: slots, error: slotError }, { data: sections, error: sectionError }] = await Promise.all([
    admin.from("exams").select("id,room_id,title,description,exam_type,duration_minutes,published,settings").eq("id", examId).maybeSingle(),
    admin.from("exam_access_slots").select("id,exam_id,section_id,name,token_hint,starts_at,ends_at,grace_period_minutes,enabled,results_released_at,export_open_at,export_close_at,created_at,updated_at").eq("exam_id", examId).order("starts_at", { ascending: false }),
    admin.from("exam_sections").select("id,title,duration_minutes,subject_code,sort_order").eq("exam_id", examId).order("sort_order"),
  ]);
  if (examError || slotError || sectionError) return errorResponse(schemaErrorMessage(examError?.message || slotError?.message || sectionError?.message || "Không thể tải cấu hình kíp thi."), 503);
  if (!exam) return errorResponse("Không tìm thấy đề thi.", 404);
  let attempts: unknown[] = [];
  if (slotId) {
    const result = await admin.from("guest_exam_attempts").select("id,slot_id,exam_id,guest_identity,score,correct_answers,total_questions,status,started_at,submitted_at,duration_seconds,monitor_events").eq("slot_id", slotId).order("started_at", { ascending: false });
    if (result.error) return errorResponse(schemaErrorMessage(result.error.message), 503);
    attempts = result.data ?? [];
  }
  const sectionMap = new Map((sections ?? []).map(section => [section.id, section]));
  const enrichedSlots = (slots ?? []).map(slot => ({ ...slot, section_title: slot.section_id ? sectionMap.get(slot.section_id)?.title ?? "Môn/phần đã xóa" : null }));
  return Response.json({ exam: { ...exam, settings: { ...normalizeGuestSettings(exam.settings), ...(asRecord(exam.settings).policy ? { policy: asRecord(exam.settings).policy } : {}) } }, sections: sections ?? [], slots: enrichedSlots, attempts }, { headers });
}

type Body = {
  action?: "save_config" | "create_slot" | "update_slot" | "rotate_slot" | "release_results";
  examId?: string;
  slotId?: string;
  settings?: unknown;
  name?: string;
  startsAt?: string;
  endsAt?: string;
  sectionId?: string | null;
  gracePeriodMinutes?: number;
  exportOpenAt?: string;
  exportCloseAt?: string;
  password?: string;
  enabled?: boolean;
};

export async function POST(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const admin = security.admin;
  const parsedBody = await readJsonBody<Body>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400, headers });
  const body = parsedBody.body;
  const action = body.action;
  const examId = body.examId?.trim() ?? "";
  if (!action || !examId) return errorResponse("Thiếu thao tác hoặc mã đề thi.");

  if (action === "save_config") {
    const currentExam = await admin.from("exams").select("settings").eq("id", examId).maybeSingle();
    const currentPolicy = asRecord(currentExam.data?.settings).policy;
    const settings = settingsForSave({ ...asRecord(body.settings), ...(currentPolicy ? { policy: currentPolicy } : {}) });
    const audit = await startExamAdminAudit(admin, {
      adminId: security.user.id,
      examId,
      action: "save_exam_access_config",
      metadata: {
        changed_fields: "settings",
        guest_enabled: settings.guestEnabled,
        max_attempts: settings.maxAttempts,
        auto_monitor: settings.autoMonitor,
        show_score: settings.showScore,
        show_answers: settings.showAnswers,
        export_window_enabled: settings.exportWindowEnabled,
      },
    });
    if (!audit.ok) return auditUnavailableResponse();
    const result = await admin.from("exams").update({ settings }).eq("id", examId);
    if (result.error) {
      await finishExamAdminAudit(admin, audit.audit.id, "failed");
      return errorResponse(schemaErrorMessage(result.error.message), 503);
    }
    await finishExamAdminAudit(admin, audit.audit.id, "succeeded");
    return Response.json({ settings }, { headers });
  }

  if (action === "create_slot") {
    const { data: exam, error: examError } = await admin.from("exams").select("id,room_id,exam_type,settings").eq("id", examId).maybeSingle();
    if (examError) return errorResponse(schemaErrorMessage(examError.message), 503);
    if (!exam) return errorResponse("Không tìm thấy đề thi.", 404);
    // Do not create a slot that can never be opened by a candidate. The
    // guest route intentionally hides disabled/invalid links behind a generic
    // 404, so this validation belongs at creation time too.
    if (!normalizeGuestSettings(exam.settings).guestEnabled) {
      return errorResponse("Hãy bật “Cho phép thi bằng link” và lưu cấu hình trước khi tạo kíp thi.", 409);
    }
    try {
      const preflight = await runExamPreflight(admin, examId);
      if (!preflight.canPublish) return errorResponse("Không thể mở kíp: đề còn lỗi preflight. Hãy bổ sung câu hỏi và đáp án trước.", 409);
    } catch (value) {
      return errorResponse(value instanceof Error ? `Không thể kiểm tra preflight: ${value.message}` : "Không thể kiểm tra preflight của đề.", 503);
    }
    const sectionId = String(body.sectionId ?? "").trim() || null;
    if (normalizeExamType(exam.exam_type) === "VSAT" || normalizeExamType(exam.exam_type) === "THPTQG") {
      if (!sectionId) return errorResponse("Hãy chọn một môn thi cho link V-SAT/THPTQG.");
    }
    if (sectionId) {
      const { data: section, error: sectionError } = await admin.from("exam_sections").select("id").eq("id", sectionId).eq("exam_id", examId).maybeSingle();
      if (sectionError) return errorResponse(schemaErrorMessage(sectionError.message), 503);
      if (!section) return errorResponse("Môn thi không thuộc đề đã chọn.");
    }
    const startsAt = asDate(body.startsAt);
    const endsAt = asDate(body.endsAt);
    if (!startsAt || !endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return errorResponse("Thời gian kíp thi không hợp lệ.");
    const exportOpenAt = optionalDate(body.exportOpenAt);
    const exportCloseAt = optionalDate(body.exportCloseAt);
    if ((body.exportOpenAt && !exportOpenAt) || (body.exportCloseAt && !exportCloseAt)) return errorResponse("Thời gian xuất dữ liệu không hợp lệ.");
    const token = randomToken(24);
    const password = String(body.password ?? "").trim();
    const gracePeriodMinutes = boundedInteger(body.gracePeriodMinutes, 30, 0, 1440);
    if (!isGuestExportWindowValid(endsAt, gracePeriodMinutes, exportOpenAt, exportCloseAt)) return errorResponse("Thời gian đóng xuất phải sau thời gian mở xuất.");
    const audit = await startExamAdminAudit(admin, {
      adminId: security.user.id,
      examId,
      roomId: String(exam.room_id ?? "") || null,
      action: "create_exam_access_slot",
      metadata: {
        section_configured: Boolean(sectionId),
        enabled: body.enabled !== false,
        grace_period_minutes: gracePeriodMinutes,
        export_window_configured: Boolean(exportOpenAt || exportCloseAt),
      },
    });
    if (!audit.ok) return auditUnavailableResponse();
    const { data: slot, error } = await admin.from("exam_access_slots").insert({
      exam_id: examId,
      section_id: sectionId,
      name: String(body.name ?? "").trim().slice(0, 120) || "Kíp thi",
      token_hash: await sha256(token),
      token_hint: token.slice(-8),
      starts_at: startsAt,
      ends_at: endsAt,
      grace_period_minutes: gracePeriodMinutes,
      export_open_at: exportOpenAt,
      export_close_at: exportCloseAt,
      password_hash: password ? await hashGuestPassword(password) : null,
      enabled: body.enabled !== false,
      created_by: security.user.id,
    }).select("id,exam_id,section_id,name,token_hint,starts_at,ends_at,grace_period_minutes,enabled,results_released_at,export_open_at,export_close_at,created_at,updated_at").single();
    if (error || !slot) {
      await finishExamAdminAudit(admin, audit.audit.id, "failed");
      return errorResponse(error ? schemaErrorMessage(error.message) : "Không thể tạo kíp thi.", 503);
    }
    await finishExamAdminAudit(admin, audit.audit.id, "succeeded");
    const shareUrl = new URL(`/guest/exam/${token}`, request.url).toString();
    return Response.json({ slot, shareUrl }, { status: 201, headers });
  }

  if (!body.slotId) return errorResponse("Thiếu mã kíp thi.");
  const slotId = body.slotId;
  const { data: currentSlot } = await admin.from("exam_access_slots").select(GUEST_SLOT_SELECT).eq("id", slotId).eq("exam_id", examId).maybeSingle();
  if (!currentSlot) return errorResponse("Không tìm thấy kíp thi.", 404);

  if (action === "rotate_slot") {
    const token = randomToken(24);
    const audit = await startExamAdminAudit(admin, {
      adminId: security.user.id,
      examId,
      slotId,
      action: "rotate_exam_access_slot",
      metadata: { token_rotated: true },
    });
    if (!audit.ok) return auditUnavailableResponse();
    const result = await admin.from("exam_access_slots").update({ token_hash: await sha256(token), token_hint: token.slice(-8), updated_at: new Date().toISOString() }).eq("id", slotId);
    if (result.error) {
      await finishExamAdminAudit(admin, audit.audit.id, "failed");
      return errorResponse(result.error.message, 503);
    }
    await finishExamAdminAudit(admin, audit.audit.id, "succeeded");
    return Response.json({ shareUrl: new URL(`/guest/exam/${token}`, request.url).toString(), tokenHint: token.slice(-8) }, { headers });
  }

  if (action === "release_results") {
    const audit = await startExamAdminAudit(admin, {
      adminId: security.user.id,
      examId,
      slotId,
      action: "release_exam_results",
      metadata: { results_released: true },
    });
    if (!audit.ok) return auditUnavailableResponse();
    const result = await admin.from("exam_access_slots").update({ results_released_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", slotId);
    if (result.error) {
      await finishExamAdminAudit(admin, audit.audit.id, "failed");
      return errorResponse(result.error.message, 503);
    }
    await finishExamAdminAudit(admin, audit.audit.id, "succeeded");
    return Response.json({ released: true }, { headers });
  }

  if (action === "update_slot") {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) payload.name = String(body.name ?? "").trim().slice(0, 120) || "Kíp thi";
    if (body.sectionId !== undefined) {
      const sectionId = String(body.sectionId ?? "").trim() || null;
      const { data: examForUpdate, error: examForUpdateError } = await admin.from("exams").select("exam_type").eq("id", examId).maybeSingle();
      if (examForUpdateError) return errorResponse(schemaErrorMessage(examForUpdateError.message), 503);
      if ((normalizeExamType(examForUpdate?.exam_type) === "VSAT" || normalizeExamType(examForUpdate?.exam_type) === "THPTQG") && !sectionId) return errorResponse("Hãy chọn một môn thi cho link V-SAT/THPTQG.");
      if (sectionId) {
        const { data: section, error: sectionError } = await admin.from("exam_sections").select("id").eq("id", sectionId).eq("exam_id", examId).maybeSingle();
        if (sectionError) return errorResponse(sectionError.message, 503);
        if (!section) return errorResponse("Môn thi không thuộc đề đã chọn.");
      }
      payload.section_id = sectionId;
    }
    if (body.startsAt !== undefined) {
      const value = asDate(body.startsAt);
      if (!value) return errorResponse("Thời gian mở kíp không hợp lệ.");
      payload.starts_at = value;
    }
    if (body.endsAt !== undefined) {
      const value = asDate(body.endsAt);
      if (!value) return errorResponse("Thời gian kết thúc kíp không hợp lệ.");
      payload.ends_at = value;
    }
    if (body.gracePeriodMinutes !== undefined) payload.grace_period_minutes = boundedInteger(body.gracePeriodMinutes, currentSlot.grace_period_minutes ?? 30, 0, 1440);
    if (body.enabled !== undefined) payload.enabled = body.enabled;
    if (body.password !== undefined) {
      const password = String(body.password ?? "").trim();
      payload.password_hash = password ? await hashGuestPassword(password) : null;
    }
    if (body.exportOpenAt !== undefined) {
      const value = optionalDate(body.exportOpenAt);
      if (body.exportOpenAt && !value) return errorResponse("Thời gian mở xuất không hợp lệ.");
      payload.export_open_at = value;
    }
    if (body.exportCloseAt !== undefined) {
      const value = optionalDate(body.exportCloseAt);
      if (body.exportCloseAt && !value) return errorResponse("Thời gian đóng xuất không hợp lệ.");
      payload.export_close_at = value;
    }
    const startsAt = new Date(String(payload.starts_at ?? currentSlot.starts_at));
    const endsAt = new Date(String(payload.ends_at ?? currentSlot.ends_at));
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt.getTime() <= startsAt.getTime()) return errorResponse("Thời gian kíp thi không hợp lệ.");
    const exportOpenAt = payload.export_open_at === undefined ? currentSlot.export_open_at : payload.export_open_at;
    const exportCloseAt = payload.export_close_at === undefined ? currentSlot.export_close_at : payload.export_close_at;
    const gracePeriodMinutes = Number(payload.grace_period_minutes ?? currentSlot.grace_period_minutes ?? 30);
    if (!isGuestExportWindowValid(endsAt, gracePeriodMinutes, exportOpenAt, exportCloseAt)) return errorResponse("Thời gian đóng xuất phải sau thời gian mở xuất.");
    const audit = await startExamAdminAudit(admin, {
      adminId: security.user.id,
      examId,
      slotId,
      action: "update_exam_access_slot",
      metadata: {
        changed_fields: Object.keys(payload).filter(key => key !== "updated_at").join(","),
        enabled: typeof body.enabled === "boolean" ? body.enabled : null,
        export_window_configured: Boolean(exportOpenAt || exportCloseAt),
      },
    });
    if (!audit.ok) return auditUnavailableResponse();
    const result = await admin.from("exam_access_slots").update(payload).eq("id", slotId);
    if (result.error) {
      await finishExamAdminAudit(admin, audit.audit.id, "failed");
      return errorResponse(result.error.message, 503);
    }
    await finishExamAdminAudit(admin, audit.audit.id, "succeeded");
    return Response.json({ saved: true }, { headers });
  }
  return errorResponse("Thao tác không hợp lệ.");
}

export async function PUT(request: Request) {
  return POST(request);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
