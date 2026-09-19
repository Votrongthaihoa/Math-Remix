import * as XLSX from "xlsx";
import { ensureAdminPermission } from "../../../../lib/admin-authorization-server";
import { applyQuestionSnapshotOrder } from "../../../../lib/exam-content-server";
import { finishExamAdminAudit, startExamAdminAudit } from "../../../../lib/admin-audit-server";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function jsonText(value: unknown) { try { return JSON.stringify(value ?? null); } catch { return ""; } }
function label(value: unknown) { if (Array.isArray(value)) return value.join(", "); return value == null ? "" : String(value); }
function safeName(value: string) { return value.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 80) || "exam"; }

export async function GET(request: Request) {
  const security = await ensureAdminPermission(request, "exams");
  if (!security.ok) return security.response;
  const params = new URL(request.url).searchParams;
  const examId = params.get("examId") ?? "";
  if (!UUID.test(examId)) return Response.json({ error: "Thiếu mã đề thi." }, { status: 400, headers });
  const admin = security.admin;
  const [{ data: exam }, { data: sections }, { data: attempts }] = await Promise.all([
    admin.from("exams").select("id,title,exam_type,duration_minutes,settings").eq("id", examId).maybeSingle(),
    admin.from("exam_sections").select("id,title,sort_order").eq("exam_id", examId).order("sort_order"),
    admin.from("exam_attempts").select("id,student_id,section_id,title,status,score,correct_answers,total_questions,answers,question_order,option_order,flagged_questions,exam_code,policy_version,scoring_version,time_extension_seconds,network_state,monitor_events,original_score,original_correct_answers,original_total_questions,started_at,submitted_at,duration_seconds").eq("exam_id", examId).order("started_at"),
  ]);
  if (!exam) return Response.json({ error: "Không tìm thấy đề thi." }, { status: 404, headers });
  if (!attempts) return Response.json({ error: "Không thể tải attempt." }, { status: 503, headers });
  const profileIds = [...new Set(attempts.map(attempt => attempt.student_id).filter(Boolean))];
  const profiles = profileIds.length ? (await admin.from("profiles").select("id,full_name,student_code").in("id", profileIds)).data ?? [] : [];
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
  const sectionIds = (sections ?? []).map(section => section.id);
  const questions = sectionIds.length ? (await admin.from("exam_questions").select("id,section_id,prompt,question_type,options,sort_order").in("section_id", sectionIds).order("sort_order")).data ?? [] : [];
  const keys = questions.length ? (await admin.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", questions.map(question => question.id))).data ?? [] : [];
  const keyMap = new Map(keys.map(key => [key.question_id, key]));
  const orderedByAttempt = attempts.flatMap(attempt => applyQuestionSnapshotOrder(questions.filter(question => !attempt.section_id || question.section_id === attempt.section_id), attempt.question_order, attempt.option_order).map(question => ({ attempt, question })));
  const summary = attempts.map(attempt => ({ "Mã lượt": attempt.id, "Thí sinh": profileMap.get(attempt.student_id)?.full_name ?? "", "Mã học viên": profileMap.get(attempt.student_id)?.student_code ?? "", "Mã đề": attempt.exam_code ?? "", "Trạng thái": attempt.status, "Điểm": attempt.score ?? "", "Số câu đúng": attempt.correct_answers ?? "", "Tổng câu": attempt.total_questions ?? "", "Bắt đầu": attempt.started_at ?? "", "Nộp bài": attempt.submitted_at ?? "", "Thời gian (giây)": attempt.duration_seconds ?? "", "Gia hạn (giây)": attempt.time_extension_seconds ?? 0, "Mạng cuối": attempt.network_state ?? "", "Cờ xem lại": Array.isArray(attempt.flagged_questions) ? attempt.flagged_questions.length : 0, "Thoát toàn màn hình": Array.isArray(attempt.monitor_events) ? attempt.monitor_events.filter(event => event && typeof event === "object" && (event as Record<string, unknown>).type === "fullscreen_exit").length : 0, "Phiên bản chấm": attempt.scoring_version ?? 1, "Điểm gốc": attempt.original_score ?? "" }));
  const inputs = attempts.map(attempt => ({ "Mã lượt": attempt.id, "Thí sinh": profileMap.get(attempt.student_id)?.full_name ?? "", "Mã học viên": profileMap.get(attempt.student_id)?.student_code ?? "", "Input answers (JSON)": jsonText(attempt.answers), "Cờ xem lại (JSON)": jsonText(attempt.flagged_questions), "Monitor (JSON)": jsonText(attempt.monitor_events), "Policy version": attempt.policy_version ?? 1, "Scoring version": attempt.scoring_version ?? 1 }));
  const selected = orderedByAttempt.map(({ attempt, question }) => ({ "Mã lượt": attempt.id, "Thí sinh": profileMap.get(attempt.student_id)?.full_name ?? "", "Mã đề": attempt.exam_code ?? "", "ID câu": question.id, "Câu hỏi": label(question.prompt).slice(0, 500), "Loại": question.question_type, "Đã chọn": label((attempt.answers as Record<string, unknown> | null)?.[question.id]), "Đáp án hiện tại": label(keyMap.get(question.id)?.correct_answer), "Cờ xem lại": Array.isArray(attempt.flagged_questions) && attempt.flagged_questions.includes(question.id) ? "Có" : "Không" }));
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of [["Tổng hợp", summary], ["Input thí sinh", inputs], ["Câu đã chọn", selected]] as const) { const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Thông báo": "Không có dữ liệu" }]); sheet["!cols"] = [{ wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 44 }]; XLSX.utils.book_append_sheet(workbook, sheet, name); }
  const audit = await startExamAdminAudit(admin, { adminId: security.user.id, examId, action: "export_exam_results", metadata: { attempt_count: attempts.length, export_kind: "account" } });
  if (!audit.ok) return Response.json({ error: "Không thể ghi nhật ký xuất dữ liệu." }, { status: 503, headers });
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  await finishExamAdminAudit(admin, audit.audit.id, "succeeded");
  return new Response(bytes, { status: 200, headers: { ...headers, "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${safeName(exam.title)}-account.xlsx"` } });
}
