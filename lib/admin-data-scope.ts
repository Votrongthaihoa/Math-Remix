export type AdminDataDomain =
  | "profiles"
  | "courses"
  | "lessons"
  | "course-enrollments"
  | "exam-rooms"
  | "exam-room-enrollments"
  | "user-emails";

const EMPTY_SCOPE = Object.freeze([]) as readonly AdminDataDomain[];

/**
 * Limits the legacy Supabase-backed admin shell to data its active module
 * actually renders. This is client-side defence in depth; live RLS and the
 * permission-checked server routes remain the authorization boundary.
 */
export function adminDataScopeForTab(tab: string, isSuperAdmin: boolean): readonly AdminDataDomain[] {
  if (tab === "dashboard") {
    return isSuperAdmin
      ? ["profiles", "courses", "lessons", "course-enrollments", "exam-rooms", "exam-room-enrollments", "user-emails"]
      : EMPTY_SCOPE;
  }
  if (tab === "students") return ["profiles", "course-enrollments", "user-emails"];
  if (tab === "enrollments") return ["profiles", "courses", "course-enrollments", "exam-rooms", "exam-room-enrollments", "user-emails"];
  if (tab === "content") return ["courses", "lessons"];
  return EMPTY_SCOPE;
}
