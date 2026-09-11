export type UiRouteMode =
  | "optimized-content"
  | "optimized-chrome-only"
  | "protected";

const OPTIMIZED_CONTENT_ROUTES = new Set([
  "/",
  "/login",
  "/dashboard",
  "/courses",
  "/exam-history",
  "/progress",
  "/search",
  "/tkb",
  "/profile",
  "/forgot-password",
  "/reset-password",
  "/admin",
  "/admin/students",
  "/admin/content",
  "/admin/hls-vault",
  "/admin/sessions",
  "/admin/sessions/new",
  "/admin/timetable",
  "/admin/audit",
  "/admin/capabilities",
  "/admin/server-health",
  "/admin/upload",
  "/admin/enrollments",
  "/admin/security",
  "/admin/question-bank",
]);

const OPTIMIZED_CONTENT_PATTERNS = [
  /^\/courses\/[^/]+$/,
  /^\/lessons\/[^/]+$/,
  /^\/admin\/content\/courses\/[^/]+$/,
  /^\/admin\/question-bank\/[^/]+$/,
];

const OPTIMIZED_CHROME_PATTERNS = [
  /^\/exam-room(?:\/[^/]+)?$/,
];

function normalizePathname(value: string) {
  const pathOnly = (value || "/").split(/[?#]/, 1)[0] || "/";
  const withLeadingSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
}

export function classifyUiRoute(pathname: string): UiRouteMode {
  const normalizedPathname = normalizePathname(pathname);

  if (
    OPTIMIZED_CONTENT_ROUTES.has(normalizedPathname)
    || OPTIMIZED_CONTENT_PATTERNS.some(pattern => pattern.test(normalizedPathname))
  ) {
    return "optimized-content";
  }

  if (OPTIMIZED_CHROME_PATTERNS.some(pattern => pattern.test(normalizedPathname))) {
    return "optimized-chrome-only";
  }

  return "protected";
}
