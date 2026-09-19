import type { SupabaseClient } from "@supabase/supabase-js";
import { createPdfUpload, deleteR2Object, r2Key, verifyPdfObject } from "../../../../lib/r2-server";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { ensureAdminPermission } from "../../../../lib/admin-authorization-server";
import { hashedRequestIp } from "../../../../lib/security-server";
import { consumeRequestBudget } from "../../../../lib/rate-limit-server";

const LEGACY_BUCKET = "lesson-files";
const MAX_PDF_SIZE = 50 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

async function getAdmin(request: Request) {
  const security = await ensureAdminPermission(request, "courses");
  if (!security.ok) return { error: security.response };
  const { user, admin } = security;
  return { admin, user };
}

function safePart(value: unknown) { return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, ""); }
function safeFilename(value: unknown) { return String(value ?? "tai-lieu.pdf").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120); }

function legacyStoragePath(reference: string) {
  const marker = "/lesson-files/";
  const markerIndex = reference.indexOf(marker);
  if (markerIndex < 0) return null;
  try {
    const path = decodeURIComponent(reference.slice(markerIndex + marker.length));
    return path && !path.startsWith("/") && !path.includes("..") && !/[\\\\\0\u0001-\u001f\u007f]/.test(path)
      ? path
      : null;
  } catch {
    return null;
  }
}

function scopedUploadPath(path: string, courseId: string, lessonId: string) {
  const prefix = `${courseId}/${lessonId}/`;
  return path.startsWith(prefix) && path.length > prefix.length && !path.includes("..") && !/[\\\\\0\u0001-\u001f\u007f]/.test(path);
}

async function deleteCanonicalLessonFile(
  admin: SupabaseClient,
  resourceId: string,
  courseId: string,
  lessonId: string,
) {
  const { data, error } = await admin
    .from("lesson_resources")
    .select("id,lesson_id,resource_type,resource_url,lessons(chapters(course_id))")
    .eq("id", resourceId)
    .maybeSingle();
  const row = data as {
    id: string;
    lesson_id: string;
    resource_type: string;
    resource_url: string;
    lessons?: { chapters?: { course_id?: string } | Array<{ course_id?: string }> } | Array<{ chapters?: { course_id?: string } | Array<{ course_id?: string }> }> | null;
  } | null;
  const lesson = Array.isArray(row?.lessons) ? row.lessons[0] : row?.lessons;
  const chapters = lesson?.chapters;
  const chapter = Array.isArray(chapters) ? chapters[0] : chapters;
  if (error || !row || row.resource_type !== "storage_pdf" || row.lesson_id !== lessonId || chapter?.course_id !== courseId) {
    throw new Error("Tài liệu PDF không thuộc bài học đã chọn.");
  }

  const reference = row.resource_url.trim();
  const key = reference.startsWith("r2://") ? r2Key(reference) : null;
  if (reference.startsWith("r2://")) {
    if (!key || !scopedUploadPath(key, courseId, lessonId)) throw new Error("Tham chiếu R2 của tài liệu không thuộc bài học đã chọn.");
    await deleteR2Object(key);
    return;
  }
  const path = legacyStoragePath(reference);
  if (!path || !scopedUploadPath(path, courseId, lessonId)) throw new Error("Đường dẫn file PDF cũ không thuộc bài học đã chọn.");
  const result = await admin.storage.from(LEGACY_BUCKET).remove([path]);
  if (result.error) throw result.error;
}

export async function POST(request: Request) {
  const authorization = await getAdmin(request);
  if ("error" in authorization) return authorization.error;
  try {
    const budget = await consumeRequestBudget(authorization.admin, "admin-lesson-files", `${authorization.user.id}:${await hashedRequestIp(request)}`, { capacity: 20, refillSeconds: 30 });
    if (!budget.allowed) return Response.json({ error: "Bạn thao tác upload quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...noStore, "retry-after": String(budget.retryAfterSeconds) } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStore });
  }
  const parsedBody = await readJsonBody<{ action?: "prepare" | "confirm"; courseId?: string; lessonId?: string; filename?: string; mimeType?: string; size?: number; path?: string }>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400, headers: noStore });
  const body = parsedBody.body;
  const size = Math.round(Number(body.size) || 0);
  if (!size || size > MAX_PDF_SIZE) return Response.json({ error: "File PDF phải có dung lượng từ 1 byte đến 50 MB." }, { status: 400, headers: noStore });

  if (body.action === "prepare") {
    const courseId = safePart(body.courseId); const lessonId = safePart(body.lessonId);
    if (!uuid.test(courseId) || !uuid.test(lessonId) || !String(body.filename ?? "").toLowerCase().endsWith(".pdf") || body.mimeType !== "application/pdf") return Response.json({ error: "Thông tin file, khóa học hoặc bài học không hợp lệ." }, { status: 400, headers: noStore });
    const { data: lesson, error: lessonError } = await authorization.admin.from("lessons").select("id,chapters(course_id)").eq("id", lessonId).maybeSingle();
    const chapters = lesson?.chapters as { course_id?: string } | Array<{ course_id?: string }> | null | undefined;
    const chapter = Array.isArray(chapters) ? chapters[0] : chapters;
    if (lessonError || !lesson || chapter?.course_id !== courseId) return Response.json({ error: "Bài học không thuộc khóa học đã chọn." }, { status: 400, headers: noStore });
    const path = `${courseId}/${lessonId}/${crypto.randomUUID()}-${safeFilename(body.filename)}`;
    try { return Response.json({ ...(await createPdfUpload(path)), path }, { status: 201, headers: noStore }); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể tạo quyền upload R2." }, { status: 503, headers: noStore }); }
  }

  if (body.action === "confirm") {
    const courseId = safePart(body.courseId); const lessonId = safePart(body.lessonId);
    const path = String(body.path ?? "");
    if (!uuid.test(courseId) || !uuid.test(lessonId) || !path.startsWith(`${courseId}/${lessonId}/`) || path.includes("..") || path.startsWith("/")) return Response.json({ error: "Đường dẫn R2 không hợp lệ." }, { status: 400, headers: noStore });
    try { return Response.json({ reference: await verifyPdfObject(path, size, MAX_PDF_SIZE), path }, { headers: noStore }); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể xác nhận PDF trên R2." }, { status: 400, headers: noStore }); }
  }

  return Response.json({ error: "Yêu cầu upload không hợp lệ." }, { status: 400, headers: noStore });
}

export async function DELETE(request: Request) {
  const authorization = await getAdmin(request);
  if ("error" in authorization) return authorization.error;
  try {
    const budget = await consumeRequestBudget(authorization.admin, "admin-lesson-files-delete", `${authorization.user.id}:${await hashedRequestIp(request)}`, { capacity: 10, refillSeconds: 60 });
    if (!budget.allowed) return Response.json({ error: "Bạn xóa file quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...noStore, "retry-after": String(budget.retryAfterSeconds) } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStore });
  }
  const parsedBody = await readJsonBody<{ resourceId?: string; courseId?: string; lessonId?: string; reference?: string; path?: string; storage?: "r2" | "legacy" }>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400, headers: noStore });
  const body = parsedBody.body;
  const reference = body.reference?.trim() ?? "";
  try {
    const resourceId = body.resourceId?.trim() ?? "";
    const courseId = safePart(body.courseId);
    const lessonId = safePart(body.lessonId);
    if (resourceId) {
      if (!uuid.test(resourceId) || !uuid.test(courseId) || !uuid.test(lessonId)) return Response.json({ error: "Tài liệu PDF không hợp lệ." }, { status: 400, headers: noStore });
      await deleteCanonicalLessonFile(authorization.admin, resourceId, courseId, lessonId);
    } else {
      // Cleanup for an upload that never became a lesson_resource. It still
      // needs the server-issued course/lesson prefix; a client-supplied key
      // alone must never authorize deletion from the bucket.
      if (!uuid.test(courseId) || !uuid.test(lessonId)) return Response.json({ error: "Thiếu phạm vi bài học cho file cần dọn." }, { status: 400, headers: noStore });
      const suppliedPath = body.path?.trim() ?? "";
      const key = r2Key(reference);
      if (body.storage === "r2" || reference.startsWith("r2://")) {
        const cleanupKey = body.storage === "r2" ? suppliedPath : key;
        if (!cleanupKey || !scopedUploadPath(cleanupKey, courseId, lessonId)) return Response.json({ error: "Đường dẫn R2 không thuộc bài học đã chọn." }, { status: 400, headers: noStore });
        await deleteR2Object(cleanupKey);
      } else {
        const path = suppliedPath || legacyStoragePath(reference) || "";
        if (!scopedUploadPath(path, courseId, lessonId)) return Response.json({ error: "Đường dẫn file không thuộc bài học đã chọn." }, { status: 400, headers: noStore });
        const { error } = await authorization.admin.storage.from(LEGACY_BUCKET).remove([path]);
        if (error) throw error;
      }
    }
    return Response.json({ deleted: true }, { headers: noStore });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể xóa file." }, { status: 400, headers: noStore });
  }
}
