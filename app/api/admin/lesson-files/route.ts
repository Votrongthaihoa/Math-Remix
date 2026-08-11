import { createClient } from "@supabase/supabase-js";
import { createPdfUpload, deleteR2Object, r2Key, verifyPdfObject } from "../../../../lib/r2-server";
import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { hashedRequestIp, resolveAuthUser } from "../../../../lib/security-server";
import { consumeRequestBudget } from "../../../../lib/rate-limit-server";

const LEGACY_BUCKET = "lesson-files";
const MAX_PDF_SIZE = 50 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

async function getAdmin(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { error: Response.json({ error: "Chưa cấu hình khóa quản trị." }, { status: 503, headers: noStore }) };
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
    || request.headers.get("x-supabase-access-token")?.trim()
    || "";
  if (!token) return { error: Response.json({ error: "Chưa đăng nhập." }, { status: 401, headers: noStore }) };
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const directUser = await admin.auth.getUser(token).then(result => result.data.user).catch(() => null);
  const user = directUser ?? await resolveAuthUser(token, admin);
  if (!user) return { error: Response.json({ error: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.", code: "AUTH_SESSION_INVALID" }, { status: 401, headers: noStore }) };
  const { data: profile } = await admin.from("profiles").select("role,status").eq("id", user.id).single();
  if (profile?.role !== "admin" || profile.status !== "active") return { error: Response.json({ error: "Không có quyền quản trị." }, { status: 403, headers: noStore }) };
  return { admin, user };
}

function safePart(value: unknown) { return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, ""); }
function safeFilename(value: unknown) { return String(value ?? "tai-lieu.pdf").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120); }

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
  const parsedBody = await readJsonBody<{ reference?: string; path?: string }>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400, headers: noStore });
  const body = parsedBody.body;
  const reference = body.reference?.trim() ?? "";
  const key = r2Key(reference);
  try {
    if (key) await deleteR2Object(key);
    else {
      const path = body.path?.trim() ?? "";
      if (!path || path.includes("..") || path.startsWith("/")) return Response.json({ error: "Đường dẫn file không hợp lệ." }, { status: 400, headers: noStore });
      const { error } = await authorization.admin.storage.from(LEGACY_BUCKET).remove([path]);
      if (error) throw error;
    }
    return Response.json({ deleted: true }, { headers: noStore });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể xóa file." }, { status: 400, headers: noStore });
  }
}
