/**
 * Display-only course grouping for the existing course title/description model.
 * These inferred labels must never grant enrollment or resource access.
 */
export const COURSE_CATEGORIES = [
  { id: "ALL", label: "Tất cả", shortLabel: "Tất cả" },
  { id: "TSA", label: "Đánh giá tư duy (TSA)", shortLabel: "TSA" },
  { id: "HSA", label: "Đánh giá năng lực (HSA)", shortLabel: "HSA" },
  { id: "THPT", label: "THPT Quốc gia", shortLabel: "THPT" },
  { id: "QDA", label: "Đánh giá năng lực (QDA)", shortLabel: "QDA" },
  { id: "BCA", label: "Đánh giá Bộ Công an (BCA)", shortLabel: "BCA" },
  { id: "VSAT", label: "Đánh giá đầu vào (V-SAT)", shortLabel: "V-SAT" },
] as const;

export type CourseCategoryId = typeof COURSE_CATEGORIES[number]["id"];
export type CourseCategoryFilter = CourseCategoryId | "DGNL";
export type CourseCatalogSort = "default" | "title-asc" | "title-desc";
type SpecificCourseCategory = Exclude<CourseCategoryId, "ALL">;
type CourseCatalogItem = { title: string; description?: string | null };
type CourseCategory = { id: CourseCategoryFilter; label: string; shortLabel: string };

const dgnlCategory: CourseCategory = {
  id: "DGNL",
  label: "Đánh giá năng lực (HSA · QDA · BCA)",
  shortLabel: "ĐGNL",
};

export function searchCourseText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").replace(/\s+/g, " ").trim();
}

const courseTitleCollator = new Intl.Collator("vi", { sensitivity: "base", numeric: true });

export function sortCourseCatalog<T extends CourseCatalogItem>(courses: readonly T[], sort: CourseCatalogSort): T[] {
  if (sort === "default") return [...courses];
  const direction = sort === "title-asc" ? 1 : -1;
  return [...courses].sort((left, right) => direction * courseTitleCollator.compare(left.title, right.title));
}

export function courseCategoryIds(course: CourseCatalogItem): SpecificCourseCategory[] {
  const words = ` ${searchCourseText(`${course.title} ${course.description ?? ""}`).replace(/[^a-z0-9]+/g, " ")} `;
  const categories: SpecificCourseCategory[] = [];
  const has = (value: string) => words.includes(` ${value} `);
  if (has("tsa") || has("tu duy")) categories.push("TSA");
  const hasQda = has("qda");
  const hasBca = has("bca") || has("bo cong an");
  // Preserve the existing generic DGNL fallback, but an explicit QDA/BCA
  // course is not an HSA course merely because its description says DGNL.
  if (has("hsa") || (!hasQda && !hasBca && (has("dgnl") || has("danh gia nang luc")))) categories.push("HSA");
  if (has("thpt") || has("thptqg") || has("tot nghiep pho thong")) categories.push("THPT");
  if (hasQda) categories.push("QDA");
  if (hasBca) categories.push("BCA");
  if (has("vsat") || has("v sat")) categories.push("VSAT");
  return categories;
}

function matchesCategoryIds(ids: readonly SpecificCourseCategory[], category: CourseCategoryFilter) {
  // Courses without an exam label remain shared, as in the existing catalogue.
  if (category === "ALL" || ids.length === 0) return true;
  if (category === "DGNL") return ids.some(id => id === "HSA" || id === "QDA" || id === "BCA");
  return ids.includes(category);
}

export function matchesCourseCategory(course: CourseCatalogItem, category: CourseCategoryFilter) {
  return matchesCategoryIds(courseCategoryIds(course), category);
}

export function courseCategoryCounts(courses: readonly CourseCatalogItem[]): Record<CourseCategoryFilter, number> {
  const counts: Record<CourseCategoryFilter, number> = { ALL: 0, TSA: 0, HSA: 0, THPT: 0, QDA: 0, BCA: 0, VSAT: 0, DGNL: 0 };
  for (const course of courses) {
    const ids = courseCategoryIds(course);
    for (const category of Object.keys(counts) as CourseCategoryFilter[]) {
      if (matchesCategoryIds(ids, category)) counts[category] += 1;
    }
  }
  return counts;
}

function parseCourseCategory(value: string | null): CourseCategoryFilter | null {
  if (!value) return null;
  const normalized = searchCourseText(value).replace(/[\s_-]/g, "").toUpperCase();
  if (normalized === "DGNL") return "DGNL";
  if (normalized === "THPTQG") return "THPT";
  return COURSE_CATEGORIES.find(category => category.id === normalized)?.id ?? null;
}

export function courseCategoryFromParams(params: { get(name: string): string | null }): CourseCategoryFilter {
  // Existing app URLs take priority. The other names are supplied frontend aliases.
  return parseCourseCategory(params.get("examType"))
    ?? parseCourseCategory(params.get("workspace"))
    ?? parseCourseCategory(params.get("category"))
    ?? "ALL";
}

export function courseCategoryParams(params: { toString(): string }, category: CourseCategoryFilter) {
  const next = new URLSearchParams(params.toString());
  next.delete("category");
  next.delete("workspace");
  if (category === "ALL") next.delete("examType");
  else next.set("examType", category);
  return next;
}

export function resetCourseCatalogParams(params: { toString(): string }) {
  const next = courseCategoryParams(params, "ALL");
  next.delete("q");
  next.delete("sort");
  return next;
}

export function courseCategoryLabel(category: CourseCategoryFilter) {
  return category === "DGNL" ? dgnlCategory.label : COURSE_CATEGORIES.find(item => item.id === category)!.label;
}

export function visibleCourseCategories(courses: readonly CourseCatalogItem[], selected: CourseCategoryFilter = "ALL"): CourseCategory[] {
  const available = new Set<CourseCategoryFilter>(["ALL", selected]);
  for (const course of courses) for (const category of courseCategoryIds(course)) available.add(category);
  const categories: CourseCategory[] = COURSE_CATEGORIES.filter(category => available.has(category.id));
  if (selected === "DGNL") categories.push(dgnlCategory);
  return categories;
}
