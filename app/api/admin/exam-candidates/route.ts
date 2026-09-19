import { ensureAdminPermission } from "../../../../lib/admin-authorization-server";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { finishExamAdminAudit, startExamAdminAudit } from "../../../../lib/admin-audit-server";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function adminRequest(request: Request) {
  return ensureAdminPermission(request, "exams");
}

function errorResponse(message: string, status = 400) { return Response.json({ error: message }, { status, headers }); }

function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, 200) : ""; }

type Body = { action?: "preview" | "import"; examId?: string; slotId?: string; rows?: Array<Record<string, unknown>>; mapping?: Record<string, string> };

function normalizedRows(rows: Array<Record<string, unknown>>, mapping: Record<string, string>) {
  const seen = new Set<string>();
  const valid: Array<{ candidate_code: string; full_name: string; class_name: string; school: string; metadata: Record<string, unknown> }> = [];
  const errors: Array<{ row: number; message: string }> = [];
  rows.slice(0, 5000).forEach((row, index) => {
    const value = (key: string) => text(row[mapping[key] || key]);
    const candidateCode = value("candidate_code");
    const fullName = value("full_name");
    const className = value("class_name");
    const school = value("school");
    if (!candidateCode) { errors.push({ row: index + 1, message: "Thiếu mã thí sinh." }); return; }
    if (!fullName) { errors.push({ row: index + 1, message: "Thiếu họ và tên." }); return; }
    const normalizedCode = candidateCode.toUpperCase();
    if (seen.has(normalizedCode)) { errors.push({ row: index + 1, message: "Trùng mã thí sinh trong file." }); return; }
    seen.add(normalizedCode);
    const metadata = Object.fromEntries(Object.entries(row).filter(([key]) => !Object.values(mapping).includes(key) && !["candidate_code", "full_name", "class_name", "school"].includes(key)).slice(0, 24).map(([key, item]) => [key.slice(0, 64), text(item)]));
    valid.push({ candidate_code: normalizedCode.slice(0, 120), full_name: fullName, class_name: className, school, metadata });
  });
  if (rows.length > 5000) errors.push({ row: 5001, message: "File vượt quá 5.000 dòng." });
  return { valid, errors };
}

export async function GET(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const params = new URL(request.url).searchParams;
  const examId = params.get("examId") ?? "";
  const slotId = params.get("slotId") ?? "";
  if (!UUID.test(examId) || !UUID.test(slotId)) return errorResponse("Thiếu đề thi hoặc kíp thi.");
  const { data, error } = await security.admin.from("exam_slot_candidates").select("id,slot_id,exam_id,candidate_code,full_name,class_name,school,metadata,created_at,updated_at").eq("exam_id", examId).eq("slot_id", slotId).order("candidate_code");
  if (error) return errorResponse("Không thể tải danh sách thí sinh.", 503);
  return Response.json({ candidates: data ?? [] }, { headers });
}

export async function POST(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return Response.json(jsonBodyError(parsed.error), { status: parsed.error === "payload_too_large" ? 413 : 400, headers });
  const body = parsed.body;
  const examId = body.examId ?? "";
  const slotId = body.slotId ?? "";
  if (!UUID.test(examId) || !UUID.test(slotId) || !Array.isArray(body.rows)) return errorResponse("Dữ liệu import không hợp lệ.");
  const { data: slot } = await security.admin.from("exam_access_slots").select("id,exam_id").eq("id", slotId).eq("exam_id", examId).maybeSingle();
  if (!slot) return errorResponse("Không tìm thấy kíp thi.", 404);
  const result = normalizedRows(body.rows, body.mapping && typeof body.mapping === "object" ? body.mapping : {});
  const existingCodes = result.valid.length
    ? (await security.admin.from("exam_slot_candidates").select("candidate_code").eq("slot_id", slotId).in("candidate_code", result.valid.map(row => row.candidate_code))).data ?? []
    : [];
  const existing = new Set(existingCodes.map(row => String(row.candidate_code).toUpperCase()));
  const accepted = result.valid.filter(row => {
    if (!existing.has(row.candidate_code.toUpperCase())) return true;
    result.errors.push({ row: 0, message: `Mã thí sinh ${row.candidate_code} đã tồn tại.` });
    return false;
  });
  if (body.action !== "import") return Response.json({ validCount: accepted.length, errorCount: result.errors.length, errors: result.errors, preview: accepted.slice(0, 100) }, { headers });
  if (result.errors.length) return errorResponse("File còn dòng lỗi. Hãy sửa hoặc bỏ các dòng lỗi trước khi import.");
  const audit = await startExamAdminAudit(security.admin, { adminId: security.user.id, examId, slotId, action: "import_exam_slot_candidates", metadata: { row_count: accepted.length } });
  if (!audit.ok) return errorResponse("Không thể ghi nhật ký thao tác.", 503);
  const rows = accepted.map(row => ({ ...row, exam_id: examId, slot_id: slotId, created_by: security.user.id }));
  const { data: saved, error } = await security.admin.from("exam_slot_candidates").insert(rows).select("id,candidate_code,full_name,class_name,school");
  if (error || !saved) { await finishExamAdminAudit(security.admin, audit.audit.id, "failed"); return errorResponse("Không thể import danh sách thí sinh.", 503); }
  await finishExamAdminAudit(security.admin, audit.audit.id, "succeeded");
  return Response.json({ imported: saved.length, candidates: saved }, { status: 201, headers });
}
