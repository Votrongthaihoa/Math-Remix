// Gathers the facts checkResourceAccess needs, then applies it. Every content
// route goes through here so the enrollment/published/allow_download rules
// cannot drift apart again.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkResourceAccess, type ResourceAccessMode } from "./resource-access";
import { activeAccount, type SecurityProfile } from "./security-server";

export type LessonResource = {
  id: string;
  title: string;
  resource_type: "youtube" | "external_pdf" | "storage_pdf";
  resource_url: string;
  allow_download: boolean;
};

type Relation<T> = T | T[] | null;

type ResourceRow = LessonResource & {
  lesson_id: string;
  lessons: Relation<{ published: boolean; chapters: Relation<{ course_id: string }> }>;
};

const noStore = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

function first<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function fail(message: string, status: number, code?: string) {
  return { ok: false as const, response: Response.json(code ? { error: message, code } : { error: message }, { status, headers: noStore }) };
}

export async function guardResourceAccess(
  admin: SupabaseClient,
  userId: string,
  profile: SecurityProfile,
  resourceId: string,
  mode: ResourceAccessMode,
): Promise<{ ok: true; resource: LessonResource } | { ok: false; response: Response }> {
  const { data } = await admin
    .from("lesson_resources")
    .select("id,title,resource_type,resource_url,allow_download,lesson_id,lessons(published,chapters(course_id))")
    .eq("id", resourceId)
    .single();
  const row = data as ResourceRow | null;
  if (!row) return fail("Không tìm thấy nội dung.", 404);

  const lesson = first(row.lessons);
  const courseId = first(lesson?.chapters ?? null)?.course_id ?? "";
  if (!courseId) return fail("Nội dung không thuộc khóa học hợp lệ.", 404);

  const isAdmin = profile.role === "admin";
  let enrolled = false;
  if (!isAdmin) {
    const { data: enrollment } = await admin
      .from("course_enrollments")
      .select("course_id")
      .eq("student_id", userId)
      .eq("course_id", courseId)
      .maybeSingle();
    enrolled = Boolean(enrollment);
  }

  const decision = checkResourceAccess({
    isAdmin,
    accountActive: activeAccount(profile),
    enrolled,
    lessonPublished: Boolean(lesson?.published),
    allowDownload: Boolean(row.allow_download),
    mode,
  });
  if (!decision.allowed) return fail(decision.message, decision.status, decision.reason);

  return {
    ok: true,
    resource: {
      id: row.id,
      title: row.title,
      resource_type: row.resource_type,
      resource_url: row.resource_url,
      allow_download: row.allow_download,
    },
  };
}
