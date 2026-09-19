// Gathers the facts checkResourceAccess needs, then applies it. Every content
// route goes through here so the enrollment/published/allow_download rules
// cannot drift apart again.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkResourceAccess, type ResourceAccessMode } from "./resource-access";
import { activeAccount, type SecurityProfile } from "./security-server";

export type LessonResource = {
  id: string;
  title: string;
  resource_type: "youtube" | "onedrive_video" | "hls_vault" | "external_pdf" | "storage_pdf";
  resource_url: string;
  allow_download: boolean;
  provider: "sharepoint" | "onedrive_business" | "onedrive_personal" | null;
  provider_drive_id: string | null;
  provider_item_id: string | null;
  provider_metadata: Record<string, unknown>;
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

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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
  const { data, error: resourceError } = await admin
    .from("lesson_resources")
    .select("id,title,resource_type,resource_url,allow_download,provider,provider_drive_id,provider_item_id,provider_metadata,lesson_id,lessons(published,chapters(course_id))")
    .eq("id", resourceId)
    .single();
  const row = data as ResourceRow | null;
  if (resourceError || !row || !record(row)) return fail("Không tìm thấy nội dung.", 404);

  const lesson = record(first(row.lessons));
  const chapter = record(first(lesson?.chapters as Relation<unknown> ?? null));
  const courseId = typeof chapter?.course_id === "string" ? chapter.course_id.trim() : "";
  if (!lesson || !courseId) return fail("Nội dung không thuộc khóa học hợp lệ.", 404);
  if (lesson.published !== undefined && typeof lesson.published !== "boolean") {
    return fail("Trạng thái bài học không hợp lệ.", 404);
  }
  if (typeof row.allow_download !== "boolean") return fail("Trạng thái tải nội dung không hợp lệ.", 404);

  const isAdmin = profile.role === "admin";
  let enrolled = false;
  if (!isAdmin) {
    const { data: enrollment, error: enrollmentError } = await admin
      .from("course_enrollments")
      .select("course_id")
      .eq("student_id", userId)
      .eq("course_id", courseId)
      .maybeSingle();
    enrolled = !enrollmentError && record(enrollment)?.course_id === courseId;
  }

  const decision = checkResourceAccess({
    isAdmin,
    accountActive: activeAccount(profile),
    enrolled,
    lessonPublished: lesson.published === true,
    allowDownload: row.allow_download,
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
      provider: row.provider,
      provider_drive_id: row.provider_drive_id,
      provider_item_id: row.provider_item_id,
      provider_metadata: row.provider_metadata,
    },
  };
}
