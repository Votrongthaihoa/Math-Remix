import { deleteR2Object, listR2Objects, putR2Object } from "../../../../lib/r2-server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import {
  EXAM_IMAGE_MAX_STORED_BYTES,
  EXAM_IMAGE_MAX_UPLOAD_BYTES,
  EXAM_IMAGE_SECTION_PATTERN,
  examImageHeaders,
  examImageKey,
  examImageUrl,
  requireExamImageAdmin,
  safeImageAsset,
  validateImageUpload,
} from "../../../../lib/exam-images-server";

type ImageMutationBody = {
  sectionId?: unknown;
  assetName?: unknown;
  draftSource?: unknown;
  allowOrphan?: unknown;
};

const EXAM_IMAGE_PREFIX = "exam-images/";

function rowContainsAsset(row: Record<string, unknown>, assetName: string) {
  return Object.values(row).some((value) => {
    const text = typeof value === "string" ? value : JSON.stringify(value ?? "") ?? "";
    return text.includes(assetName);
  });
}

async function loadSectionQuestions(admin: SupabaseClient, sectionId: string) {
  return admin
    .from("exam_questions")
    .select("latex_source,solution_source,prompt,passage,media_url,instruction,options")
    .eq("section_id", sectionId);
}

async function verifySection(
  admin: SupabaseClient,
  sectionId: string,
) {
  if (!EXAM_IMAGE_SECTION_PATTERN.test(sectionId)) return false;
  const { data } = await admin.from("exam_sections").select("id").eq("id", sectionId).maybeSingle();
  return Boolean(data);
}

function parseExamImageKey(key: string) {
  if (!key.startsWith(EXAM_IMAGE_PREFIX)) return null;
  const relativeKey = key.slice(EXAM_IMAGE_PREFIX.length);
  const separator = relativeKey.indexOf("/");
  if (separator <= 0 || relativeKey.indexOf("/", separator + 1) !== -1) return null;

  const sectionId = relativeKey.slice(0, separator);
  const assetName = safeImageAsset(relativeKey.slice(separator + 1));
  if (!EXAM_IMAGE_SECTION_PATTERN.test(sectionId) || !assetName) return null;
  return { sectionId, assetName };
}

async function loadAllExamImageReferences(admin: SupabaseClient) {
  const [sectionResult, examResult, questionResult] = await Promise.all([
    admin.from("exam_sections").select("id,exam_id,title"),
    admin.from("exams").select("id,title"),
    admin.from("exam_questions").select("section_id,latex_source,solution_source,prompt,passage,media_url,instruction,options"),
  ]);

  return {
    sections: sectionResult.data ?? [],
    exams: examResult.data ?? [],
    questions: questionResult.data ?? [],
    error: sectionResult.error ?? examResult.error ?? questionResult.error,
  };
}

async function listAllExamImages(admin: SupabaseClient) {
  const references = await loadAllExamImageReferences(admin);
  if (references.error) {
    return { error: "Không thể đọc thông tin đề/phần để kiểm tra tham chiếu ảnh." };
  }

  let objects;
  try {
    objects = await listR2Objects(EXAM_IMAGE_PREFIX);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không thể đọc danh sách ảnh đề thi trên R2." };
  }

  const exams = new Map((references.exams as Array<{ id: string; title: string }>).map((exam) => [exam.id, exam]));
  const sections = new Map((references.sections as Array<{ id: string; exam_id: string; title: string }>).map((section) => [section.id, section]));
  const questionsBySection = new Map<string, Array<Record<string, unknown>>>();
  for (const question of references.questions as Array<Record<string, unknown> & { section_id?: string }>) {
    if (!question.section_id) continue;
    const current = questionsBySection.get(question.section_id) ?? [];
    current.push(question);
    questionsBySection.set(question.section_id, current);
  }

  const images = objects
    .map((object) => {
      const parsed = parseExamImageKey(object.key);
      if (!parsed) return null;
      const section = sections.get(parsed.sectionId);
      const exam = section ? exams.get(section.exam_id) : undefined;
      const questions = questionsBySection.get(parsed.sectionId) ?? [];
      return {
        ...parsed,
        url: examImageUrl(parsed.sectionId, parsed.assetName),
        examId: section?.exam_id ?? null,
        examTitle: exam?.title ?? "Đề thi đã xoá",
        sectionTitle: section?.title ?? "Phần thi đã xoá",
        orphan: !section,
        used: questions.some((question) => rowContainsAsset(question, parsed.assetName)),
        size: object.size,
        lastModified: object.lastModified,
      };
    })
    .filter((image): image is NonNullable<typeof image> => Boolean(image))
    .sort((left, right) => (right.lastModified ?? "").localeCompare(left.lastModified ?? ""));

  return { images };
}

async function getExamImages(request: Request) {
  const authentication = await requireExamImageAdmin(request, "exams");
  if (!authentication.ok) return authentication.response;

  const searchParams = new URL(request.url).searchParams;
  if (searchParams.get("all") === "1" || searchParams.get("scope") === "all") {
    const result = await listAllExamImages(authentication.admin);
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: 503, headers: examImageHeaders });
    }
    return Response.json({ images: result.images }, { status: 200, headers: examImageHeaders });
  }

  const sectionId = searchParams.get("sectionId")?.trim() ?? "";
  if (!EXAM_IMAGE_SECTION_PATTERN.test(sectionId)) {
    return Response.json({ error: "Thiáº¿u pháº§n thi há»£p lá»‡." }, { status: 400, headers: examImageHeaders });
  }
  if (!(await verifySection(authentication.admin, sectionId))) {
    return Response.json({ error: "KhÃ´ng tÃ¬m tháº¥y pháº§n thi." }, { status: 404, headers: examImageHeaders });
  }

  const questionResult = await loadSectionQuestions(authentication.admin, sectionId);
  if (questionResult.error) {
    return Response.json({ error: "KhÃ´ng thá»ƒ Ä‘á»c cÃ¡c tham chiáº¿u áº£nh trong pháº§n thi." }, { status: 503, headers: examImageHeaders });
  }

  let objects;
  try {
    objects = await listR2Objects(examImageKey(sectionId, ""));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "KhÃ´ng thá»ƒ Ä‘á»c danh sÃ¡ch áº£nh trÃªn R2." }, { status: 503, headers: examImageHeaders });
  }

  const questions = (questionResult.data ?? []) as Array<Record<string, unknown>>;
  const prefix = examImageKey(sectionId, "");
  const images = objects
    .map((object) => {
      const assetName = safeImageAsset(object.key.startsWith(prefix) ? object.key.slice(prefix.length) : "");
      if (!assetName) return null;
      return {
        assetName,
        url: examImageUrl(sectionId, assetName),
        used: questions.some((question) => rowContainsAsset(question, assetName)),
        size: object.size,
        lastModified: object.lastModified,
      };
    })
    .filter((image): image is NonNullable<typeof image> => Boolean(image))
    .sort((left, right) => (right.lastModified ?? "").localeCompare(left.lastModified ?? ""));

  return Response.json({ images }, { status: 200, headers: examImageHeaders });
}

async function postExamImage(request: Request) {
  const authentication = await requireExamImageAdmin(request, "exams");
  if (!authentication.ok) return authentication.response;

  const form = await request.formData().catch(() => null);
  const sectionId = String(form?.get("sectionId") ?? "").trim();
  const file = form?.get("file");
  if (!EXAM_IMAGE_SECTION_PATTERN.test(sectionId) || !(file instanceof Blob)) {
    return Response.json({ error: "Thiếu phần thi hoặc file ảnh." }, { status: 400, headers: examImageHeaders });
  }
  if (!file.size || file.size > EXAM_IMAGE_MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Ảnh sau khi chọn phải nhỏ hơn 12 MB." }, { status: 413, headers: examImageHeaders });
  }

  const access = await authentication.admin.from("exam_sections").select("id").eq("id", sectionId).maybeSingle();
  if (!access.data) return Response.json({ error: "Không tìm thấy phần thi." }, { status: 404, headers: examImageHeaders });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileName = typeof (file as Blob & { name?: unknown }).name === "string"
    ? (file as Blob & { name: string }).name
    : "";
  const validation = validateImageUpload(bytes, file.type, fileName);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 415, headers: examImageHeaders });
  if (bytes.byteLength > EXAM_IMAGE_MAX_STORED_BYTES) {
    return Response.json({ error: "File ảnh vượt quá giới hạn 8 MB." }, { status: 413, headers: examImageHeaders });
  }

  const assetName = `${crypto.randomUUID()}.${validation.extension}`;
  const key = examImageKey(sectionId, assetName);
  try {
    await putR2Object(key, validation.bytes, validation.contentType, "private, no-store", {
      "exam-section-id": sectionId,
      "uploaded-by": authentication.user.id,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể lưu ảnh vào R2." }, { status: 503, headers: examImageHeaders });
  }

  return Response.json({
    url: examImageUrl(sectionId, assetName),
    assetName,
    contentType: validation.contentType,
  }, { status: 201, headers: examImageHeaders });
}

async function deleteExamImage(request: Request) {
  const authentication = await requireExamImageAdmin(request, "exams");
  if (!authentication.ok) return authentication.response;

  const parsedBody = await readJsonBody<ImageMutationBody>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400, headers: examImageHeaders });
  const body = parsedBody.body;
  const sectionId = String(body.sectionId ?? "").trim();
  const assetName = safeImageAsset(body.assetName);
  const draftSource = body.draftSource;
  if (!EXAM_IMAGE_SECTION_PATTERN.test(sectionId) || !assetName) {
    return Response.json({ error: "Thiáº¿u pháº§n thi hoáº·c tÃªn áº£nh há»£p lá»‡." }, { status: 400, headers: examImageHeaders });
  }
  if (draftSource !== undefined && (typeof draftSource !== "string" || draftSource.length > 2_000_000)) {
    return Response.json({ error: "Báº£n nhÃ¡p quÃ¡ lá»›n Ä‘á»ƒ kiá»ƒm tra an toÃ n." }, { status: 413, headers: examImageHeaders });
  }
  if (!(await verifySection(authentication.admin, sectionId)) && body.allowOrphan !== true) {
    return Response.json({ error: "KhÃ´ng tÃ¬m tháº¥y pháº§n thi." }, { status: 404, headers: examImageHeaders });
  }

  const questionResult = await loadSectionQuestions(authentication.admin, sectionId);
  if (questionResult.error) {
    return Response.json({ error: "KhÃ´ng thá»ƒ kiá»ƒm tra tham chiáº¿u áº£nh." }, { status: 503, headers: examImageHeaders });
  }
  const questions = (questionResult.data ?? []) as Array<Record<string, unknown>>;
  if (questions.some((question) => rowContainsAsset(question, assetName))) {
    return Response.json({ error: "KhÃ´ng thá»ƒ xoÃ¡ áº£nh Ä‘ang Ä‘Æ°á»£c dÃ¹ng trong cÃ¢u há»i Ä‘Ã£ lÆ°u." }, { status: 409, headers: examImageHeaders });
  }
  if (typeof draftSource === "string" && draftSource.includes(assetName)) {
    return Response.json({ error: "HÃ£y xoÃ¡ tham chiáº¿u áº£nh khá»i báº£n nhÃ¡p trÆ°á»›c khi xoÃ¡ file." }, { status: 409, headers: examImageHeaders });
  }

  try {
    await deleteR2Object(examImageKey(sectionId, assetName));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "KhÃ´ng thá»ƒ xoÃ¡ áº£nh trÃªn R2." }, { status: 503, headers: examImageHeaders });
  }
  return Response.json({ deleted: true, assetName }, { status: 200, headers: examImageHeaders });
}

function unexpectedExamImageError(method: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error || "Unknown error");
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  console.error(`[exam-images] ${method} failed`, { detail, cause });
  return Response.json(
    { error: "Không thể xử lý kho ảnh đề thi.", detail: detail || undefined },
    { status: 503, headers: examImageHeaders },
  );
}

export async function GET(request: Request) {
  try {
    return await getExamImages(request);
  } catch (error) {
    return unexpectedExamImageError("GET", error);
  }
}

export async function POST(request: Request) {
  try {
    return await postExamImage(request);
  } catch (error) {
    return unexpectedExamImageError("POST", error);
  }
}

export async function DELETE(request: Request) {
  try {
    return await deleteExamImage(request);
  } catch (error) {
    return unexpectedExamImageError("DELETE", error);
  }
}
