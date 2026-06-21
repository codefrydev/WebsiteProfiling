/** CSV export from a QueryResult.table — no dependencies. */

export function tableToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

/** Trigger a client-side file download (browser only). */
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(name: string, rows: Record<string, unknown>[]): void {
  downloadText(`${sanitize(name)}.csv`, tableToCsv(rows));
}

export function sanitize(name: string): string {
  return (name || 'export').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 80);
}
