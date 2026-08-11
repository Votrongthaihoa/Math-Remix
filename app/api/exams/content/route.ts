import { encryptExamPayload, validateExamPublicKey, type ExamEnvelopeBinding } from "../../../../lib/exam-content-crypto";
import {
  EXAM_QUESTION_SELECT,
  activeAttemptSectionId,
  authenticateExamRequest,
  applyQuestionSnapshotOrder,
  examPrivateHeaders,
  examServerClient,
  loadExamAttemptContext,
  orderedRows,
  questionIdsFromSnapshot,
} from "../../../../lib/exam-content-server";
import { latexPartInstruction, parseLatexQuestion, type LatexPartNumber } from "../../../../lib/exam-latex";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{20,80}$/;
const CONTENT_BATCH_SIZE = 5;

type ContentRequest = {
  attemptId?: string;
  sectionId?: string;
  index?: number;
  clientPublicKey?: JsonWebKey;
  nonce?: string;
};

function error(message: string, status: number, headers: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { ...examPrivateHeaders, ...headers } });
}

export async function POST(request: Request) {
  const admin = examServerClient();
  if (!admin) return error("Chưa cấu hình máy chủ khảo thí.", 503);
  const authentication = await authenticateExamRequest(request, admin);
  if (!authentication.ok) return authentication.response;
  const user = authentication.user;

  const parsedBody = await readJsonBody<ContentRequest>(request);
  if (!parsedBody.ok) return error(jsonBodyError(parsedBody.error).error, parsedBody.error === "payload_too_large" ? 413 : 400);
  const body = parsedBody.body;
  if (!body.attemptId || !UUID_PATTERN.test(body.attemptId)
    || !body.sectionId || !UUID_PATTERN.test(body.sectionId)
    || !Number.isInteger(body.index) || Number(body.index) < 0
    || !body.nonce || !NONCE_PATTERN.test(body.nonce)) {
    return error("Yêu cầu nội dung đề thi không hợp lệ.", 400);
  }
  try {
    validateExamPublicKey(body.clientPublicKey);
  } catch (value) {
    return error(value instanceof Error ? value.message : "Khóa phiên bài thi không hợp lệ.", 400);
  }

  const context = await loadExamAttemptContext(admin, user, body.attemptId, { requireOwner: true, requireInProgress: true });
  if (!context) return error("Lượt thi không tồn tại, đã kết thúc hoặc không thuộc tài khoản này.", 404);
  const activeSectionId = activeAttemptSectionId(context);
  if (!activeSectionId || activeSectionId !== body.sectionId || !context.sections.some(section => section.id === body.sectionId)) {
    return error("Phần thi hiện tại không hợp lệ.", 409);
  }

  const snapshotQuestionIds = questionIdsFromSnapshot(context.attempt.question_order);
  const metadataQuery = admin
    .from("exam_questions")
    .select("id,section_id,passage,sort_order,latex_source")
    .eq("section_id", body.sectionId);
  const { data: metadataRows, error: metadataError } = await (snapshotQuestionIds.length
    ? metadataQuery.in("id", snapshotQuestionIds)
    : metadataQuery).order("sort_order");
  if (metadataError) return error("Không thể tải cấu trúc phần thi.", 503);
  const metadata = applyQuestionSnapshotOrder(
    (metadataRows ?? []) as Array<{ id: string; section_id: string; passage?: string | null; sort_order?: number | null; latex_source?: string | null }>,
    context.attempt.question_order,
    context.attempt.option_order,
  );
  if (Number(body.index) >= metadata.length) return error("Câu hỏi không hợp lệ.", 404);

  const requestedIndex = Number(body.index);
  const structuralParts = metadata.map(question => {
    try { return question.latex_source?.trim() ? parseLatexQuestion(question.latex_source).part : undefined; }
    catch { return undefined; }
  });
  const partStarts = structuralParts.flatMap((part, index) => part ? [{ part, index }] : []);
  const displayMeta = (index: number) => {
    const start = partStarts.filter(item => item.index <= index).at(-1);
    if (!start) return { displayNumber: index + 1, partInstruction: undefined };
    const nextStart = partStarts.find(item => item.index > start.index)?.index ?? metadata.length;
    return {
      displayNumber: index - start.index + 1,
      partInstruction: index === start.index ? latexPartInstruction(start.part as LatexPartNumber, nextStart - start.index) : undefined,
    };
  };
  const requestedPassage = String(metadata[requestedIndex]?.passage ?? "").trim();
  let requestedGroupStart = requestedIndex;
  let requestedGroupEnd = requestedIndex;
  if (requestedPassage) {
    while (requestedGroupStart > 0 && String(metadata[requestedGroupStart - 1]?.passage ?? "").trim() === requestedPassage) requestedGroupStart -= 1;
    while (requestedGroupEnd + 1 < metadata.length && String(metadata[requestedGroupEnd + 1]?.passage ?? "").trim() === requestedPassage) requestedGroupEnd += 1;
  }
  // One encrypted response contains a small adjacent window so moving
  // between questions does not incur a network + crypto round trip every time.
  // Passage groups remain atomic even when they are larger than the window.
  let groupStart = Math.min(requestedGroupStart, Math.floor(requestedIndex / CONTENT_BATCH_SIZE) * CONTENT_BATCH_SIZE);
  let groupEnd = Math.max(requestedGroupEnd, Math.min(metadata.length - 1, groupStart + CONTENT_BATCH_SIZE - 1));
  const passageAtStart = String(metadata[groupStart]?.passage ?? "").trim();
  if (passageAtStart) {
    while (groupStart > 0 && String(metadata[groupStart - 1]?.passage ?? "").trim() === passageAtStart) groupStart -= 1;
  }
  const passageAtEnd = String(metadata[groupEnd]?.passage ?? "").trim();
  if (passageAtEnd) {
    while (groupEnd + 1 < metadata.length && String(metadata[groupEnd + 1]?.passage ?? "").trim() === passageAtEnd) groupEnd += 1;
  }
  const groupMetadata = metadata.slice(groupStart, groupEnd + 1);
  const questionIds = groupMetadata.map(question => question.id);
  const contentRef = `${groupStart}-${groupEnd}`;

  const { data: budgetRows, error: budgetError } = await admin.rpc("consume_exam_content_budget", {
    target_attempt_id: context.attempt.id,
    target_student_id: user.id,
    target_section_id: body.sectionId,
    target_content_ref: contentRef,
  });
  // A local checkout may be running against a database before migration 016
  // has been applied. Keep local development usable while still failing closed
  // in production, where the database rate limiter is part of the protection
  // boundary.
  const budgetErrorText = budgetError ? `${budgetError.code ?? ""} ${budgetError.message ?? ""} ${budgetError.details ?? ""}` : "";
  const missingBudgetFunction = /PGRST202|consume_exam_content_budget|schema cache|function.+does not exist/i.test(budgetErrorText);
  if (budgetError && !(process.env.NODE_ENV !== "production" && missingBudgetFunction)) return error("Lớp bảo vệ nội dung đề thi chưa sẵn sàng.", 503);
  const budget = budgetRows?.[0] as { allowed?: boolean; retry_after_seconds?: number } | undefined;
  if (!budgetError && !budget?.allowed) {
    const retryAfter = Math.max(1, Math.min(30, Number(budget?.retry_after_seconds) || 3));
    return error("Bạn đang mở quá nhiều câu mới trong thời gian ngắn. Hãy chờ một chút rồi thử lại.", 429, { "retry-after": String(retryAfter) });
  }

  const { data: questionRows, error: questionError } = await admin.from("exam_questions").select(EXAM_QUESTION_SELECT).in("id", questionIds);
  if (questionError || !questionRows?.length) return error("Không thể tải nội dung câu hỏi.", 503);
  const orderedQuestionRows = applyQuestionSnapshotOrder(questionRows ?? [], context.attempt.question_order, context.attempt.option_order);
  const questions = orderedRows(orderedQuestionRows, questionIds).map((question, offset) => {
    let optionColumns = 1;
    let part: 1 | 2 | 3 | undefined;
    let matching: { leftItems: Array<{ value: string; label: string }>; rightItems: Array<{ value: string; label: string }> } | undefined;
    try {
      const parsed = question.latex_source?.trim() ? parseLatexQuestion(question.latex_source) : null;
      optionColumns = parsed?.optionColumns ?? 1;
      part = parsed?.part;
      if (parsed?.matching) matching = {
        leftItems: parsed.matching.leftItems.map(item => ({ value: item.value, label: item.label })),
        rightItems: parsed.matching.rightItems.map(item => ({ value: item.value, label: item.label })),
      };
    } catch {
      optionColumns = 1;
    }
    const safeQuestion = { ...question };
    delete safeQuestion.latex_source;
    const index = groupStart + offset;
    const presentation = displayMeta(index);
    const optionOrder = context.attempt.option_order && typeof context.attempt.option_order === "object" && !Array.isArray(context.attempt.option_order)
      ? (context.attempt.option_order as Record<string, unknown>)[question.id]
      : undefined;
    return { ...safeQuestion, option_order: Array.isArray(optionOrder) ? optionOrder : undefined, option_columns: optionColumns, part, matching, index, _displayNumber: presentation.displayNumber, _partInstruction: presentation.partInstruction };
  });
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const binding: ExamEnvelopeBinding = {
    version: 1,
    kind: "question",
    attemptId: context.attempt.id,
    sectionId: body.sectionId,
    index: requestedIndex,
    nonce: body.nonce,
    expiresAt,
  };

  try {
    const envelope = await encryptExamPayload({
      kind: "question-group" as const,
      attemptId: context.attempt.id,
      sectionId: body.sectionId,
      requestedIndex,
      questionCount: metadata.length,
      questions,
      serverTime: new Date().toISOString(),
    }, body.clientPublicKey, binding);
    return Response.json(envelope, { headers: examPrivateHeaders });
  } catch {
    return error("Không thể mã hóa nội dung đề thi.", 500);
  }
}
