import * as XLSX from "xlsx";
import { answersMatch, hasAnswerValue } from "../../../../../lib/exam-answers";
import { ensureAdminPermission } from "../../../../../lib/admin-authorization-server";
import {
  applyGuestOrdering,
  GUEST_ATTEMPT_SELECT,
  GUEST_SLOT_SELECT,
  guestServerClient,
  loadGuestQuestions,
  normalizeGuestSettings,
  publicGuestQuestion,
} from "../../../../../lib/guest-exam-server";
import {
  buildGuestIdentityColumns,
  guestIdentityValue,
  identityDisplayName,
  type GuestIdentityFieldLike,
} from "../../../../../lib/guest-identity";
import { normalizeExamType, normalizeHsaStructureConfig } from "../../../../../lib/exam-config";
import { finishExamAdminAudit, startExamAdminAudit } from "../../../../../lib/admin-audit-server";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

type AttemptLike = {
  id: string;
  guest_identity?: unknown;
  answers?: unknown;
  question_order?: unknown;
  option_order?: unknown;
  config_snapshot?: unknown;
  monitor_events?: unknown;
  score?: number | null;
  correct_answers?: number | null;
  total_questions?: number | null;
  status?: string | null;
  started_at?: string | null;
  submitted_at?: string | null;
  duration_seconds?: number | null;
  exam_code?: string | null;
  policy_version?: number | null;
  scoring_version?: number | null;
  time_extension_seconds?: number | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map(item => asText(item)).filter(Boolean).join(", ");
  if (value == null) return "";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

function asJson(value: unknown): string {
  if (value == null) return "";
  try { return JSON.stringify(value); } catch { return asText(value); }
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("vi-VN") : "";
}

function safeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 80) || "exam";
}

function snapshotFields(attempt: AttemptLike): GuestIdentityFieldLike[] {
  const snapshot = asRecord(attempt.config_snapshot);
  return Array.isArray(snapshot.identityFields)
    ? snapshot.identityFields.filter(value => value && typeof value === "object" && !Array.isArray(value)) as GuestIdentityFieldLike[]
    : [];
}

function answerMap(attempt: AttemptLike) {
  return asRecord(attempt.answers);
}

function monitorEvents(attempt: AttemptLike) {
  return (Array.isArray(attempt.monitor_events) ? attempt.monitor_events : []).map(asRecord);
}

function monitorEventCount(attempt: AttemptLike, type: string) {
  return monitorEvents(attempt).filter(event => event.type === type).length;
}

function orderedQuestionResult(selected: unknown, correct: unknown, questionType: string) {
  if (!hasAnswerValue(correct)) return "Chưa có đáp án";
  if (!hasAnswerValue(selected)) return "Chưa trả lời";
  return answersMatch(selected, correct, ["inline", "true_false", "ordering", "drag_drop"].includes(questionType)) ? "Đúng" : "Sai";
}

function optionValue(option: unknown) {
  if (typeof option === "string" || typeof option === "number") return String(option);
  const record = asRecord(option);
  return String(record.value ?? record.id ?? "");
}

function optionLabel(option: unknown) {
  const record = asRecord(option);
  return String(record.label ?? record.text ?? record.value ?? "");
}

function answerWithLabels(value: unknown, question: ReturnType<typeof publicGuestQuestion>) {
  if (!hasAnswerValue(value)) return "";
  const values = Array.isArray(value) ? value : [value];
  const options = Array.isArray(question.options) ? question.options : [];
  return values.map(item => {
    const raw = asText(item);
    const match = options.find(option => optionValue(option) === raw);
    const label = match ? optionLabel(match) : "";
    return label && label !== raw ? `${raw}: ${label}` : raw;
  }).join(", ");
}

function optionsSummary(question: ReturnType<typeof publicGuestQuestion>) {
  const options = Array.isArray(question.options) ? question.options : [];
  return options.map(option => {
    const value = optionValue(option);
    const label = optionLabel(option);
    return value && label && value !== label ? `${value}: ${label}` : label || value;
  }).filter(Boolean).join(" | ");
}

const STATIC_IDENTITY_HEADERS = new Set([
  "Mã lượt", "Thí sinh", "Điểm", "Số câu đúng", "Trạng thái",
  "Bắt đầu", "Nộp bài", "Thời gian làm (giây)", "Thông tin input (JSON)",
  "Số câu đã chọn", "Câu hỏi đã chọn (JSON)", "Số lần thoát toàn màn hình",
  "Mã đề", "Phiên bản chính sách", "Phiên bản chấm", "Gia hạn (giây)",
]);

function identityHeaders(columns: ReturnType<typeof buildGuestIdentityColumns>) {
  const used = new Set(STATIC_IDENTITY_HEADERS);
  const output = new Map<string, string>();
  for (const column of columns) {
    const base = column.label || column.key || "Thông tin";
    let label = base;
    if (used.has(label)) label = `Input · ${label}`;
    let suffix = 2;
    while (used.has(label)) label = `${base} (${suffix++})`;
    used.add(label);
    output.set(column.key, label);
  }
  return output;
}

function addIdentityCells(
  row: Record<string, unknown>,
  attempt: AttemptLike,
  columns: ReturnType<typeof buildGuestIdentityColumns>,
  labels: Map<string, string>,
) {
  for (const column of columns) row[labels.get(column.key) ?? column.label] = guestIdentityValue(attempt.guest_identity, column.key);
}

function attemptName(attempt: AttemptLike, fields: readonly GuestIdentityFieldLike[]) {
  return identityDisplayName(attempt.guest_identity, fields);
}

function sheetFromRows(rows: Array<Record<string, unknown>>, emptyMessage: string) {
  return XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Thông báo": emptyMessage }]);
}

function improveColumnWidths(sheet: XLSX.WorkSheet) {
  const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  if (!range) return;
  const widths: Array<{ wch: number }> = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    let width = 12;
    for (let row = range.s.r; row <= Math.min(range.e.r, range.s.r + 40); row += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      width = Math.max(width, Math.min(52, String(cell?.v ?? "").length + 2));
    }
    widths[column] = { wch: width };
  }
  sheet["!cols"] = widths;
}

export async function GET(request: Request) {
  const security = await ensureAdminPermission(request, "exams");
  if (!security.ok) return security.response;
  const admin = guestServerClient();
  if (!admin) return Response.json({ error: "Chưa cấu hình máy chủ khảo thí." }, { status: 503, headers });
  const params = new URL(request.url).searchParams;
  const examId = params.get("examId")?.trim() ?? "";
  const slotId = params.get("slotId")?.trim() ?? "";
  if (!examId || !slotId) return Response.json({ error: "Thiếu đề thi hoặc kíp thi." }, { status: 400, headers });

  const [{ data: exam, error: examError }, { data: slot, error: slotError }, { data: rawAttempts, error: attemptsError }] = await Promise.all([
    admin.from("exams").select("id,room_id,title,exam_type,duration_minutes,settings,structure_config").eq("id", examId).maybeSingle(),
    admin.from("exam_access_slots").select(GUEST_SLOT_SELECT).eq("id", slotId).eq("exam_id", examId).maybeSingle(),
    admin.from("guest_exam_attempts").select(GUEST_ATTEMPT_SELECT).eq("slot_id", slotId).order("started_at"),
  ]);
  if (examError || slotError || attemptsError) return Response.json({ error: "Không thể tải dữ liệu xuất của kíp thi." }, { status: 503, headers });
  if (!exam || !slot) return Response.json({ error: "Không tìm thấy đề hoặc kíp thi." }, { status: 404, headers });

  const settings = normalizeGuestSettings(exam.settings);
  if (settings.exportWindowEnabled) {
    const now = Date.now();
    const exportOpen = slot.export_open_at ? new Date(slot.export_open_at).getTime() : new Date(slot.ends_at).getTime();
    const exportClose = slot.export_close_at ? new Date(slot.export_close_at).getTime() : new Date(slot.ends_at).getTime() + Number(slot.grace_period_minutes ?? 30) * 60_000;
    if (now < exportOpen || now > exportClose) return Response.json({ error: "Ngoài thời gian được phép xuất dữ liệu của kíp thi." }, { status: 403, headers });
  }

  const audit = await startExamAdminAudit(admin, {
    adminId: security.user.id,
    examId,
    roomId: String(exam.room_id ?? "") || null,
    slotId,
    action: "export_exam_results",
    metadata: {
      attempt_count: Array.isArray(rawAttempts) ? rawAttempts.length : 0,
      export_window_enabled: settings.exportWindowEnabled,
    },
  });
  if (!audit.ok) return Response.json({ error: "Không thể ghi nhật ký xuất dữ liệu. Vui lòng thử lại sau." }, { status: 503, headers });

  try {
  const attempts = (rawAttempts ?? []) as AttemptLike[];
  const loaded = await loadGuestQuestions(admin, examId, undefined, slot.section_id);
  const keyIds = loaded.questions.map(question => question.id);
  const { data: keys } = keyIds.length
    ? await admin.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", keyIds)
    : { data: [] };
  const keyMap = new Map((keys ?? []).map(key => [key.question_id, key]));
  const allIdentityFields: GuestIdentityFieldLike[] = [
    ...settings.identityFields,
    ...attempts.flatMap(snapshotFields),
  ];
  const identityColumns = buildGuestIdentityColumns(
    settings.identityFields,
    attempts.map(snapshot => snapshot.config_snapshot),
    attempts.map(attempt => attempt.guest_identity),
  );
  const inputHeaders = identityHeaders(identityColumns);
  const sectionMap = new Map(loaded.sections.map(section => [section.id, section]));
  const orderedQuestionsByAttempt = new Map(
    attempts.map(attempt => [attempt.id, applyGuestOrdering(loaded.questions, attempt.question_order, attempt.option_order)]),
  );
  const questionsForAttempt = (attempt: AttemptLike) => orderedQuestionsByAttempt.get(attempt.id) ?? [];
  const selectedQuestionPayload = (attempt: AttemptLike) => {
    const answers = answerMap(attempt);
    return questionsForAttempt(attempt).map((question, index) => {
      const selected = answers[question.id];
      const parsedQuestion = publicGuestQuestion(question);
      return {
        question_number: index + 1,
        section: sectionMap.get(question.section_id)?.title ?? "",
        question_id: question.id,
        question_type: question.question_type,
        prompt: parsedQuestion.prompt,
        answered: hasAnswerValue(selected),
        answer: selected ?? null,
        answer_display: answerWithLabels(selected, parsedQuestion),
      };
    });
  };

  const inputRows = attempts.map(attempt => {
    const selectedQuestions = questionsForAttempt(attempt);
    const row: Record<string, unknown> = {
      "Mã lượt": attempt.id,
      "Thí sinh": attemptName(attempt, allIdentityFields),
    };
    addIdentityCells(row, attempt, identityColumns, inputHeaders);
    Object.assign(row, {
      "Thông tin input (JSON)": asJson(attempt.guest_identity),
      "Mã đề": attempt.exam_code ?? "",
      "Phiên bản chính sách": attempt.policy_version ?? 1,
      "Phiên bản chấm": attempt.scoring_version ?? 1,
      "Gia hạn (giây)": attempt.time_extension_seconds ?? 0,
      "Số câu đã chọn": selectedQuestions.length,
      "Câu hỏi đã chọn (JSON)": asJson(selectedQuestionPayload(attempt)),
      "Số lần thoát toàn màn hình": monitorEventCount(attempt, "fullscreen_exit"),
      "Trạng thái": attempt.status ?? "",
      "Bắt đầu": dateLabel(attempt.started_at),
      "Nộp bài": dateLabel(attempt.submitted_at),
      "Thời gian làm (giây)": attempt.duration_seconds ?? "",
    });
    return row;
  });

  const summaryRows = attempts.map(attempt => {
    const selectedQuestions = questionsForAttempt(attempt);
    const row: Record<string, unknown> = {
      "Mã lượt": attempt.id,
      "Thí sinh": attemptName(attempt, allIdentityFields),
    };
    addIdentityCells(row, attempt, identityColumns, inputHeaders);
    Object.assign(row, {
      "Thông tin input (JSON)": asJson(attempt.guest_identity),
      "Mã đề": attempt.exam_code ?? "",
      "Phiên bản chính sách": attempt.policy_version ?? 1,
      "Phiên bản chấm": attempt.scoring_version ?? 1,
      "Gia hạn (giây)": attempt.time_extension_seconds ?? 0,
      "Số câu đã chọn": selectedQuestions.length,
      "Câu hỏi đã chọn (JSON)": asJson(selectedQuestionPayload(attempt)),
      "Số lần thoát toàn màn hình": monitorEventCount(attempt, "fullscreen_exit"),
      "Điểm": attempt.score ?? "",
      "Số câu đúng": `${attempt.correct_answers ?? 0}/${attempt.total_questions ?? 0}`,
      "Trạng thái": attempt.status ?? "",
      "Bắt đầu": dateLabel(attempt.started_at),
      "Nộp bài": dateLabel(attempt.submitted_at),
      "Thời gian làm (giây)": attempt.duration_seconds ?? "",
      "Số cảnh báo giám sát": Array.isArray(attempt.monitor_events) ? attempt.monitor_events.length : 0,
    });
    return row;
  });

  const selectedQuestionRows: Array<Record<string, unknown>> = [];
  const answerRows: Array<Record<string, unknown>> = [];
  const horizontalRows: Array<Record<string, unknown>> = [];
  for (const attempt of attempts) {
    const answers = answerMap(attempt);
    const orderedQuestions = questionsForAttempt(attempt);
    const horizontal: Record<string, unknown> = {
      "Mã lượt": attempt.id,
      "Thí sinh": attemptName(attempt, allIdentityFields),
    };
    addIdentityCells(horizontal, attempt, identityColumns, inputHeaders);
    horizontal["Thông tin input (JSON)"] = asJson(attempt.guest_identity);

    orderedQuestions.forEach((question, index) => {
      const key = keyMap.get(question.id);
      const selected = answers[question.id];
      const parsedQuestion = publicGuestQuestion(question);
      const correct = key?.correct_answer;
      const result = orderedQuestionResult(selected, correct, question.question_type);
      const questionNumber = index + 1;
      const section = sectionMap.get(question.section_id);
      const answerDisplay = answerWithLabels(selected, parsedQuestion);
      const correctDisplay = answerWithLabels(correct, parsedQuestion);
      selectedQuestionRows.push({
        "Mã lượt": attempt.id,
        "Thí sinh": attemptName(attempt, allIdentityFields),
        ...Object.fromEntries(identityColumns.map(column => [inputHeaders.get(column.key) ?? column.label, guestIdentityValue(attempt.guest_identity, column.key)])),
        "Câu": questionNumber,
        "Phần": section?.title ?? "",
        "Mã câu hỏi": question.id,
        "Loại câu": question.question_type,
        "Nội dung câu hỏi": parsedQuestion.prompt,
        "Đã trả lời": hasAnswerValue(selected) ? "Có" : "Chưa",
        "Câu trả lời": answerDisplay,
        "Câu trả lời (JSON)": asJson(selected),
      });
      answerRows.push({
        "Mã lượt": attempt.id,
        "Thí sinh": attemptName(attempt, allIdentityFields),
        ...Object.fromEntries(identityColumns.map(column => [inputHeaders.get(column.key) ?? column.label, guestIdentityValue(attempt.guest_identity, column.key)])),
        "Câu": questionNumber,
        "Phần": section?.title ?? "",
        "Mã câu hỏi": question.id,
        "Loại câu": question.question_type,
        "Nội dung câu hỏi": parsedQuestion.prompt,
        "Phương án": optionsSummary(parsedQuestion),
        "Học sinh trả lời": answerDisplay,
        "Học sinh trả lời (JSON)": asJson(selected),
        "Đáp án chuẩn": correctDisplay,
        "Đáp án chuẩn (JSON)": asJson(correct),
        "Kết quả": result,
        "Điểm câu": result === "Đúng" ? question.points : 0,
        "Lời giải": key?.explanation ?? "",
      });
      horizontal[`Câu ${questionNumber} · Mã câu hỏi`] = question.id;
      horizontal[`Câu ${questionNumber} · HS trả lời`] = answerDisplay;
      horizontal[`Câu ${questionNumber} · HS trả lời (JSON)`] = asJson(selected);
      horizontal[`Câu ${questionNumber} · Đáp án chuẩn`] = correctDisplay;
      horizontal[`Câu ${questionNumber} · Kết quả`] = result;
    });
    horizontalRows.push(horizontal);
  }

  const monitorRows: Array<Record<string, unknown>> = [];
  for (const attempt of attempts) {
    const events = monitorEvents(attempt);
    const base = {
      "Mã lượt": attempt.id,
      "Thí sinh": attemptName(attempt, allIdentityFields),
      ...Object.fromEntries(identityColumns.map(column => [inputHeaders.get(column.key) ?? column.label, guestIdentityValue(attempt.guest_identity, column.key)])),
      "Số sự kiện": events.length,
      "Số lần thoát toàn màn hình": events.filter(event => event.type === "fullscreen_exit").length,
    };
    if (!events.length) {
      monitorRows.push({ ...base, "Sự kiện": "", "Thời gian": "", "Chi tiết (JSON)": "" });
      continue;
    }
    for (const rawEvent of events) {
      const event = asRecord(rawEvent);
      monitorRows.push({
        ...base,
        "Sự kiện": asText(event.type),
        "Thời gian": dateLabel(typeof event.at === "string" ? event.at : null),
        "Chi tiết (JSON)": asJson(event),
      });
    }
  }

  const structure = normalizeExamType(exam.exam_type) === "HSA" ? normalizeHsaStructureConfig(exam.structure_config) : null;
  const configRows = [{
    "Đề thi": exam.title,
    "Loại kỳ thi": exam.exam_type,
    "Môn/phần": loaded.sections[0]?.title ?? "Toàn bộ đề",
    "Thời lượng (phút)": loaded.sections[0]?.duration_minutes ?? exam.duration_minutes,
    "Cấu trúc": structure?.label ?? "Theo cấu hình đề",
    "Kíp thi": slot.name,
    "Mở kíp": slot.starts_at,
    "Kết thúc kíp": slot.ends_at,
    "Gia hạn (phút)": slot.grace_period_minutes,
    "Giới hạn thời gian xuất": settings.exportWindowEnabled ? "Có" : "Không",
    "Mở xuất": slot.export_open_at ?? "Theo thời điểm kết thúc kíp",
    "Đóng xuất": slot.export_close_at ?? "Theo thời gian gia hạn",
    "Kết quả đã mở": slot.results_released_at ? "Có" : "Chưa",
    "Trường input": identityColumns.map(column => `${column.label} [${column.key}]`).join(" | "),
    "Xuất lúc": new Date().toLocaleString("vi-VN"),
  }];

  const workbook = XLSX.utils.book_new();
  const sheets: Array<[XLSX.WorkSheet, string]> = [
    [sheetFromRows(summaryRows, "Chưa có bài làm trong kíp thi."), "Tổng hợp"],
    [sheetFromRows(inputRows, "Chưa có dữ liệu input thí sinh."), "Input thí sinh"],
    [sheetFromRows(selectedQuestionRows, "Chưa có câu hỏi được chọn."), "Câu đã chọn"],
    [sheetFromRows(answerRows, "Chưa có dữ liệu đáp án."), "Đáp án từng câu"],
    [sheetFromRows(horizontalRows, "Chưa có dữ liệu đáp án."), "Đối chiếu ngang"],
    [sheetFromRows(monitorRows, "Chưa ghi nhận sự kiện giám sát."), "Giám sát"],
    [sheetFromRows(configRows, "Chưa có cấu hình kíp."), "Cấu hình kíp"],
  ];
  for (const [sheet, name] of sheets) {
    improveColumnWidths(sheet);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }

  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  await finishExamAdminAudit(admin, audit.audit.id, "succeeded", {
    attempt_count: attempts.length,
    answer_row_count: answerRows.length,
    sheet_count: sheets.length,
    export_window_enabled: settings.exportWindowEnabled,
  });
  const filename = `${safeFilePart(exam.title)}-${safeFilePart(slot.name)}.xlsx`;
  return new Response(bytes, {
    status: 200,
    headers: {
      ...headers,
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
  } catch {
    await finishExamAdminAudit(admin, audit.audit.id, "failed", {
      attempt_count: Array.isArray(rawAttempts) ? rawAttempts.length : 0,
      export_window_enabled: settings.exportWindowEnabled,
    });
    return Response.json({ error: "Không thể tạo tệp xuất dữ liệu của kíp thi." }, { status: 503, headers });
  }
}
