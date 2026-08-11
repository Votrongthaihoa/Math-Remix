export type HsaLatexPart = 1 | 2 | 3;

function normalizeSectionTitle(value: string): string {
  return value
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

/**
 * Resolve the HSA section that should be loaded into the LaTeX editor.
 * Keep this deliberately title-based because section titles are editable in
 * the admin workspace and the template is an authoring convenience only.
 */
export function hsaPartForSectionTitle(value: string | null | undefined): HsaLatexPart | null {
  const title = normalizeSectionTitle(String(value ?? "").trim());
  if (!title) return null;
  if (/toan|xu ly so lieu|dinh luong|phan\s*1\b/.test(title)) return 1;
  if (/van hoc|ngon ngu|phan\s*2\b/.test(title)) return 2;
  if (/khoa hoc|tieng anh|hsa-f|tu chon|phan\s*3\b/.test(title)) return 3;
  return null;
}

/**
 * Extract one `\phanN` block from the full HSA authoring fixture while
 * preserving the marker so the existing parser can keep the part metadata.
 */
export function extractHsaPartSource(source: string, part: HsaLatexPart): string {
  const markers = [...String(source ?? "").matchAll(/^\\phan\s*([123])\s*$/gim)]
    .map(match => ({ part: Number(match[1]) as HsaLatexPart, index: match.index ?? 0 }));
  const marker = markers.find(item => item.part === part);
  if (!marker) return "";
  const nextMarker = markers.find(item => item.index > marker.index);
  return source.slice(marker.index, nextMarker?.index ?? source.length).trim();
}
