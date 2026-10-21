import { searchCourseText } from "../lib/course-catalog.ts";
import type { AdminCourseRow } from "./admin-types";

export type AdminCourseStatus = "all" | "published" | "draft";
export type AdminCourseSort = "order" | "newest" | "title";

type CatalogOptions = { query: string; status: AdminCourseStatus; sort: AdminCourseSort };

export function filterAndSortAdminCourses(courses: readonly AdminCourseRow[], { query, status, sort }: CatalogOptions): AdminCourseRow[] {
  const search = searchCourseText(query);
  const matching = courses.filter(course => {
    if (status === "published" && !course.published) return false;
    if (status === "draft" && course.published) return false;
    return !search || searchCourseText(`${course.title} ${course.description ?? ""}`).includes(search);
  });

  return matching.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title, "vi", { sensitivity: "base" }) || a.id.localeCompare(b.id);
    if (sort === "newest") return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || a.id.localeCompare(b.id);
    return a.sort_order - b.sort_order || (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || a.id.localeCompare(b.id);
  });
}
