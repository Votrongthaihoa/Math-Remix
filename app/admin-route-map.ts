export type AdminLegacyModule =
  | "users"
  | "groups"
  | "courses"
  | "media"
  | "exams"
  | "exam-rooms"
  | "results"
  | "irt"
  | "evidence"
  | "subscriptions"
  | "shipments"
  | "tkb"
  | "ilearn"
  | "admin-log"
  | "watermark"
  | "server-health"
  | "question-bank";

type AdminRouteEntry = {
  prefix: string;
  module: AdminLegacyModule;
};

// These are compatibility entry points for the route names used by the
// reference admin bundle. They deliberately point at the current product
// shell instead of pretending that a legacy-only backend is available.
export const LEGACY_ADMIN_ROUTES: readonly AdminRouteEntry[] = [
  { prefix: "/evidence-registration-management", module: "evidence" },
  { prefix: "/subscription-package-management", module: "subscriptions" },
  { prefix: "/group-user-management", module: "groups" },
  { prefix: "/exam-result-management", module: "results" },
  { prefix: "/irt-exam-management", module: "irt" },
  { prefix: "/course-management", module: "courses" },
  { prefix: "/media-management", module: "media" },
  { prefix: "/shipment-management", module: "shipments" },
  { prefix: "/tkb-management", module: "tkb" },
  { prefix: "/ilearn-management", module: "ilearn" },
  { prefix: "/watermark-trace", module: "watermark" },
  { prefix: "/server-health", module: "server-health" },
  { prefix: "/user-management", module: "users" },
  { prefix: "/exam-room-management", module: "exam-rooms" },
  { prefix: "/assessment-management", module: "exam-rooms" },
  { prefix: "/exam-management", module: "exams" },
  { prefix: "/question-bank", module: "question-bank" },
  { prefix: "/item/create", module: "question-bank" },
  { prefix: "/admin-log", module: "admin-log" },
];

function normalizePathname(value: string) {
  const pathOnly = (value || "/").split(/[?#]/, 1)[0] || "/";
  const withLeadingSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
}

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isAdminPortalPath(value: string) {
  const pathname = normalizePathname(value);
  return pathname === "/admin"
    || pathname.startsWith("/admin/")
    || LEGACY_ADMIN_ROUTES.some(route => matchesPrefix(pathname, route.prefix));
}

export function legacyAdminModuleFromPath(value: string): AdminLegacyModule | null {
  const pathname = normalizePathname(value);
  return LEGACY_ADMIN_ROUTES.find(route => matchesPrefix(pathname, route.prefix))?.module ?? null;
}

export function adminCourseIdFromPath(value: string) {
  const pathname = normalizePathname(value);
  const match = pathname.match(/^\/(?:admin\/content\/courses|course-management)\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export function isLegacyAdminPath(value: string) {
  const pathname = normalizePathname(value);
  return LEGACY_ADMIN_ROUTES.some(route => matchesPrefix(pathname, route.prefix));
}

export function legacyAdminRedirectPath(value: string) {
 const pathname = normalizePathname(value);
  if (matchesPrefix(pathname, "/admin/all")) return "/admin/capabilities";
 if (matchesPrefix(pathname, "/question-bank") || matchesPrefix(pathname, "/item/create")) return "/admin/question-bank";
  if (matchesPrefix(pathname, "/exam-management")) return "/admin/exams";
  if (matchesPrefix(pathname, "/assessment-management") || matchesPrefix(pathname, "/exam-room-management")) return "/admin/sessions";
  if (matchesPrefix(pathname, "/user-management")) return "/admin/students";
  if (matchesPrefix(pathname, "/group-user-management")) return "/admin/enrollments";
  if (pathname === "/course-management") return "/admin/content";
  const courseMatch = pathname.match(/^\/course-management\/([^/]+)$/);
  if (courseMatch?.[1]) return `/admin/content/courses/${encodeURIComponent(decodeURIComponent(courseMatch[1]))}`;
  if (matchesPrefix(pathname, "/media-management")) return "/admin/upload";
  if (matchesPrefix(pathname, "/exam-result-management")) return "/admin/sessions";
  if (matchesPrefix(pathname, "/tkb-management")) return "/admin/timetable";
  if (matchesPrefix(pathname, "/admin-log")) return "/admin/audit";
  if (matchesPrefix(pathname, "/server-health")) return "/admin/server-health";
  const legacyModule = legacyAdminModuleFromPath(pathname);
  return legacyModule ? `/admin/capabilities?module=${encodeURIComponent(legacyModule)}` : null;
}
