export type PublicMediaItem = { assetName: string; used: boolean; size: number; lastModified: string | null };
export type MediaUsage = "all" | "used" | "unused";
export type MediaSort = "default" | "name" | "newest" | "largest";
export function filterPublicMedia<T extends PublicMediaItem>(images: readonly T[], query: string, usage: MediaUsage, sort: MediaSort) {
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi");
  const term = normalize(query.trim());
  const filtered = images.filter(image => (!term || normalize(image.assetName).includes(term)) && (usage === "all" || image.used === (usage === "used")));
  if (sort === "name") filtered.sort((a, b) => a.assetName.localeCompare(b.assetName, "vi", { numeric: true }));
  if (sort === "newest") filtered.sort((a, b) => (Date.parse(b.lastModified ?? "") || 0) - (Date.parse(a.lastModified ?? "") || 0));
  if (sort === "largest") filtered.sort((a, b) => b.size - a.size);
  return filtered;
}
