import { ensureAdminPermission } from "../../../../lib/admin-authorization-server";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { normalizeExamType } from "../../../../lib/exam-config";
import { normalizeGuestSettings } from "../../../../lib/guest-exam-server";
import { normalizeExamPolicy, policyFromExamSettings, publicExamPolicy } from "../../../../lib/exam-policy";
import { finishExamAdminAudit, startExamAdminAudit } from "../../../../lib/admin-audit-server";
import { runExamPreflight } from "../../../../lib/exam-preflight-server";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function adminRequest(request: Request) {
  return ensureAdminPermission(request, "exams");
}
function errorResponse(message: string, status = 400) { return Response.json({ error: message }, { status, headers }); }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

const builtInPresets = [
  { slug: "practice", name: "Luyện tập", policy: { mode: "practice", access: { maxAttempts: 0 }, integrity: { fullscreenRequired: false, visibilityMonitoring: false, focusMonitoring: false }, release: { score: "after_submit", answers: "after_submit" } } },
  { slug: "homework", name: "Bài tập", policy: { mode: "practice", access: { maxAttempts: 1 }, release: { score: "after_submit", answers: "never" } } },
  { slug: "quick-quiz", name: "Kiểm tra nhanh", policy: { mode: "official", timing: { durationMinutes: 15 }, access: { maxAttempts: 1 }, release: { score: "after_submit", answers: "never" } } },
  { slug: "class-test", name: "Kiểm tra trên lớp", policy: { mode: "official", access: { maxAttempts: 1 }, randomization: { shuffleQuestions: true, shuffleOptions: true, randomizationMode: "per_attempt" }, release: { score: "after_slot", answers: "after_slot" } } },
  { slug: "mock-exam", name: "Thi thử", policy: { mode: "official", access: { maxAttempts: 1 }, randomization: { shuffleQuestions: true, shuffleOptions: true, randomizationMode: "exam_code", examCodeCount: 4 }, release: { score: "manual", answers: "manual" } } },
  { slug: "strict-exam", name: "Thi nghiêm túc", policy: { mode: "official", access: { maxAttempts: 1 }, randomization: { shuffleQuestions: true, shuffleOptions: true, randomizationMode: "per_attempt" }, navigation: { allowBacktrack: false, allowSkip: false, requireAnswerBeforeNext: true }, integrity: { fullscreenRequired: true, visibilityMonitoring: true, focusMonitoring: true, copyProtection: true, pasteProtection: true }, release: { score: "manual", answers: "never", solutions: "never" } } },
];

export async function GET(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const params = new URL(request.url).searchParams;
  const examId = params.get("examId") ?? "";
  if (!UUID.test(examId)) return errorResponse("Thiếu mã đề thi.");
  const [examResult, presetResult, templateResult] = await Promise.all([
    security.admin.from("exams").select("id,title,exam_type,duration_minutes,settings,structure_config,published,results_released_at").eq("id", examId).maybeSingle(),
    security.admin.from("exam_policy_presets").select("id,name,slug,policy,is_system,created_at,updated_at").order("name"),
    security.admin.from("exam_templates").select("id,name,exam_type,profile_config,policy,source_exam_id,created_at,updated_at").eq("created_by", security.user.id).order("updated_at", { ascending: false }),
  ]);
  if (examResult.error || !examResult.data) return errorResponse("Không thể tải cấu hình đề thi.", 503);
  const exam = examResult.data;
  const policy = policyFromExamSettings(exam.settings, { examType: exam.exam_type, durationMinutes: exam.duration_minutes });
  return Response.json({ exam: { id: exam.id, title: exam.title, exam_type: normalizeExamType(exam.exam_type), duration_minutes: exam.duration_minutes, published: exam.published, results_released_at: exam.results_released_at ?? null }, policy: publicExamPolicy(policy), guestSettings: normalizeGuestSettings(exam.settings), presets: [...builtInPresets, ...(presetResult.data ?? [])], templates: templateResult.data ?? [] }, { headers });
}

type Body = { action?: "save_policy" | "preflight" | "publish_exam" | "save_preset" | "save_template" | "release_results"; examId?: string; policy?: unknown; name?: string; slug?: string; sourceExamId?: string; profileConfig?: unknown };

export async function POST(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return Response.json(jsonBodyError(parsed.error), { status: parsed.error === "payload_too_large" ? 413 : 400, headers });
  const body = parsed.body;
  const examId = body.examId ?? "";
  if (!UUID.test(examId) || !body.action) return errorResponse("Thiếu đề hoặc thao tác.");
  const examResult = await security.admin.from("exams").select("id,room_id,title,exam_type,duration_minutes,settings,structure_config,published,results_released_at").eq("id", examId).maybeSingle();
  if (examResult.error || !examResult.data) return errorResponse("Không tìm thấy đề thi.", 404);
  const exam = examResult.data;

  if (body.action === "release_results") {
    const policy = policyFromExamSettings(exam.settings, { examType: exam.exam_type, durationMinutes: exam.duration_minutes });
    const manualConfigured = [policy.release.score, policy.release.answers, policy.release.solutions].includes("manual");
    if (!manualConfigured) return errorResponse("Exam Policy hiện tại không có mục phát hành thủ công.", 409);
    const releasedAt = new Date().toISOString();
    const audit = await startExamAdminAudit(security.admin, { adminId: security.user.id, examId, roomId: exam.room_id, action: "release_exam_results", metadata: { release_scope: "account", manual: true } });
    if (!audit.ok) return errorResponse("Không thể ghi nhật ký thao tác.", 503);
    const released = await security.admin.from("exams").update({ results_released_at: releasedAt }).eq("id", examId);
    if (released.error) { await finishExamAdminAudit(security.admin, audit.audit.id, "failed"); return errorResponse("Không thể mở kết quả.", 503); }
    await finishExamAdminAudit(security.admin, audit.audit.id, "succeeded");
    return Response.json({ released: true, results_released_at: releasedAt }, { headers });
  }

  if (body.action === "publish_exam") {
    if (exam.published) return Response.json({ published: true, canPublish: true }, { headers });
    let preflight;
    try {
      preflight = await runExamPreflight(security.admin, examId);
    } catch (value) {
      return errorResponse(value instanceof Error ? `Không thể kiểm tra preflight: ${value.message}` : "Không thể kiểm tra preflight của đề.", 503);
    }
    if (!preflight.canPublish) {
      return Response.json({ error: "Đề chưa đạt preflight.", ...preflight }, { status: 409, headers });
    }
    const audit = await startExamAdminAudit(security.admin, {
      adminId: security.user.id,
      examId,
      roomId: exam.room_id,
      action: "publish_exam",
      metadata: { preflight_status: preflight.status, check_count: preflight.checks.length },
    });
    if (!audit.ok) return errorResponse("Không thể ghi nhật ký trước khi xuất bản đề.", 503);
    const published = await security.admin.from("exams").update({ published: true }).eq("id", examId).eq("published", false).select("id,published").maybeSingle();
    if (published.error || !published.data?.published) {
      await finishExamAdminAudit(security.admin, audit.audit.id, "failed");
      return errorResponse("Không thể xuất bản đề sau preflight.", 503);
    }
    await finishExamAdminAudit(security.admin, audit.audit.id, "succeeded");
    return Response.json({ published: true, canPublish: true }, { headers });
  }

  if (body.action === "save_policy") {
    const policy = normalizeExamPolicy(body.policy, { examType: exam.exam_type, durationMinutes: exam.duration_minutes });
    const settings = { ...asRecord(exam.settings), policy };
    const audit = await startExamAdminAudit(security.admin, { adminId: security.user.id, examId, roomId: exam.room_id, action: "save_exam_access_config", metadata: { policy_version: policy.version, randomization_mode: policy.randomization.randomizationMode, fullscreen_required: policy.integrity.fullscreenRequired } });
    if (!audit.ok) return errorResponse("Không thể ghi nhật ký thao tác.", 503);
    const saved = await security.admin.from("exams").update({ settings }).eq("id", examId).select("id,settings").single();
    if (saved.error) { await finishExamAdminAudit(security.admin, audit.audit.id, "failed"); return errorResponse("Không thể lưu Exam Policy.", 503); }
    await finishExamAdminAudit(security.admin, audit.audit.id, "succeeded");
    return Response.json({ saved: true, policy: publicExamPolicy(policy) }, { headers });
  }

  if (body.action === "preflight") {
    try {
      const preflight = await runExamPreflight(security.admin, examId);
      return Response.json({ ...preflight, checks: [...preflight.checks, { code: "policy", level: "pass", message: "Exam Policy đã được chuẩn hóa." }] }, { headers });
    } catch (value) {
      return errorResponse(value instanceof Error ? `Không thể kiểm tra preflight: ${value.message}` : "Không thể kiểm tra preflight của đề.", 503);
    }
  }

  if (body.action === "save_preset") {
    const name = String(body.name ?? "").trim().slice(0, 120);
    const slug = String(body.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim().slice(0, 120);
    if (!name || !slug) return errorResponse("Tên preset không hợp lệ.");
    const saved = await security.admin.from("exam_policy_presets").upsert({ name, slug, policy: normalizeExamPolicy(body.policy, { examType: exam.exam_type, durationMinutes: exam.duration_minutes }), is_system: false, created_by: security.user.id, updated_at: new Date().toISOString() }, { onConflict: "slug" }).select("id,name,slug,policy").single();
    if (saved.error) return errorResponse("Không thể lưu preset.", 503);
    return Response.json({ preset: saved.data }, { status: 201, headers });
  }

  if (body.action === "save_template") {
    const name = String(body.name ?? "").trim().slice(0, 120);
    if (!name) return errorResponse("Tên template không hợp lệ.");
    const saved = await security.admin.from("exam_templates").insert({ name, exam_type: exam.exam_type, profile_config: body.profileConfig && typeof body.profileConfig === "object" ? body.profileConfig : {}, policy: normalizeExamPolicy(body.policy, { examType: exam.exam_type, durationMinutes: exam.duration_minutes }), source_exam_id: body.sourceExamId && UUID.test(body.sourceExamId) ? body.sourceExamId : examId, created_by: security.user.id }).select("id,name,exam_type,profile_config,policy,source_exam_id,created_at").single();
    if (saved.error) return errorResponse("Không thể lưu template.", 503);
    return Response.json({ template: saved.data }, { status: 201, headers });
  }
  return errorResponse("Thao tác không hợp lệ.");
}
