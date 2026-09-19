import type { SupabaseClient } from "@supabase/supabase-js";
import { adminPermissionUserFromAppMetadata, ensureAdminPermission } from "../../../../lib/admin-authorization-server";
import { canAccessAdminPermission } from "../../../../lib/admin-permissions";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { findPotentialDuplicates, type DedupQuestion } from "../../../../lib/question-dedup";
import { buildLatexQuestionPreview } from "../../../../lib/question-bank-latex";
import {
  normalizeDifficulty,
  normalizeQuestionBankContent,
  normalizeTags,
  selectCurrentVersions,
  validateQuestionBankContent,
  type QuestionBankContentFieldErrors,
  type QuestionBankDifficulty,
  type QuestionBankNodeType,
} from "../../../../lib/question-bank";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

async function adminRequest(request: Request) {
  return ensureAdminPermission(request, "question-bank");
}

function canManageExamContent(appMetadata: unknown, role: string | null | undefined) {
  return canAccessAdminPermission(adminPermissionUserFromAppMetadata(appMetadata, role), "exams");
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers });
}

function invalidQuestionContentResponse(fieldErrors: QuestionBankContentFieldErrors, invalidItems?: Array<{ itemId: string; fieldErrors: QuestionBankContentFieldErrors }>) {
  return Response.json({
    error: "Câu hỏi chưa đủ dữ liệu để lưu hoặc đưa vào đề.",
    code: "invalid_question_content",
    fieldErrors,
    ...(invalidItems?.length ? { invalidItems } : {}),
  }, { status: 422, headers });
}

function targetExamFieldErrors(content: ReturnType<typeof normalizeQuestionBankContent>, isThptqg: boolean): QuestionBankContentFieldErrors {
  if (!isThptqg) return {};
  if (content.question_type === "drag_drop") {
    return { questionType: "Dạng kéo và thả chưa tương thích với đề THPTQG." };
  }
  if (content.question_type === "true_false" && content.options.length !== 4) {
    return { options: "Đề THPTQG cần đúng 4 phát biểu Đúng / Sai cho mỗi câu." };
  }
  if (content.question_type === "text") {
    const answer = typeof content.correct_answer === "string" ? content.correct_answer.trim() : "";
    if (!/^(?=.*\d)[0-9,-]{1,4}$/.test(answer)) {
      return { correctAnswer: "Đáp án THPTQG chỉ dùng chữ số, dấu phẩy hoặc dấu trừ và tối đa 4 ký tự." };
    }
  }
  return {};
}

function stringValue(value: unknown, fallback = "", max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

function idList(value: unknown, max = 200) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter(item => typeof item === "string").map(item => item.trim()).filter(Boolean))).slice(0, max)
    : [];
}

async function bankExists(admin: SupabaseClient, bankId: string) {
  const result = await admin.from("question_banks").select("id").eq("id", bankId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return Boolean(result.data);
}

export async function GET(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const params = new URL(request.url).searchParams;
  const bankId = stringValue(params.get("bankId"), "", 80);
  const q = stringValue(params.get("q"), "", 300).toLocaleLowerCase("vi");
  const difficulty = normalizeDifficulty(params.get("difficulty"));
  const nodeId = stringValue(params.get("nodeId"), "", 80);
  const admin = security.admin;
  const canManageExams = canManageExamContent(security.user.app_metadata, security.profile.role);

  const [banksResult, sourceExamsResult, sourceSectionsResult] = await Promise.all([
    admin.from("question_banks").select("id,name,subject_code,grade,curriculum,description,status,created_at,updated_at").order("updated_at", { ascending: false }).limit(100),
    canManageExams
      ? admin.from("exams").select("id,title,exam_type,published").order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    canManageExams
      ? admin.from("exam_sections").select("id,exam_id,title,sort_order").order("sort_order").limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const catalogError = banksResult.error || sourceExamsResult.error || sourceSectionsResult.error;
  if (catalogError) return errorResponse(catalogError.message, 503);

  if (!bankId) {
    return Response.json({
      banks: banksResult.data ?? [],
      nodes: [],
      items: [],
      sourceExams: sourceExamsResult.data ?? [],
      sourceSections: sourceSectionsResult.data ?? [],
      canManageExams,
    }, { headers });
  }

  const bankResult = await admin.from("question_banks").select("id,name,subject_code,grade,curriculum,description,status,created_at,updated_at").eq("id", bankId).maybeSingle();
  const nodesResult = await admin.from("question_bank_nodes").select("id,bank_id,parent_id,title,node_type,sort_order").eq("bank_id", bankId).order("sort_order");
  const itemsResult = await admin.from("question_bank_items").select("id,bank_id,node_id,current_version,difficulty,tags,status,created_at,updated_at").eq("bank_id", bankId).order("updated_at", { ascending: false }).limit(500);
  if (bankResult.error || nodesResult.error || itemsResult.error) return errorResponse(bankResult.error?.message || nodesResult.error?.message || itemsResult.error?.message || "Không thể tải ngân hàng câu hỏi.", 503);
  if (!bankResult.data) return errorResponse("Không tìm thấy ngân hàng câu hỏi.", 404);

  const itemIds = (itemsResult.data ?? []).map(item => item.id);
  const versionsResult = itemIds.length
    ? await admin.from("question_bank_item_versions").select("id,item_id,version,prompt,question_type,options,correct_answer,explanation,passage,media_url,instruction,solution_source,created_at").in("item_id", itemIds).order("version", { ascending: false })
    : { data: [], error: null };
  if (versionsResult.error) return errorResponse(versionsResult.error.message, 503);
  const currentVersions = selectCurrentVersions(itemsResult.data ?? [], versionsResult.data ?? []);
  const versionByItem = new Map(currentVersions.map(version => [version.item_id, version]));
  const normalizedItems = (itemsResult.data ?? []).map(item => ({ ...item, ...(versionByItem.get(item.id) ?? {}) }));
  const filteredItems = normalizedItems.filter(item => {
    if (difficulty && item.difficulty !== difficulty) return false;
    if (nodeId && item.node_id !== nodeId) return false;
    if (!q) return true;
    const text = `${item.prompt ?? ""} ${(item.tags ?? []).join(" ")}`.toLocaleLowerCase("vi");
    return text.includes(q);
  });

  return Response.json({
    bank: bankResult.data,
    banks: banksResult.data ?? [],
    nodes: nodesResult.data ?? [],
    items: filteredItems,
    sourceExams: sourceExamsResult.data ?? [],
    sourceSections: sourceSectionsResult.data ?? [],
    canManageExams,
  }, { headers });
}

type Body = {
  action?: "create_bank" | "create_node" | "create_item" | "update_item" | "seed_from_section" | "attach_to_exam" | "import_latex";
  bankId?: string;
  itemId?: string;
  examId?: string;
  sectionId?: string;
  parentId?: string | null;
  title?: string;
  name?: string;
  subjectCode?: string;
  grade?: string;
  curriculum?: string;
  description?: string;
  nodeType?: QuestionBankNodeType;
  difficulty?: QuestionBankDifficulty | null;
  tags?: string[] | string;
  content?: unknown;
  itemIds?: string[];
  latexSource?: string;
  importIndexes?: number[];
  allowPotentialDuplicates?: boolean;
  points?: number;
};

type NormalizedQuestionContent = ReturnType<typeof normalizeQuestionBankContent>;

async function findPotentialDuplicatesForItem(
  admin: SupabaseClient,
  bankId: string,
  content: Pick<NormalizedQuestionContent, "prompt" | "question_type">,
  excludeItemId = "",
) {
  const itemsResult = await admin
    .from("question_bank_items")
    .select("id,current_version")
    .eq("bank_id", bankId)
    .in("status", ["draft", "active"])
    .order("updated_at", { ascending: false })
    .limit(1_000);
  if (itemsResult.error) throw new Error(itemsResult.error.message);

  const rows = (itemsResult.data ?? []).filter(item => item.id !== excludeItemId);
  const itemIds = rows.map(item => item.id);
  const versionsResult = itemIds.length
    ? await admin.from("question_bank_item_versions").select("item_id,version,prompt,question_type").in("item_id", itemIds)
    : { data: [], error: null };
  if (versionsResult.error) throw new Error(versionsResult.error.message);

  const currentVersions = new Map((versionsResult.data ?? []).map(version => [`${version.item_id}:${version.version}`, version]));
  const candidates: DedupQuestion[] = rows.flatMap(item => {
    const version = currentVersions.get(`${item.id}:${item.current_version}`);
    return version?.prompt
      ? [{ id: item.id, prompt: version.prompt, questionType: version.question_type }]
      : [];
  });

  return findPotentialDuplicates(
    { prompt: content.prompt, questionType: content.question_type },
    candidates,
    { excludeItemId, limit: 5 },
  ).map(match => ({ ...match, prompt: match.prompt.slice(0, 500) }));
}

export async function POST(request: Request) {
  const security = await adminRequest(request);
  if (!security.ok) return security.response;
  const parsedBody = await readJsonBody<Body>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400, headers });
  const body = parsedBody.body;
  const action = body.action;
  const admin = security.admin;
  if (!action) return errorResponse("Thiếu thao tác.");

  if (action === "create_bank") {
    const name = stringValue(body.name, "", 160);
    if (!name) return errorResponse("Tên ngân hàng không được để trống.");
    const result = await admin.from("question_banks").insert({
      name,
      subject_code: stringValue(body.subjectCode, "", 40),
      grade: stringValue(body.grade, "", 40),
      curriculum: stringValue(body.curriculum, "", 120),
      description: stringValue(body.description, "", 1_000),
      created_by: security.user.id,
    }).select("id,name,subject_code,grade,curriculum,description,status,created_at,updated_at").single();
    if (result.error) return errorResponse(result.error.message, 503);
    return Response.json({ bank: result.data }, { status: 201, headers });
  }

  const bankId = stringValue(body.bankId, "", 80);
  if (!bankId) return errorResponse("Thiếu mã ngân hàng.");
  try {
    if (!(await bankExists(admin, bankId))) return errorResponse("Không tìm thấy ngân hàng câu hỏi.", 404);
  } catch (value) {
    return errorResponse(value instanceof Error ? value.message : "Không thể kiểm tra ngân hàng.", 503);
  }

  if (action === "seed_from_section" || action === "attach_to_exam") {
    const examSecurity = await ensureAdminPermission(request, "exams", admin);
    if (!examSecurity.ok) return examSecurity.response;
  }

  if (action === "import_latex") {
    const source = typeof body.latexSource === "string" ? body.latexSource : "";
    if (!source.trim()) return errorResponse("Hãy chọn một tệp LaTeX có nội dung.");
    if (new TextEncoder().encode(source).byteLength > 5 * 1024 * 1024) return errorResponse("Tệp LaTeX không được vượt quá 5 MB.", 413);
    const preview = buildLatexQuestionPreview(source);
    if (preview.fileError) return errorResponse(preview.fileError, 422);
    if (preview.items.length > 500) return errorResponse("Mỗi lần nhập tối đa 500 câu hỏi.", 422);
    const requestedIndexes = Array.isArray(body.importIndexes)
      ? Array.from(new Set(body.importIndexes.filter(index => Number.isInteger(index) && index >= 0 && index < preview.items.length)))
      : preview.items.map(item => item.index);
    const selected = preview.items.filter(item => requestedIndexes.includes(item.index));
    const invalid = selected.filter(item => item.errors.length > 0);
    if (invalid.length) return Response.json({ error: "Tệp có câu hỏi lỗi cú pháp hoặc dữ liệu.", invalidIndexes: invalid.map(item => item.index), preview: preview.items }, { status: 422, headers });
    if (!selected.length) return errorResponse("Không có câu hỏi hợp lệ để lưu.", 422);
    const semanticInvalid = selected.flatMap(item => {
      const validation = validateQuestionBankContent({
        prompt: item.prompt,
        question_type: item.question_type,
        options: item.options,
        correct_answer: item.correct_answer,
        explanation: item.explanation,
        solution_source: item.solution_source,
      });
      return validation.valid ? [] : [{ index: item.index, fieldErrors: validation.fieldErrors }];
    });
    if (semanticInvalid.length) {
      return Response.json({
        error: "Một số câu hỏi được chọn chưa đủ dữ liệu để lưu.",
        code: "invalid_question_content",
        invalidIndexes: semanticInvalid.map(item => item.index),
        invalidItems: semanticInvalid,
      }, { status: 422, headers });
    }
    if (body.parentId) {
      const node = await admin.from("question_bank_nodes").select("id").eq("id", body.parentId).eq("bank_id", bankId).maybeSingle();
      if (node.error) return errorResponse(node.error.message, 503);
      if (!node.data) return errorResponse("Chủ đề không thuộc ngân hàng này.");
    }
    const difficulty = normalizeDifficulty(body.difficulty);
    const tags = normalizeTags(body.tags);
    const itemRows = selected.map(() => ({
      id: crypto.randomUUID(),
      bank_id: bankId,
      node_id: body.parentId || null,
      current_version: 1,
      difficulty,
      tags,
      created_by: security.user.id,
    }));
    const itemResult = await admin.from("question_bank_items").insert(itemRows);
    if (itemResult.error) return errorResponse(itemResult.error.message, 503);
    const versionRows = selected.map((item, index) => ({
      item_id: itemRows[index].id,
      version: 1,
      ...normalizeQuestionBankContent({
        prompt: item.prompt,
        question_type: item.question_type,
        options: item.options,
        correct_answer: item.correct_answer,
        explanation: item.explanation,
        solution_source: item.solution_source,
      }),
      created_by: security.user.id,
    }));
    const versionResult = await admin.from("question_bank_item_versions").insert(versionRows);
    if (versionResult.error) {
      await admin.from("question_bank_items").delete().in("id", itemRows.map(item => item.id));
      return errorResponse(versionResult.error.message, 503);
    }
    return Response.json({ imported: selected.length, skipped: preview.items.length - selected.length }, { status: 201, headers });
  }

  if (action === "create_node") {
    const title = stringValue(body.title, "", 160);
    if (!title) return errorResponse("Tên chủ đề không được để trống.");
    if (body.parentId) {
      const parent = await admin.from("question_bank_nodes").select("id").eq("id", body.parentId).eq("bank_id", bankId).maybeSingle();
      if (parent.error) return errorResponse(parent.error.message, 503);
      if (!parent.data) return errorResponse("Chủ đề cha không thuộc ngân hàng này.");
    }
    const result = await admin.from("question_bank_nodes").insert({
      bank_id: bankId,
      parent_id: body.parentId || null,
      title,
      node_type: body.nodeType === "unit" ? "unit" : "topic",
    }).select("id,bank_id,parent_id,title,node_type,sort_order").single();
    if (result.error) return errorResponse(result.error.message, 503);
    return Response.json({ node: result.data }, { status: 201, headers });
  }

  if (action === "create_item" || action === "update_item") {
    const content = normalizeQuestionBankContent(body.content);
    const contentValidation = validateQuestionBankContent(body.content);
    if (!contentValidation.valid) return invalidQuestionContentResponse(contentValidation.fieldErrors);
    const difficulty = normalizeDifficulty(body.difficulty);
    const tags = normalizeTags(body.tags);
    if (body.parentId) {
      const node = await admin.from("question_bank_nodes").select("id").eq("id", body.parentId).eq("bank_id", bankId).maybeSingle();
      if (node.error) return errorResponse(node.error.message, 503);
      if (!node.data) return errorResponse("Chủ đề không thuộc ngân hàng này.");
    }

    const existingItem = action === "update_item"
      ? await admin.from("question_bank_items").select("id,current_version,bank_id").eq("id", body.itemId ?? "").eq("bank_id", bankId).maybeSingle()
      : null;
    if (existingItem?.error) return errorResponse(existingItem.error.message, 503);
    if (action === "update_item" && !existingItem?.data) return errorResponse("Không tìm thấy câu hỏi.", 404);

    try {
      const potentialDuplicates = await findPotentialDuplicatesForItem(admin, bankId, content, existingItem?.data?.id ?? "");
      if (potentialDuplicates.length && body.allowPotentialDuplicates !== true) {
        return Response.json({
          error: "Tìm thấy câu hỏi có nội dung gần giống. Hãy rà soát trước khi lưu.",
          code: "potential_duplicates",
          potentialDuplicates,
        }, { status: 409, headers });
      }
    } catch (value) {
      return errorResponse(value instanceof Error ? value.message : "Không thể kiểm tra câu hỏi trùng lặp.", 503);
    }

    if (action === "create_item") {
      const itemId = crypto.randomUUID();
      const itemResult = await admin.from("question_bank_items").insert({
        id: itemId,
        bank_id: bankId,
        node_id: body.parentId || null,
        current_version: 1,
        difficulty,
        tags,
        created_by: security.user.id,
      });
      if (itemResult.error) return errorResponse(itemResult.error.message, 503);
      const versionResult = await admin.from("question_bank_item_versions").insert({
        item_id: itemId,
        version: 1,
        ...content,
        created_by: security.user.id,
      });
      if (versionResult.error) {
        await admin.from("question_bank_items").delete().eq("id", itemId);
        return errorResponse(versionResult.error.message, 503);
      }
      return Response.json({ itemId, version: 1 }, { status: 201, headers });
    }

    const item = existingItem?.data;
    if (!item) return errorResponse("Không tìm thấy câu hỏi.", 404);
    const nextVersion = Number(item.current_version || 0) + 1;
    const versionResult = await admin.from("question_bank_item_versions").insert({
      item_id: item.id,
      version: nextVersion,
      ...content,
      created_by: security.user.id,
    });
    if (versionResult.error) return errorResponse(versionResult.error.message, 503);
    const itemResult = await admin.from("question_bank_items").update({
      node_id: body.parentId || null,
      current_version: nextVersion,
      difficulty,
      tags,
      updated_at: new Date().toISOString(),
    }).eq("id", item.id).eq("bank_id", bankId);
    if (itemResult.error) return errorResponse(itemResult.error.message, 503);
    return Response.json({ itemId: item.id, version: nextVersion }, { headers });
  }

  if (action === "seed_from_section") {
    const sectionId = stringValue(body.sectionId, "", 80);
    const parentId = stringValue(body.parentId, "", 80);
    if (!sectionId) return errorResponse("Hãy chọn phần đề cần nạp.");
    if (parentId) {
      const node = await admin.from("question_bank_nodes").select("id").eq("id", parentId).eq("bank_id", bankId).maybeSingle();
      if (node.error) return errorResponse(node.error.message, 503);
      if (!node.data) return errorResponse("Chủ đề không thuộc ngân hàng này.");
    }
    const section = await admin.from("exam_sections").select("id,exam_id,title").eq("id", sectionId).maybeSingle();
    if (section.error) return errorResponse(section.error.message, 503);
    if (!section.data) return errorResponse("Không tìm thấy phần đề.", 404);
    const questions = await admin.from("exam_questions").select("id,prompt,question_type,options,passage,media_url,instruction,sort_order").eq("section_id", sectionId).order("sort_order").limit(500);
    if (questions.error) return errorResponse(questions.error.message, 503);
    const questionIds = (questions.data ?? []).map(question => question.id);
    const keys = questionIds.length
      ? await admin.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", questionIds)
      : { data: [], error: null };
    if (keys.error) return errorResponse(keys.error.message, 503);
    const keyByQuestion = new Map((keys.data ?? []).map(key => [key.question_id, key]));
    const sourceItems = (questions.data ?? []).map((question, index) => {
      const key = keyByQuestion.get(question.id);
      const content = {
        prompt: question.prompt,
        question_type: question.question_type,
        options: question.options ?? [],
        correct_answer: key?.correct_answer ?? null,
        explanation: key?.explanation ?? "",
        passage: question.passage ?? null,
        media_url: question.media_url ?? null,
        instruction: question.instruction ?? null,
        solution_source: "",
      };
      return { index, content, validation: validateQuestionBankContent(content) };
    });
    const invalidSourceItems = sourceItems.flatMap(item => item.validation.valid
      ? []
      : [{ index: item.index, fieldErrors: item.validation.fieldErrors }]);
    if (invalidSourceItems.length) {
      return Response.json({
        error: "Một số câu trong phần đề nguồn chưa đủ dữ liệu để nạp vào ngân hàng.",
        code: "invalid_question_content",
        invalidIndexes: invalidSourceItems.map(item => item.index),
        invalidItems: invalidSourceItems,
      }, { status: 422, headers });
    }
    const itemRows = (questions.data ?? []).map(() => ({
      id: crypto.randomUUID(),
      bank_id: bankId,
      node_id: parentId || null,
      current_version: 1,
      difficulty: normalizeDifficulty(body.difficulty),
      tags: normalizeTags(body.tags),
      created_by: security.user.id,
    }));
    if (itemRows.length) {
      const itemResult = await admin.from("question_bank_items").insert(itemRows);
      if (itemResult.error) return errorResponse(itemResult.error.message, 503);
      const versions = sourceItems.map((sourceItem, index) => {
        return {
          item_id: itemRows[index].id,
          version: 1,
          ...normalizeQuestionBankContent(sourceItem.content),
          created_by: security.user.id,
        };
      });
      const versionResult = await admin.from("question_bank_item_versions").insert(versions);
      if (versionResult.error) {
        await admin.from("question_bank_items").delete().in("id", itemRows.map(item => item.id));
        return errorResponse(versionResult.error.message, 503);
      }
    }
    return Response.json({ imported: itemRows.length, section: section.data }, { headers });
  }

  if (action === "attach_to_exam") {
    const examId = stringValue(body.examId, "", 80);
    const sectionId = stringValue(body.sectionId, "", 80);
    const itemIds = idList(body.itemIds);
    if (!examId || !sectionId || !itemIds.length) return errorResponse("Hãy chọn đề, phần thi và ít nhất một câu hỏi.");
    const [section, targetExam] = await Promise.all([
      admin.from("exam_sections").select("id,exam_id").eq("id", sectionId).eq("exam_id", examId).maybeSingle(),
      admin.from("exams").select("id,room_id,exam_type,published").eq("id", examId).maybeSingle(),
    ]);
    if (section.error || targetExam.error) return errorResponse(section.error?.message || targetExam.error?.message || "Không thể kiểm tra đề thi.", 503);
    if (!section.data || !targetExam.data) return errorResponse("Phần thi không thuộc đề đã chọn.");
    if (targetExam.data.published === true) return errorResponse("Không thể thêm câu vào đề đã xuất bản. Hãy chọn một bản nháp để giữ nội dung học viên đang làm ổn định.", 409);
    const targetRoom = await admin.from("exam_rooms").select("id,exam_type").eq("id", targetExam.data.room_id).maybeSingle();
    if (targetRoom.error) return errorResponse(targetRoom.error.message, 503);
    if (!targetRoom.data) return errorResponse("Không tìm thấy phòng thi của đề đã chọn.", 404);
    const isThptqg = [targetExam.data.exam_type, targetRoom.data.exam_type].some(type => String(type ?? "").trim().toUpperCase() === "THPTQG");
    const items = await admin.from("question_bank_items").select("id,current_version,bank_id,node_id,status").eq("bank_id", bankId).in("id", itemIds).in("status", ["draft", "active"]);
    if (items.error) return errorResponse(items.error.message, 503);
    const selectedItems = items.data ?? [];
    if (selectedItems.length !== itemIds.length) return errorResponse("Một hoặc nhiều câu hỏi không còn khả dụng.");
    const versions = await admin.from("question_bank_item_versions").select("item_id,version,prompt,question_type,options,correct_answer,explanation,passage,media_url,instruction,solution_source").in("item_id", itemIds);
    if (versions.error) return errorResponse(versions.error.message, 503);
    const versionMap = new Map((versions.data ?? []).map(version => [`${version.item_id}:${version.version}`, version]));
    const missing = selectedItems.some(item => !versionMap.has(`${item.id}:${item.current_version}`));
    if (missing) return errorResponse("Một hoặc nhiều câu hỏi chưa có phiên bản hiện tại.");
    const invalidItems = selectedItems.flatMap(item => {
      const version = versionMap.get(`${item.id}:${item.current_version}`)!;
      const validation = validateQuestionBankContent(version);
      const targetErrors = targetExamFieldErrors(normalizeQuestionBankContent(version), isThptqg);
      const fieldErrors = { ...validation.fieldErrors, ...targetErrors };
      return Object.keys(fieldErrors).length ? [{ itemId: item.id, fieldErrors }] : [];
    });
    if (invalidItems.length) return invalidQuestionContentResponse({}, invalidItems);
    const currentMax = await admin.from("exam_questions").select("sort_order").eq("section_id", sectionId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    if (currentMax.error) return errorResponse(currentMax.error.message, 503);
    const startOrder = Number(currentMax.data?.sort_order ?? -1) + 1;
    const questionRows = selectedItems.map((item, index) => {
      const version = versionMap.get(`${item.id}:${item.current_version}`)!;
      return {
        id: crypto.randomUUID(),
        section_id: sectionId,
        prompt: version.prompt,
        question_type: version.question_type,
        options: version.options ?? [],
        points: Number(body.points) > 0 ? Number(body.points) : 1,
        sort_order: startOrder + index,
        passage: version.passage ?? null,
        media_url: version.media_url ?? null,
        instruction: version.instruction ?? null,
        latex_source: "",
        solution_source: version.solution_source ?? "",
        source_item_id: item.id,
        source_item_version: item.current_version,
      };
    });
    const questionResult = await admin.from("exam_questions").insert(questionRows);
    if (questionResult.error) return errorResponse(questionResult.error.message, 503);
    const keyRows = selectedItems.map((item, index) => {
      const version = versionMap.get(`${item.id}:${item.current_version}`)!;
      return { question_id: questionRows[index].id, correct_answer: version.correct_answer ?? null, explanation: version.explanation ?? "" };
    });
    const keyResult = await admin.from("exam_question_keys").insert(keyRows);
    if (keyResult.error) {
      await admin.from("exam_questions").delete().in("id", questionRows.map(question => question.id));
      return errorResponse(keyResult.error.message, 503);
    }
    return Response.json({ attached: questionRows.length, questionIds: questionRows.map(question => question.id) }, { headers });
  }

  return errorResponse("Thao tác không hợp lệ.");
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
