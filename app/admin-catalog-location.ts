import type { AdminCourseSort, AdminCourseStatus } from "./admin-course-catalog";

export type AdminCatalogLocation = {
  q: string;
  status: AdminCourseStatus;
  sort: AdminCourseSort;
  view: "table" | "list";
  page: number;
};

export const ADMIN_CATALOG_PAGE_SIZE = 10;

export function readAdminCatalogLocation(params: Pick<URLSearchParams, "get">): AdminCatalogLocation {
  const status = params.get("status");
  const sort = params.get("sort");
  const page = Number(params.get("page") ?? 1);
  return {
    q: params.get("q") ?? "",
    status: status === "published" || status === "draft" ? status : "all",
    sort: sort === "title" || sort === "newest" ? sort : "order",
    view: params.get("view") === "list" ? "list" : "table",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function updateAdminCatalogLocation(search: string, patch: Partial<AdminCatalogLocation>) {
  const params = new URLSearchParams(search);
  const defaults: AdminCatalogLocation = { q: "", status: "all", sort: "order", view: "table", page: 1 };
  for (const key of Object.keys(patch) as (keyof AdminCatalogLocation)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === defaults[key]) params.delete(key);
    else params.set(key, String(value));
  }
  return params.toString();
}
