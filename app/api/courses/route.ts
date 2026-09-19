import { ensureActiveAccount } from "../../../lib/security-server";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

export async function GET(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  const isAdmin = security.profile.role === "admin";
  const result = isAdmin
    ? await security.admin.from("courses").select("id,title,description,cover_url,cover_color,published").order("sort_order").order("created_at")
    : await security.admin.from("course_enrollments").select("course_id,courses(id,title,description,cover_url,cover_color,published)").eq("student_id", security.user.id);
  if (result.error) return Response.json({ error: "Không thể tải khóa học." }, { status: 503, headers });
  const rows = isAdmin
    ? result.data ?? []
    : (result.data as Array<{ courses?: unknown | unknown[] }> ?? []).flatMap(row => Array.isArray(row.courses) ? row.courses : row.courses ? [row.courses] : []);
  return Response.json({ courses: rows }, { headers });
}
