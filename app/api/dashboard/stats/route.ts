import { ensureActiveAccount } from "../../../../lib/security-server";

const noStore = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  if (security.profile.role !== "admin") return Response.json({ error: "Bạn không có quyền xem số liệu quản trị." }, { status: 403, headers: noStore });
  const [profiles, questions, rooms, courses] = await Promise.all([
    security.admin.from("profiles").select("id", { count: "exact", head: true }),
    security.admin.from("exam_questions").select("id", { count: "exact", head: true }),
    security.admin.from("exam_rooms").select("id", { count: "exact", head: true }),
    security.admin.from("courses").select("id", { count: "exact", head: true }),
  ]);
  const failed = [profiles, questions, rooms, courses].some(result => result.error);
  if (failed) return Response.json({ error: "Không thể tải số liệu quản trị." }, { status: 503, headers: noStore });
  return Response.json({
    checkedAt: new Date().toISOString(),
    users: profiles.count ?? 0,
    questions: questions.count ?? 0,
    examRooms: rooms.count ?? 0,
    courses: courses.count ?? 0,
    server: { status: "healthy" },
  }, { headers: noStore });
}
