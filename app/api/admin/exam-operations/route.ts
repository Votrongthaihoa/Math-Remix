import { ensureActiveAccount } from "../../../../lib/security-server";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { finishExamAdminAudit, startExamAdminAudit } from "../../../../lib/admin-audit-server";
import { answersMatch, hasAnswerValue } from "../../../../lib/exam-answers";
import { analyzeExamMonitorEvents } from "../../../../lib/exam-monitor";
import { normalizeExamPolicy } from "../../../../lib/exam-policy";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function adminRequest(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security;
  if (security.profile.role !== "admin") return { ok: false as const, response: Response.json({ error: "Bạn không có quyền quản trị." }, { status: 403, headers }) };
  return security;
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers });
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : fallback;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function requiredReason(value: unknown) {
  const reason = String(value ?? "").trim().slice(0, 500);
  return reason.length >= 1 ? reason : null;
}

function identityValue(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" ? item : "";
}

export async function GET(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const admin = security.admin;
  const params = new URL(request.url).searchParams;
  const examId = params.get("examId")?.trim() ?? "";
  const slotId = params.get("slotId")?.trim() ?? "";
  const includeAccount = params.get("includeAccount") === "true";
  if (!UUID.test(examId)) return errorResponse("Thiếu mã đề thi.");

  const accountResult = slotId && !includeAccount
    ? { data: [], error: null }
    : await admin.from("exam_attempts").select("id,exam_id,student_id,section_id,title,status,score,correct_answers,total_questions,answers,flagged_questions,exam_code,progress_version,time_extension_seconds,network_state,monitor_events,scoring_version,started_at,submitted_at,duration_seconds").eq("exam_id", examId).order("started_at", { ascending: false }).limit(2000);
  const guestResult = slotId
    ? await admin.from("guest_exam_attempts").select("id,slot_id,exam_id,client_hash,guest_identity,status,score,correct_answers,total_questions,answers,flagged_questions,exam_code,progress_version,time_extension_seconds,network_state,monitor_events,scoring_version,started_at,submitted_at,duration_seconds").eq("exam_id", examId).eq("slot_id", slotId).order("started_at", { ascending: false }).limit(2000)
    : { data: [], error: null };
  if (accountResult.error || guestResult.error) return errorResponse("Không thể tải dữ liệu giám sát. Hãy kiểm tra migration 024–026.", 503);

  const accountRows = accountResult.data ?? [];
  const studentIds = [...new Set(accountRows.map(row => row.student_id).filter(Boolean))];
  const profiles = studentIds.length ? (await admin.from("profiles").select("id,full_name,student_code").in("id", studentIds)).data ?? [] : [];
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
  const attempts = [
    ...accountRows.map(row => ({ ...row, kind: "account", candidate_name: profileMap.get(row.student_id)?.full_name ?? "Thí sinh", candidate_code: profileMap.get(row.student_id)?.student_code ?? "" })),
    ...(guestResult.data ?? []).map(row => ({ ...row, kind: "guest", candidate_name: identityValue(row.guest_identity, "full_name") || identityValue(row.guest_identity, "name") || "Thí sinh tự do", candidate_code: identityValue(row.guest_identity, "candidate_code") })),
  ];
  const counts = attempts.reduce((output, attempt) => {
    const status = String(attempt.status);
    if (status === "in_progress") output.inProgress += 1;
    else if (status === "submitted" || status === "completed" || status === "graded") output.submitted += 1;
    else if (status === "expired") output.expired += 1;
    if (String(attempt.network_state) === "offline") output.offline += 1;
    if (["failed", "conflict"].includes(String(attempt.network_state))) output.autosaveErrors += 1;
    if (Array.isArray(attempt.monitor_events)) {
      const analysis = analyzeExamMonitorEvents(attempt.monitor_events);
      output.monitorEvents += analysis.eventCount;
      output.fullscreenExits += analysis.fullscreenExits;
      output.tabExits += analysis.tabExits;
      output.suspectedAppSwitches += analysis.suspectedAppSwitches;
      output.attentionAwaySeconds += Math.round(analysis.attentionAwayMs / 1_000);
      output.longestAwaySeconds = Math.max(output.longestAwaySeconds, Math.round(analysis.longestAttentionAwayMs / 1_000));
      output.fullscreenAwaySeconds += Math.round(analysis.fullscreenAwayMs / 1_000);
      output.visibilityEvents += attempt.monitor_events.filter(event => event && typeof event === "object" && String((event as Record<string, unknown>).type).startsWith("visibility_")).length;
      output.focusEvents += attempt.monitor_events.filter(event => event && typeof event === "object" && String((event as Record<string, unknown>).type).startsWith("window_")).length;
    }
    return output;
  }, { total: attempts.length, inProgress: 0, submitted: 0, expired: 0, offline: 0, autosaveErrors: 0, monitorEvents: 0, fullscreenExits: 0, visibilityEvents: 0, focusEvents: 0, tabExits: 0, suspectedAppSwitches: 0, attentionAwaySeconds: 0, longestAwaySeconds: 0, fullscreenAwaySeconds: 0 });
  const scoredAttempts = attempts.filter(attempt => ["submitted", "completed", "graded"].includes(String(attempt.status)) && Number.isFinite(Number(attempt.score)));
  const averageScore = scoredAttempts.length ? Math.round(scoredAttempts.reduce((sum, attempt) => sum + Number(attempt.score), 0) / scoredAttempts.length * 10) / 10 : null;
  const completionRate = counts.total ? Math.round(counts.submitted / counts.total * 100) : 0;

  let questionStats: Array<{ id: string; prompt: string; attempted: number; correct: number; accuracy: number }> = [];
  if (attempts.length) {
    const sectionRows = await admin.from("exam_sections").select("id").eq("exam_id", examId);
    const sectionIds = (sectionRows.data ?? []).map(section => section.id);
    const questionRows = sectionIds.length ? await admin.from("exam_questions").select("id,prompt,question_type,sort_order").in("section_id", sectionIds).order("sort_order").limit(500) : { data: [], error: null };
    const questionIds = (questionRows.data ?? []).map(question => question.id);
    const keyRows = questionIds.length ? await admin.from("exam_question_keys").select("question_id,correct_answer").in("question_id", questionIds) : { data: [], error: null };
    if (!questionRows.error && !keyRows.error) {
      const keyMap = new Map((keyRows.data ?? []).map(row => [row.question_id, row.correct_answer]));
      const scoredAttemptRows = attempts.filter(attempt => ["submitted", "completed", "graded"].includes(String(attempt.status))).slice(0, 500);
      questionStats = (questionRows.data ?? []).map(question => {
        let attempted = 0;
        let correct = 0;
        for (const attempt of scoredAttemptRows) {
          const answers = attempt.answers && typeof attempt.answers === "object" && !Array.isArray(attempt.answers) ? attempt.answers as Record<string, unknown> : {};
          const answer = answers[question.id];
          if (!hasAnswerValue(answer)) continue;
          attempted += 1;
          const ordered = ["inline", "true_false", "ordering", "drag_drop"].includes(String(question.question_type));
          if (keyMap.has(question.id) && answersMatch(answer, keyMap.get(question.id), ordered)) correct += 1;
        }
        return { id: question.id, prompt: question.prompt, attempted, correct, accuracy: attempted ? Math.round(correct / attempted * 100) : 0 };
      }).filter(question => question.attempted > 0).sort((left, right) => left.accuracy - right.accuracy).slice(0, 100);
    }
  }
  const [examMetaResult, slotMetaResult] = await Promise.all([
    admin.from("exams").select("id,room_id,title,exam_type,duration_minutes,settings,results_released_at").eq("id", examId).maybeSingle(),
    slotId ? admin.from("exam_access_slots").select("id,exam_id,name,token_hint,starts_at,ends_at,enabled,results_released_at").eq("id", slotId).eq("exam_id", examId).maybeSingle() : Promise.resolve({ data: null, error: null } as { data: null; error: null }),
  ]);
  if (examMetaResult.error || slotMetaResult.error || !examMetaResult.data) return errorResponse("Không thể tải thông tin kíp thi.", 503);
  const examMeta = examMetaResult.data;
  const slotMeta = slotMetaResult.data;
  const sessionPolicy = normalizeExamPolicy(examMeta.settings, { examType: examMeta.exam_type, mode: "official", audience: slotId ? "guest" : "account", durationMinutes: examMeta.duration_minutes });
  const sessionMode = includeAccount && slotId ? "both" : slotId ? "link_qr" : "account";
  const session = {
    id: slotMeta?.id ?? `account:${examId}`,
    name: slotMeta?.name ?? `${examMeta.title} · Tài khoản`,
    mode: sessionMode,
    examTitle: examMeta.title,
    examType: examMeta.exam_type,
    roomId: examMeta.room_id,
    startsAt: slotMeta?.starts_at ?? sessionPolicy.timing.opensAt,
    endsAt: slotMeta?.ends_at ?? sessionPolicy.timing.closesAt,
    enabled: slotMeta?.enabled ?? true,
    resultsReleasedAt: slotMeta?.results_released_at ?? examMeta.results_released_at ?? null,
    tokenHint: slotMeta?.token_hint ?? null,
  };
  return Response.json({ session, attempts, stats: { ...counts, averageScore, completionRate }, questionStats, serverTime: new Date().toISOString() }, { headers });
}

type Body = {
  action?: "extend_time" | "grant_retry";
  examId?: string;
  attemptId?: string;
  attemptKind?: "account" | "guest";
  studentId?: string;
  additionalAttempts?: number;
  extensionSeconds?: number;
  reason?: string;
};

export async function POST(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return Response.json(jsonBodyError(parsed.error), { status: parsed.error === "payload_too_large" ? 413 : 400, headers });
  const body = parsed.body;
  const examId = body.examId?.trim() ?? "";
  if (!UUID.test(examId) || !body.action) return errorResponse("Thiếu mã đề hoặc thao tác.");
  const reason = requiredReason(body.reason);
  if (!reason) return errorResponse("Vui lòng nhập lý do thao tác.");
  const admin = security.admin;
  const kind = body.attemptKind === "guest" ? "guest" : "account";

  if (body.action === "extend_time") {
    if (!body.attemptId || !UUID.test(body.attemptId)) return errorResponse("Thiếu mã lượt thi.");
    const extensionSeconds = boundedInteger(body.extensionSeconds, 300, 60, 86400);
    const source = kind === "guest"
      ? await admin.from("guest_exam_attempts").select("id,exam_id,slot_id,status,time_extension_seconds").eq("id", body.attemptId).eq("exam_id", examId).maybeSingle()
      : await admin.from("exam_attempts").select("id,exam_id,student_id,status,time_extension_seconds").eq("id", body.attemptId).eq("exam_id", examId).maybeSingle();
    if (source.error) return errorResponse("Không thể đọc lượt thi.", 503);
    if (!source.data || source.data.status !== "in_progress") return errorResponse("Chỉ có thể gia hạn lượt thi đang diễn ra.", 409);
    const sourceRow = source.data as { id: string; exam_id: string; slot_id?: string | null; student_id?: string | null; status: string; time_extension_seconds?: number | null };
    const audit = await startExamAdminAudit(admin, { adminId: security.user.id, examId, slotId: kind === "guest" ? sourceRow.slot_id : null, action: "extend_exam_attempt_time", metadata: { attempt_kind: kind, extension_seconds: extensionSeconds } });
    if (!audit.ok) return errorResponse("Không thể ghi nhật ký thao tác.", 503);
    const nextExtension = Number(sourceRow.time_extension_seconds ?? 0) + extensionSeconds;
    const adjustment = await admin.from("exam_attempt_adjustments").insert({ attempt_kind: kind, attempt_id: body.attemptId, exam_id: examId, slot_id: kind === "guest" ? sourceRow.slot_id : null, student_id: kind === "account" ? sourceRow.student_id : null, extension_seconds: extensionSeconds, reason, created_by: security.user.id }).select("id").single();
    const updated = kind === "guest"
      ? await admin.from("guest_exam_attempts").update({ time_extension_seconds: nextExtension }).eq("id", body.attemptId).eq("status", "in_progress").select("id,time_extension_seconds").maybeSingle()
      : await admin.from("exam_attempts").update({ time_extension_seconds: nextExtension }).eq("id", body.attemptId).eq("status", "in_progress").select("id,time_extension_seconds").maybeSingle();
    if (adjustment.error || updated.error || !updated.data) {
      if (adjustment.data?.id) await admin.from("exam_attempt_adjustments").delete().eq("id", adjustment.data.id);
      await finishExamAdminAudit(admin, audit.audit.id, "failed");
      return errorResponse("Không thể gia hạn lượt thi.", 503);
    }
    await finishExamAdminAudit(admin, audit.audit.id, "succeeded");
    return Response.json({ saved: true, attemptId: body.attemptId, timeExtensionSeconds: nextExtension }, { headers });
  }

  if (body.action === "grant_retry") {
    const additionalAttempts = boundedInteger(body.additionalAttempts, 1, 1, 100);
    let grant: Record<string, unknown> = { exam_id: examId, additional_attempts: additionalAttempts, reason, created_by: security.user.id };
    let slotId: string | null = null;
    if (kind === "guest") {
      if (!body.attemptId || !UUID.test(body.attemptId)) return errorResponse("Cần chọn lượt thi link để cấp lượt lại.");
      const { data: attempt, error } = await admin.from("guest_exam_attempts").select("id,slot_id,client_hash").eq("id", body.attemptId).eq("exam_id", examId).maybeSingle();
      if (error || !attempt || !attempt.client_hash) return errorResponse("Không tìm thấy thí sinh của lượt link.", 404);
      slotId = attempt.slot_id;
      grant = { ...grant, slot_id: slotId, client_hash: attempt.client_hash, candidate_code: "" };
    } else {
      if (!body.studentId || !UUID.test(body.studentId)) return errorResponse("Cần chọn mã học viên để cấp lượt lại.");
      const { data: student } = await admin.from("profiles").select("id").eq("id", body.studentId).maybeSingle();
      if (!student) return errorResponse("Không tìm thấy học viên.", 404);
      grant = { ...grant, student_id: body.studentId };
    }
    const audit = await startExamAdminAudit(admin, { adminId: security.user.id, examId, slotId, action: "grant_exam_attempt_retry", metadata: { attempt_kind: kind, additional_attempts: additionalAttempts } });
    if (!audit.ok) return errorResponse("Không thể ghi nhật ký thao tác.", 503);
    const { data: saved, error } = await admin.from("exam_attempt_grants").insert(grant).select("id,additional_attempts,created_at").single();
    if (error || !saved) { await finishExamAdminAudit(admin, audit.audit.id, "failed"); return errorResponse("Không thể cấp lượt thi lại.", 503); }
    await finishExamAdminAudit(admin, audit.audit.id, "succeeded");
    return Response.json({ saved: true, grant: saved }, { headers });
  }
  return errorResponse("Thao tác không hợp lệ.");
}
