import { AECK_PUBLIC_ROUTES } from "../app/aeck-public-routes.ts";

const allowed = new Set<string>(["/", "/dashboard", "/courses", "/exam-history", "/progress", "/search", "/tkb", "/profile", ...AECK_PUBLIC_ROUTES.map(route => `/${route}`)]);

export function resolveStudentReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/dashboard";
  try {
    const url = new URL(value, "https://student.invalid");
    const decoded = decodeURIComponent(url.pathname);
    if (url.origin !== "https://student.invalid" || /[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith("//")) return "/dashboard";
    if (!allowed.has(decoded) && !/^\/(courses|lessons)\/[^/%?#]+$/.test(decoded)) return "/dashboard";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/dashboard";
  }
}
