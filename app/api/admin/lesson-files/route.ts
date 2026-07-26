import { createClient } from "@supabase/supabase-js";
import { createPdfUpload, deleteR2Object, r2Key, verifyPdfObject } from "../../../../lib/r2-server";

const LEGACY_BUCKET = "lesson-files";
const MAX_PDF_SIZE = 50 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

async function getAdmin(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { error: Response.json({ error: "Chưa cấu hình khóa quản trị." }, { status: 503, headers: noStore }) };
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: Response.json({ error: "Chưa đăng nhập." }, { status: 401, headers: noStore }) };
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return { error: Response.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401, headers: noStore }) };
  const { data: profile } = await admin.from("profiles").select("role,status").eq("id", auth.user.id).single();
  if (profile?.role !== "admin" || profile.status !== "active") return { error: Response.json({ error: "Không có quyền quản trị." }, { status: 403, headers: noStore }) };
  return { admin };
}

function safePart(value: unknown) { return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, ""); }
function safeFilename(value: unknown) { return String(value ?? "tai-lieu.pdf").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120); }

export async function POST(request: Request) {
  const authorization = await getAdmin(request);
  if ("error" in authorization) return authorization.error;
  const body = await request.json().catch(() => ({})) as { action?: "prepare" | "confirm"; courseId?: string; lessonId?: string; filename?: string; size?: number; path?: string };
  const size = Math.round(Number(body.size) || 0);
  if (!size || size > MAX_PDF_SIZE) return Response.json({ error: "File PDF phải có dung lượng từ 1 byte đến 50 MB." }, { status: 400, headers: noStore });

  if (body.action === "prepare") {
    const courseId = safePart(body.courseId); const lessonId = safePart(body.lessonId);
    if (!uuid.test(courseId) || !uuid.test(lessonId) || !String(body.filename ?? "").toLowerCase().endsWith(".pdf")) return Response.json({ error: "Thông tin file, khóa học hoặc bài học không hợp lệ." }, { status: 400, headers: noStore });
    const path = `${courseId}/${lessonId}/${crypto.randomUUID()}-${safeFilename(body.filename)}`;
    try { return Response.json({ ...(await createPdfUpload(path)), path }, { status: 201, headers: noStore }); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể tạo quyền upload R2." }, { status: 503, headers: noStore }); }
  }

  if (body.action === "confirm") {
    const path = String(body.path ?? "");
    if (!path || path.includes("..") || path.startsWith("/")) return Response.json({ error: "Đường dẫn R2 không hợp lệ." }, { status: 400, headers: noStore });
    try { return Response.json({ reference: await verifyPdfObject(path, size, MAX_PDF_SIZE), path }, { headers: noStore }); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể xác nhận PDF trên R2." }, { status: 400, headers: noStore }); }
  }

  return Response.json({ error: "Yêu cầu upload không hợp lệ." }, { status: 400, headers: noStore });
}

export async function DELETE(request: Request) {
  const authorization = await getAdmin(request);
  if ("error" in authorization) return authorization.error;
  const body = await request.json().catch(() => ({})) as { reference?: string; path?: string };
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
