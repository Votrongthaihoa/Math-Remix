import type { PlatformRecord, PlatformRecordStatus } from "@aeck/contracts";

export type CollectionFilters = {
  query: string;
  status: PlatformRecordStatus | "all";
  category: string | "all";
};

export function normalizedSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi-VN");
}

export function filterCollectionRecords(
  records: PlatformRecord[],
  filters: CollectionFilters,
) {
  const query = normalizedSearchText(filters.query.trim());
  return records.filter((record) => {
    if (filters.status !== "all" && record.status !== filters.status) return false;
    if (filters.category !== "all" && record.category !== filters.category) return false;
    if (!query) return true;
    return normalizedSearchText([
      record.title,
      record.description,
      record.category,
      record.owner,
      ...record.tags,
    ].join(" ")).includes(query);
  });
}

export function categoriesForRecords(records: PlatformRecord[]) {
  return Array.from(new Set(records.map((record) => record.category).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, "vi"));
}
