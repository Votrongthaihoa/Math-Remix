// Based on the supplied frontend's admin-dashboard/src/lib/download-csv.ts.
// Escape quotes AND spreadsheet formula prefixes before creating a local file.
export type CsvValue = string | number | null | undefined;

export function serializeCsv(rows: readonly (readonly CsvValue[])[]) {
  return "\ufeff" + rows.map(row => row.map(value => {
    let text = String(value ?? "");
    if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, rows: readonly (readonly CsvValue[])[]) {
  const blob = new Blob([serializeCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
