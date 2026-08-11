import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteR2Object, listR2Objects, putR2Object } from "../../../../lib/r2-server";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import {
  EXAM_IMAGE_MAX_STORED_BYTES,
  EXAM_IMAGE_MAX_UPLOAD_BYTES,
  examImageHeaders,
  publicImageKey,
  publicImageUrl,
  requireExamImageAdmin,
  safeImageAsset,
  validateImageUpload,
} from "../../../../lib/exam-images-server";

type ImageMutationBody = { assetName?: unknown };

function rowContainsAsset(row: Record<string, unknown>, assetName: string) {
  return Object.values(row).some((value) => {
    const text = typeof value === "string" ? value : JSON.stringify(value ?? "") ?? "";
    return text.includes(assetName);
  });
}

async function loadQuestionReferences(admin: SupabaseClient) {
  return admin
    .from("exam_questions")
    .select("latex_source,solution_source,prompt,passage,media_url,instruction,options");
}

export async function GET(request: Request) {
  const authentication = await requireExamImageAdmin(request);
  if (!authentication.ok) return authentication.response;

  let objects;
  try {
    objects = await listR2Objects("admin-images/");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể đọc danh sách ảnh trên R2." }, { status: 503, headers: examImageHeaders });
  }

  const questionResult = await loadQuestionReferences(authentication.admin);
  if (questionResult.error) {
    return Response.json({ error: "Không thể kiểm tra tham chiếu ảnh trong đề thi." }, { status: 503, headers: examImageHeaders });
  }
  const questions = (questionResult.data ?? []) as Array<Record<string, unknown>>;
  let images;
  try {
    images = (await Promise.all(objects.map(async (object) => {
      const assetName = safeImageAsset(object.key.startsWith("admin-images/") ? object.key.slice("admin-images/".length) : "");
      if (!assetName) return null;
      return {
        assetName,
        url: await publicImageUrl(assetName),
        used: questions.some((question) => rowContainsAsset(question, assetName)),
        size: object.size,
        lastModified: object.lastModified,
      };
    }))).filter((image): image is NonNullable<typeof image> => Boolean(image))
      .sort((left, right) => (right.lastModified ?? "").localeCompare(left.lastModified ?? ""));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể tạo link đọc ảnh từ R2." }, { status: 503, headers: examImageHeaders });
  }

  return Response.json({ images }, { status: 200, headers: examImageHeaders });
}

export async function POST(request: Request) {
  const authentication = await requireExamImageAdmin(request);
  if (!authentication.ok) return authentication.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "Thiếu file ảnh." }, { status: 400, headers: examImageHeaders });
  }
  if (!file.size || file.size > EXAM_IMAGE_MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Ảnh sau khi chuyển đổi phải nhỏ hơn 12 MB." }, { status: 413, headers: examImageHeaders });
  }

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
  try {
    await putR2Object(publicImageKey(assetName), validation.bytes, validation.contentType, "public, max-age=31536000, immutable", {
      "uploaded-by": authentication.user.id,
      "asset-scope": "public-admin-image",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể lưu ảnh vào R2." }, { status: 503, headers: examImageHeaders });
  }

  return Response.json({
    assetName,
    url: await publicImageUrl(assetName),
    contentType: validation.contentType,
  }, { status: 201, headers: examImageHeaders });
}

export async function DELETE(request: Request) {
  const authentication = await requireExamImageAdmin(request);
  if (!authentication.ok) return authentication.response;

  const parsedBody = await readJsonBody<ImageMutationBody>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400, headers: examImageHeaders });
  const body = parsedBody.body;
  const assetName = safeImageAsset(body.assetName);
  if (!assetName) {
    return Response.json({ error: "Thiếu tên ảnh hợp lệ." }, { status: 400, headers: examImageHeaders });
  }

  const questionResult = await loadQuestionReferences(authentication.admin);
  if (questionResult.error) {
    return Response.json({ error: "Không thể kiểm tra tham chiếu ảnh." }, { status: 503, headers: examImageHeaders });
  }
  const questions = (questionResult.data ?? []) as Array<Record<string, unknown>>;
  if (questions.some((question) => rowContainsAsset(question, assetName))) {
    return Response.json({ error: "Không thể xoá ảnh đang được dùng trong đề thi." }, { status: 409, headers: examImageHeaders });
  }

  try {
    await deleteR2Object(publicImageKey(assetName));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể xoá ảnh trên R2." }, { status: 503, headers: examImageHeaders });
  }
  return Response.json({ deleted: true, assetName }, { status: 200, headers: examImageHeaders });
}
