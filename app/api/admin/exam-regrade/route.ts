import { readAnswerKeySnapshot, scoreExamQuestionsWithOverridesForContext, type QuestionScoringOverride } from "../../../../lib/exam-answers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyQuestionSnapshotOrder } from "../../../../lib/exam-content-server";
import { ensureAdminPermission } from "../../../../lib/admin-authorization-server";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { finishExamAdminAudit, startExamAdminAudit } from "../../../../lib/admin-audit-server";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function adminRequest(request: Request) {
  return ensureAdminPermission(request, "exam-results");
}
function errorResponse(message: string, status = 400) { return Response.json({ error: message }, { status, headers }); }
function reasonValue(value: unknown) { const reason = String(value ?? "").trim().slice(0, 500); return reason || null; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

type AttemptRow = { id: string; exam_id: string; section_id?: string | null; answers: unknown; question_order: unknown; option_order: unknown; answer_key_snapshot?: unknown; score?: number | null; correct_answers?: number | null; total_questions?: number | null; status: string; scoring_version?: number | null; original_score?: number | null; original_correct_answers?: number | null; original_total_questions?: number | null };
type QuestionRow = { id: string; section_id: string; question_type: string; options?: unknown[]; sort_order?: number | null };
type SectionRow = { id: string; title: string; subject_code?: string | null };
type OverrideRow = { question_id: string; override_mode: QuestionScoringOverride["override_mode"]; accepted_answers: unknown };

async function scoringInputs(admin: SupabaseClient, examId: string, slotId?: string) {
  const [sectionResult, examResult, slotResult] = await Promise.all([
    admin.from("exam_sections").select("id,title,subject_code").eq("exam_id", examId),
    admin.from("exams").select("id,room_id,exam_type").eq("id", examId).maybeSingle(),
    slotId
      ? admin.from("exam_access_slots").select("section_id").eq("id", slotId).eq("exam_id", examId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const sections = (sectionResult.data ?? []) as SectionRow[];
  const sectionIds = sections.map(section => section.id);
  const questions = sectionIds.length ? ((await admin.from("exam_questions").select("id,section_id,question_type,options,sort_order").in("section_id", sectionIds).order("sort_order")).data ?? []) as QuestionRow[] : [];
  const keys = questions.length ? ((await admin.from("exam_question_keys").select("question_id,correct_answer").in("question_id", questions.map(question => question.id))).data ?? []) : [];
  const room = examResult.data?.room_id
    ? (await admin.from("exam_rooms").select("exam_type").eq("id", examResult.data.room_id).maybeSingle()).data
    : null;
  const examType = [room?.exam_type, examResult.data?.exam_type].find(value => String(value ?? "").trim().toUpperCase() === "THPTQG") ?? examResult.data?.exam_type ?? room?.exam_type;
  const attemptQuery = slotId
    ? admin.from("guest_exam_attempts").select("id,exam_id,question_order,option_order,answer_key_snapshot,answers,score,correct_answers,total_questions,status,scoring_version,original_score,original_correct_answers,original_total_questions").eq("exam_id", examId).eq("slot_id", slotId).neq("status", "in_progress")
    : admin.from("exam_attempts").select("id,exam_id,section_id,question_order,option_order,answer_key_snapshot,answers,score,correct_answers,total_questions,status,scoring_version,original_score,original_correct_answers,original_total_questions").eq("exam_id", examId).neq("status", "in_progress");
  const attempts = (await attemptQuery).data ?? [];
  return { questions, keys, attempts: attempts as AttemptRow[], sections, examType, guestSectionId: slotResult.data?.section_id ?? null };
}

function scoreAttempt(attempt: AttemptRow, questions: QuestionRow[], keys: Array<{ question_id: string; correct_answer: unknown }>, overrides: Map<string, OverrideRow>, context: { sections: SectionRow[]; examType?: string | null; guestSectionId?: string | null }) {
  const sectionId = attempt.section_id ?? context.guestSectionId;
  const scoped = sectionId ? questions.filter(question => question.section_id === sectionId) : questions;
  const ordered = applyQuestionSnapshotOrder(scoped, attempt.question_order, attempt.option_order);
  const snapshot = readAnswerKeySnapshot(attempt.answer_key_snapshot);
  const keyMap = snapshot.size
    ? new Map([...snapshot.entries()].map(([questionId, entry]) => [questionId, entry.correct_answer]))
    : new Map(keys.map(key => [key.question_id, key.correct_answer]));
  const answerMap = asRecord(attempt.answers);
  const overrideMap = new Map<string, QuestionScoringOverride>([...overrides.entries()].map(([id, value]) => [id, { override_mode: value.override_mode, accepted_answers: value.accepted_answers }]));
  const section = sectionId ? context.sections.find(item => item.id === sectionId) : undefined;
  return scoreExamQuestionsWithOverridesForContext(ordered, answerMap, keyMap, overrideMap, {
    examType: context.examType,
    subjectCode: section?.subject_code,
    subjectTitle: section?.title,
  });
}

async function readOverrides(admin: SupabaseClient, versionId: string) {
  const { data } = await admin.from("exam_question_overrides").select("question_id,override_mode,accepted_answers").eq("scoring_version_id", versionId);
  return new Map<string, OverrideRow>((data ?? []).map((row: OverrideRow) => [row.question_id, row]));
}

async function createVersion(admin: SupabaseClient, examId: string, reason: string, adminId: string, overrides: Array<{ questionId: string; mode: QuestionScoringOverride["override_mode"]; acceptedAnswers?: unknown }>) {
  const latest = (await admin.from("exam_scoring_versions").select("version").eq("exam_id", examId).order("version", { ascending: false }).limit(1).maybeSingle()).data?.version ?? 0;
  const versionResult = await admin.from("exam_scoring_versions").insert({ exam_id: examId, version: Number(latest) + 1, status: "draft", reason, created_by: adminId }).select("id,exam_id,version,status,reason,created_at").single();
  if (versionResult.error || !versionResult.data) return { error: versionResult.error ?? new Error("scoring_version_create_failed") };
  if (overrides.length) {
    const rows = overrides.map(item => ({ scoring_version_id: versionResult.data.id, question_id: item.questionId, override_mode: item.mode, accepted_answers: Array.isArray(item.acceptedAnswers) ? item.acceptedAnswers.slice(0, 100) : [], reason }));
    const overrideResult = await admin.from("exam_question_overrides").insert(rows);
    if (overrideResult.error) {
      await admin.from("exam_scoring_versions").delete().eq("id", versionResult.data.id);
      return { error: overrideResult.error };
    }
  }
  return { version: versionResult.data };
}

async function examQuestionIds(admin: SupabaseClient, examId: string) {
  const sections = (await admin.from("exam_sections").select("id").eq("exam_id", examId)).data ?? [];
  if (!sections.length) return new Set<string>();
  const questions = (await admin.from("exam_questions").select("id").in("section_id", sections.map(section => section.id))).data ?? [];
  return new Set(questions.map(question => question.id));
}

export async function GET(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const params = new URL(request.url).searchParams;
  const examId = params.get("examId") ?? "";
  if (!UUID.test(examId)) return errorResponse("Thiếu mã đề thi.");
  const [versions, runs, sections] = await Promise.all([
    security.admin.from("exam_scoring_versions").select("id,exam_id,version,status,reason,created_by,created_at,applied_at").eq("exam_id", examId).order("version", { ascending: false }),
    security.admin.from("exam_regrade_runs").select("id,exam_id,scoring_version_id,status,attempt_count,affected_count,summary,reason,created_by,created_at,applied_at").eq("exam_id", examId).order("created_at", { ascending: false }),
    security.admin.from("exam_sections").select("id,title,sort_order").eq("exam_id", examId).order("sort_order"),
  ]);
  if (versions.error || runs.error) return errorResponse("Không thể tải lịch sử chấm lại.", 503);
  const sectionIds = (sections.data ?? []).map(section => section.id);
  const questions = sectionIds.length
    ? (await security.admin.from("exam_questions").select("id,section_id,prompt,question_type,sort_order").in("section_id", sectionIds).order("sort_order")).data ?? []
    : [];
  const sectionTitle = new Map((sections.data ?? []).map(section => [section.id, section.title]));
  return Response.json({ versions: versions.data ?? [], runs: runs.data ?? [], questions: questions.map(question => ({ ...question, section_title: sectionTitle.get(question.section_id) ?? "" })) }, { headers });
}

type Body = { action?: "create_version" | "preview" | "apply"; examId?: string; slotId?: string; versionId?: string; reason?: string; overrides?: Array<{ questionId?: string; mode?: QuestionScoringOverride["override_mode"]; acceptedAnswers?: unknown }> };

export async function POST(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return Response.json(jsonBodyError(parsed.error), { status: parsed.error === "payload_too_large" ? 413 : 400, headers });
  const body = parsed.body;
  const examId = body.examId ?? "";
  const reason = reasonValue(body.reason);
  if (!UUID.test(examId) || !body.action || !reason) return errorResponse("Thiếu đề, thao tác hoặc lý do.");
  const admin = security.admin;
  const rawOverrides = body.overrides ?? [];
  if (rawOverrides.some(item => !item.questionId || !UUID.test(item.questionId) || !["normal", "accept_multiple", "void_question", "award_all"].includes(String(item.mode)))) return errorResponse("Override câu hỏi không hợp lệ.");
  const cleanOverrides = rawOverrides.map(item => ({ questionId: item.questionId!, mode: item.mode!, acceptedAnswers: item.acceptedAnswers }));

  if (body.action === "create_version" || body.action === "preview") {
    const validQuestionIds = await examQuestionIds(admin, examId);
    if (cleanOverrides.some(item => !validQuestionIds.has(item.questionId))) return errorResponse("Có câu hỏi không thuộc đề thi này.");
    const audit = await startExamAdminAudit(admin, { adminId: security.user.id, examId, action: body.action === "preview" ? "preview_exam_regrade" : "create_exam_scoring_version", metadata: { override_count: cleanOverrides.length } });
    if (!audit.ok) return errorResponse("Không thể ghi nhật ký thao tác.", 503);
    const created = await createVersion(admin, examId, reason, security.user.id, cleanOverrides);
    if (created.error || !created.version) { await finishExamAdminAudit(admin, audit.audit.id, "failed"); return errorResponse("Không thể tạo phiên bản chấm điểm.", 503); }
    if (body.action === "create_version") { await finishExamAdminAudit(admin, audit.audit.id, "succeeded"); return Response.json({ version: created.version }, { status: 201, headers }); }
    const inputs = await scoringInputs(admin, examId, body.slotId);
    const overrides = await readOverrides(admin, created.version.id);
    const impacts = inputs.attempts.map(attempt => {
      const next = scoreAttempt(attempt, inputs.questions, inputs.keys, overrides, inputs);
      return { id: attempt.id, before: Number(attempt.score ?? 0), after: next.score, correctBefore: Number(attempt.correct_answers ?? 0), correctAfter: next.correctAnswers, totalBefore: Number(attempt.total_questions ?? 0), totalAfter: next.totalQuestions };
    });
    const affected = impacts.filter(item => item.before !== item.after || item.correctBefore !== item.correctAfter || item.totalBefore !== item.totalAfter);
    const run = await admin.from("exam_regrade_runs").insert({ exam_id: examId, scoring_version_id: created.version.id, status: "preview", attempt_count: impacts.length, affected_count: affected.length, summary: { sample: affected.slice(0, 100), voided_questions: [...overrides.values()].filter(item => item.override_mode === "void_question").length }, reason, created_by: security.user.id }).select("id,status,attempt_count,affected_count,summary").single();
    if (run.error) { await finishExamAdminAudit(admin, audit.audit.id, "failed"); return errorResponse("Không thể lưu preview chấm lại.", 503); }
    await finishExamAdminAudit(admin, audit.audit.id, "succeeded");
    return Response.json({ version: created.version, run: run.data, impact: { attemptCount: impacts.length, affectedCount: affected.length, sample: affected.slice(0, 100) } }, { headers });
  }

  if (body.action === "apply") {
    if (!body.versionId || !UUID.test(body.versionId)) return errorResponse("Thiếu phiên bản chấm điểm.");
    const version = await admin.from("exam_scoring_versions").select("id,exam_id,version,status").eq("id", body.versionId).eq("exam_id", examId).maybeSingle();
    if (version.error || !version.data) return errorResponse("Không tìm thấy phiên bản chấm điểm.", 404);
    if (version.data.status !== "draft") return errorResponse("Chỉ có thể áp dụng phiên bản chấm điểm ở trạng thái nháp.", 409);
    const audit = await startExamAdminAudit(admin, { adminId: security.user.id, examId, action: "apply_exam_regrade", metadata: { scoring_version: version.data.version } });
    if (!audit.ok) return errorResponse("Không thể ghi nhật ký thao tác.", 503);
    const inputs = await scoringInputs(admin, examId, body.slotId);
    const overrides = await readOverrides(admin, body.versionId);
    const impacts = inputs.attempts.map(attempt => ({ attempt, next: scoreAttempt(attempt, inputs.questions, inputs.keys, overrides, inputs) }));
    const affected = impacts.filter(item => Number(item.attempt.score ?? 0) !== item.next.score || Number(item.attempt.correct_answers ?? 0) !== item.next.correctAnswers || Number(item.attempt.total_questions ?? 0) !== item.next.totalQuestions);
    const updatedAttempts: Array<{ guest: boolean; id: string; payload: Record<string, unknown> }> = [];
    for (const item of impacts) {
      const attempt = item.attempt;
      const payload = { score: item.next.score, correct_answers: item.next.correctAnswers, total_questions: item.next.totalQuestions, scoring_version: version.data.version, original_score: attempt.original_score ?? attempt.score ?? 0, original_correct_answers: attempt.original_correct_answers ?? attempt.correct_answers ?? 0, original_total_questions: attempt.original_total_questions ?? attempt.total_questions ?? 0 };
      const previous = { score: attempt.score ?? null, correct_answers: attempt.correct_answers ?? 0, total_questions: attempt.total_questions ?? 0, scoring_version: attempt.scoring_version ?? 1, original_score: attempt.original_score ?? null, original_correct_answers: attempt.original_correct_answers ?? null, original_total_questions: attempt.original_total_questions ?? null };
      const result = attempt.id && body.slotId
        ? await admin.from("guest_exam_attempts").update(payload).eq("id", attempt.id).eq("status", "submitted")
        : await admin.from("exam_attempts").update(payload).eq("id", attempt.id).in("status", ["submitted", "completed", "graded"]);
      if (result.error) {
        for (const changed of updatedAttempts.reverse()) {
          if (changed.guest) await admin.from("guest_exam_attempts").update(changed.payload).eq("id", changed.id);
          else await admin.from("exam_attempts").update(changed.payload).eq("id", changed.id);
        }
        await finishExamAdminAudit(admin, audit.audit.id, "failed");
        return errorResponse("Regrade bị dừng vì không cập nhật được toàn bộ kết quả.", 503);
      }
      updatedAttempts.push({ guest: Boolean(body.slotId), id: attempt.id, payload: previous });
    }
    await admin.from("exam_scoring_versions").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", body.versionId);
    const run = await admin.from("exam_regrade_runs").insert({ exam_id: examId, scoring_version_id: body.versionId, status: "applied", attempt_count: impacts.length, affected_count: affected.length, summary: { affected: affected.slice(0, 100) }, reason, created_by: security.user.id, applied_at: new Date().toISOString() }).select("id,status,attempt_count,affected_count").single();
    await finishExamAdminAudit(admin, audit.audit.id, "succeeded");
    return Response.json({ applied: true, run: run.data, affectedCount: affected.length }, { headers });
  }
  return errorResponse("Thao tác không hợp lệ.");
}
