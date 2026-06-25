// CSV building + download helpers, shared across export surfaces.

export type CsvCell = string | number | null | undefined;

/** Build an RFC-4180 CSV string: every field quoted, internal quotes doubled. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const quote = (v: CsvCell) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers, ...rows].map((row) => row.map(quote).join(",")).join("\n");
}

/** Trigger a browser download of `csv` as `filename`. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Defer revocation: some browsers (Firefox, iOS Safari) cancel the download
  // if the object URL is revoked synchronously before the click is processed.
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
