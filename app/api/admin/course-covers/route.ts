import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteR2Object, putR2Object } from "../../../../lib/r2-server";
import {
  courseCoverAssetFromUrl,
  courseCoverKey,
  courseCoverUrl,
  COURSE_COVER_MAX_STORED_BYTES,
  COURSE_COVER_MAX_UPLOAD_BYTES,
  validateImageUpload,
} from "../../../../lib/course-covers-server";
import { ensureAdminPermission } from "../../../../lib/admin-authorization-server";
import { jsonBodyError, MULTIPART_OVERHEAD_BYTES, readJsonBody, readMultipartFormData } from "../../../../lib/http-server";
import { hashedRequestIp } from "../../../../lib/security-server";
import { consumeRequestBudget } from "../../../../lib/rate-limit-server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
};

async function requireCourseAdmin(request: Request) {
  return ensureAdminPermission(request, "courses");
}

async function loadCourse(admin: SupabaseClient, courseId: string) {
  return admin.from("courses").select("id,cover_url").eq("id", courseId).maybeSingle();
}

async function coverBudgetResponse(authentication: { admin: SupabaseClient; user: { id: string } }, request: Request, scope: string, capacity: number) {
  try {
    const budget = await consumeRequestBudget(authentication.admin, scope, `${authentication.user.id}:${await hashedRequestIp(request)}`, { capacity, refillSeconds: 60 });
    if (budget.allowed) return null;
    return Response.json({ error: "Bạn thao tác ảnh bìa quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...noStore, "retry-after": String(budget.retryAfterSeconds) } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const authentication = await requireCourseAdmin(request);
  if (!authentication.ok) return authentication.response;
  const budgetResponse = await coverBudgetResponse(authentication, request, "admin-course-covers-upload", 8);
  if (budgetResponse) return budgetResponse;

  const multipart = await readMultipartFormData(request, COURSE_COVER_MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES);
  if (!multipart.ok) {
    return Response.json({ error: multipart.error === "payload_too_large" ? "Ảnh bìa vượt quá giới hạn tải lên." : "Dữ liệu ảnh bìa không hợp lệ." }, { status: multipart.error === "payload_too_large" ? 413 : 400, headers: noStore });
  }
  const form = multipart.form;
  const courseId = String(form?.get("courseId") ?? "").trim();
  const file = form?.get("file");
  if (!uuid.test(courseId)) return Response.json({ error: "Khóa học không hợp lệ." }, { status: 400, headers: noStore });
  if (!(file instanceof Blob)) return Response.json({ error: "Thiếu file ảnh bìa." }, { status: 400, headers: noStore });
  if (!file.size || file.size > COURSE_COVER_MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Ảnh bìa phải nhỏ hơn 12 MB." }, { status: 413, headers: noStore });
  }

  const courseResult = await loadCourse(authentication.admin, courseId);
  if (courseResult.error) return Response.json({ error: "Không thể đọc thông tin khóa học." }, { status: 503, headers: noStore });
  if (!courseResult.data) return Response.json({ error: "Không tìm thấy khóa học." }, { status: 404, headers: noStore });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileName = typeof (file as Blob & { name?: unknown }).name === "string"
    ? (file as Blob & { name: string }).name
    : "";
  const validation = validateImageUpload(bytes, file.type, fileName);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 415, headers: noStore });
  if (bytes.byteLength > COURSE_COVER_MAX_STORED_BYTES) {
    return Response.json({ error: "Ảnh bìa vượt quá giới hạn 8 MB." }, { status: 413, headers: noStore });
  }

  const assetName = `${crypto.randomUUID()}.${validation.extension}`;
  const key = courseCoverKey(assetName);
  const url = courseCoverUrl(assetName);
  try {
    await putR2Object(key, validation.bytes, validation.contentType, "public, max-age=31536000, immutable", {
      "uploaded-by": authentication.user.id,
      "asset-scope": "course-cover",
      "course-id": courseId,
    });
    const updateResult = await authentication.admin.from("courses").update({ cover_url: url }).eq("id", courseId);
    if (updateResult.error) {
      await deleteR2Object(key).catch(() => undefined);
      return Response.json({ error: "Không thể lưu ảnh bìa cho khóa học." }, { status: 503, headers: noStore });
    }

    const previousAsset = courseCoverAssetFromUrl(courseResult.data.cover_url);
    if (previousAsset && previousAsset !== assetName) await deleteR2Object(courseCoverKey(previousAsset)).catch(() => undefined);
    return Response.json({ assetName, url, contentType: validation.contentType }, { status: 201, headers: noStore });
  } catch (error) {
    await deleteR2Object(key).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Không thể tải ảnh bìa lên." }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  const authentication = await requireCourseAdmin(request);
  if (!authentication.ok) return authentication.response;
  const budgetResponse = await coverBudgetResponse(authentication, request, "admin-course-covers-delete", 12);
  if (budgetResponse) return budgetResponse;
  const parsed = await readJsonBody<{ courseId?: unknown }>(request, 8 * 1024);
  if (!parsed.ok) return Response.json(jsonBodyError(parsed.error), { status: parsed.error === "payload_too_large" ? 413 : 400, headers: noStore });
  const courseId = String(parsed.body.courseId ?? "").trim();
  if (!uuid.test(courseId)) return Response.json({ error: "Khóa học không hợp lệ." }, { status: 400, headers: noStore });

  const courseResult = await loadCourse(authentication.admin, courseId);
  if (courseResult.error) return Response.json({ error: "Không thể đọc thông tin khóa học." }, { status: 503, headers: noStore });
  if (!courseResult.data) return Response.json({ error: "Không tìm thấy khóa học." }, { status: 404, headers: noStore });

  const assetName = courseCoverAssetFromUrl(courseResult.data.cover_url);
  const updateResult = await authentication.admin.from("courses").update({ cover_url: null }).eq("id", courseId);
  if (updateResult.error) return Response.json({ error: "Không thể xóa ảnh bìa khỏi khóa học." }, { status: 503, headers: noStore });
  if (assetName) await deleteR2Object(courseCoverKey(assetName)).catch(() => undefined);
  return Response.json({ deleted: true, assetName }, { status: 200, headers: noStore });
}
