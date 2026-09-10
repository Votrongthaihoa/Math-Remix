import type { SupabaseClient } from "@supabase/supabase-js";
import { contentServer } from "../../../../lib/content-server";
import { guardResourceAccess } from "../../../../lib/resource-access-server";
import { ensureActiveAccount, type SecurityProfile } from "../../../../lib/security-server";

const noStore = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const eligibleActivities = ["lesson", "video", "pdf"] as const;

type CourseRelation = { id: string; title: string } | { id: string; title: string }[] | null;
type ChapterRelation = { id: string; title: string; courses: CourseRelation } | { id: string; title: string; courses: CourseRelation }[] | null;
type LessonRelation = { id: string; title: string; published: boolean; chapters: ChapterRelation } | { id: string; title: string; published: boolean; chapters: ChapterRelation }[] | null;

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function allowedLesson(admin: SupabaseClient, userId: string, profile: SecurityProfile, lessonId: string) {
  const { data: lesson } = await admin
    .from("lessons")
    .select("id,title,published,chapters(id,title,courses(id,title))")
    .eq("id", lessonId)
    .maybeSingle();
  const typed = lesson as { id: string; title: string; published: boolean; chapters: ChapterRelation } | null;
  const chapter = first(typed?.chapters);
  const course = first(chapter?.courses);
  if (!typed || !chapter || !course) return null;
  if (profile.role !== "admin") {
    if (!typed.published) return null;
    const { data: enrollment } = await admin.from("course_enrollments").select("course_id").eq("student_id", userId).eq("course_id", course.id).maybeSingle();
    if (!enrollment) return null;
  }
  return { lessonId: typed.id, lessonTitle: typed.title, courseTitle: course.title };
}

export async function GET(request: Request) {
  const config = contentServer();
  if (!config.ok) return config.response;
  const security = await ensureActiveAccount(request, config.admin);
  if (!security.ok) return security.response;
  const { admin, user, profile } = security;
  const { data: sessions, error } = await admin
    .from("user_sessions")
    .select("activity_type,current_resource_id,last_seen_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .in("activity_type", eligibleActivities)
    .not("current_resource_id", "is", null)
    .order("last_seen_at", { ascending: false })
    .limit(12);
  if (error) return Response.json({ error: "Không thể tải tiến độ học gần đây." }, { status: 500, headers: noStore });

  for (const session of sessions ?? []) {
    const id = typeof session.current_resource_id === "string" ? session.current_resource_id : "";
    if (!id) continue;
    if (session.activity_type === "lesson") {
      const lesson = await allowedLesson(admin, user.id, profile as SecurityProfile, id);
      if (lesson) return Response.json({ item: { ...lesson, updatedAt: session.last_seen_at } }, { headers: noStore });
      continue;
    }

    const access = await guardResourceAccess(admin, user.id, profile as SecurityProfile, id, "view");
    if (!access.ok) continue;
    const { data: resourceRow } = await admin
      .from("lesson_resources")
      .select("lesson_id,lessons(id,title,published,chapters(id,title,courses(id,title)))")
      .eq("id", id)
      .maybeSingle();
    const resourceLesson = first((resourceRow as { lessons: LessonRelation } | null)?.lessons);
    const chapter = first(resourceLesson?.chapters);
    const course = first(chapter?.courses);
    if (!resourceRow || !resourceLesson || !chapter || !course) continue;
    return Response.json({ item: {
      lessonId: resourceRow.lesson_id,
      resourceId: access.resource.id,
      lessonTitle: resourceLesson.title,
      resourceTitle: access.resource.title,
      courseTitle: course.title,
      updatedAt: session.last_seen_at,
    } }, { headers: noStore });
  }
  return Response.json({ item: null }, { headers: noStore });
}
