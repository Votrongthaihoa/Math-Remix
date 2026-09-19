import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureActiveAccount, securityAdminClient } from "../../../../lib/security-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
};

export type ExamSectionRouteTarget = "test" | "confirm" | "result";

type RouteUser = {
  id: string;
  role: "student" | "admin";
};

type SectionRow = {
  id: string;
  exam_id: string;
};

class SectionRouteLookupError extends Error {
  constructor() {
    super("Exam section route lookup failed.");
    this.name = "SectionRouteLookupError";
  }
}

function errorResponse(message: string, status: number, code: string) {
  return Response.json({ error: message, code }, { status, headers: privateHeaders });
}

function validTarget(value: string | null): value is ExamSectionRouteTarget {
  return value === "test" || value === "confirm" || value === "result";
}

async function loadAccessibleSection(admin: SupabaseClient, user: RouteUser, sectionId: string) {
  const sectionResult = await admin
    .from("exam_sections")
    .select("id,exam_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (sectionResult.error) throw new SectionRouteLookupError();
  const section = sectionResult.data as SectionRow | null;
  if (!section?.exam_id || !UUID_PATTERN.test(section.id) || !UUID_PATTERN.test(section.exam_id)) return null;

  const examResult = await admin
    .from("exams")
    .select("id,room_id,published")
    .eq("id", section.exam_id)
    .maybeSingle();
  if (examResult.error) throw new SectionRouteLookupError();
  const exam = examResult.data as { id: string; room_id: string; published?: boolean | null } | null;
  if (!exam?.room_id) return null;

  const roomResult = await admin
    .from("exam_rooms")
    .select("id,published,access_mode")
    .eq("id", exam.room_id)
    .maybeSingle();
  if (roomResult.error) throw new SectionRouteLookupError();
  const room = roomResult.data as { id: string; published?: boolean | null; access_mode?: string | null } | null;
  if (!room) return null;

  if (user.role === "admin") return section;
  if (!exam.published || !room.published) return null;
  if (room.access_mode === "open") return section;

  const enrollmentResult = await admin
    .from("exam_room_enrollments")
    .select("room_id")
    .eq("room_id", room.id)
    .eq("student_id", user.id)
    .maybeSingle();
  if (enrollmentResult.error) throw new SectionRouteLookupError();
  return enrollmentResult.data ? section : null;
}

/**
 * Resolve legacy section-first URLs without exposing exam content. Access is
 * checked before an exam id is returned, and result attempts are always
 * restricted to the signed-in learner.
 */
export async function resolveExamSectionRoute(
  admin: SupabaseClient,
  user: RouteUser,
  sectionId: string,
  target: ExamSectionRouteTarget,
) {
  const section = await loadAccessibleSection(admin, user, sectionId);
  if (!section) return null;

  if (target === "result") {
    const attemptResult = await admin
      .from("exam_attempts")
      .select("id")
      .eq("student_id", user.id)
      .eq("section_id", section.id)
      .neq("status", "in_progress")
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (attemptResult.error) throw new SectionRouteLookupError();
    const attemptId = String(attemptResult.data?.id ?? "");
    return UUID_PATTERN.test(attemptId) ? `/exam/result/${attemptId}` : null;
  }

  const basePath = `/exam/${section.exam_id}/section/${section.id}`;
  return target === "confirm" ? `${basePath}/confirm` : basePath;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sectionId = params.get("sectionId")?.trim() ?? "";
  const target = params.get("target");
  if (!UUID_PATTERN.test(sectionId) || !validTarget(target)) {
    return errorResponse("Yêu cầu mở bài thi không hợp lệ.", 400, "INVALID_EXAM_ROUTE");
  }

  const admin = securityAdminClient();
  if (!admin) {
    return errorResponse("Chưa cấu hình máy chủ khảo thí.", 503, "EXAM_SERVICE_UNAVAILABLE");
  }
  const security = await ensureActiveAccount(request, admin);
  if (!security.ok) return security.response;

  try {
    const path = await resolveExamSectionRoute(admin, {
      id: security.user.id,
      role: security.profile.role === "admin" ? "admin" : "student",
    }, sectionId, target);
    if (!path) {
      return errorResponse("Không thể mở trang bài thi này.", 404, "EXAM_ROUTE_NOT_FOUND");
    }
    return Response.json({ path }, { headers: privateHeaders });
  } catch {
    return errorResponse("Không thể xác định trang bài thi lúc này.", 503, "EXAM_ROUTE_UNAVAILABLE");
  }
}
