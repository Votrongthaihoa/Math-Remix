import { createClient } from "@supabase/supabase-js";

const BUCKET = "lesson-files";
const MAX_PDF_SIZE = 50 * 1024 * 1024;

async function getAdmin(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { error: Response.json({ error: "Chưa cấu hình khóa quản trị." }, { status: 503 }) };

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: Response.json({ error: "Chưa đăng nhập." }, { status: 401 }) };

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return { error: Response.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 }) };
  const { data: profile } = await admin.from("profiles").select("role,status").eq("id", auth.user.id).single();
  if (profile?.role !== "admin" || profile.status !== "active") return { error: Response.json({ error: "Không có quyền quản trị." }, { status: 403 }) };
  return { admin };
}

async function ensureBucket(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) return null;
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_PDF_SIZE,
    allowedMimeTypes: ["application/pdf"],
  });
  return error && !/already exists|duplicate/i.test(error.message) ? error : null;
}

export async function POST(request: Request) {
  const authorization = await getAdmin(request);
  if ("error" in authorization) return authorization.error;
  const form = await request.formData();
  const file = form.get("file");
  const courseId = String(form.get("courseId") ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  const lessonId = String(form.get("lessonId") ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!(file instanceof File) || !courseId || !lessonId) return Response.json({ error: "Thiếu file, khóa học hoặc bài học." }, { status: 400 });
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return Response.json({ error: "Chỉ chấp nhận file PDF." }, { status: 400 });
  if (file.size > MAX_PDF_SIZE) return Response.json({ error: "File PDF không được vượt quá 50 MB." }, { status: 400 });

  const bucketError = await ensureBucket(authorization.admin);
  if (bucketError) return Response.json({ error: `Không thể tạo kho PDF: ${bucketError.message}` }, { status: 500 });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${courseId}/${lessonId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await authorization.admin.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  const url = authorization.admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return Response.json({ url, path }, { status: 201 });
}

export async function DELETE(request: Request) {
  const authorization = await getAdmin(request);
  if ("error" in authorization) return authorization.error;
  const body = await request.json() as { path?: string };
  const path = body.path?.trim() ?? "";
  if (!path || path.includes("..") || path.startsWith("/")) return Response.json({ error: "Đường dẫn file không hợp lệ." }, { status: 400 });
  const { error } = await authorization.admin.storage.from(BUCKET).remove([path]);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ deleted: true });
}
