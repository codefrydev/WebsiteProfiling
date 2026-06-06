import type { ReportLink } from '@/types';

function escapeCsv(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportLinksCsv(links: ReportLink[], filename = 'crawl_urls.csv'): void {
  if (!links.length) return;
  const hasCustomExtract = links.some((l) => l.custom_extract);
  const cols = [
    'url',
    'status',
    'title',
    'inlinks',
    'outlinks',
    'depth',
    'word_count',
    'response_time_ms',
    ...(hasCustomExtract ? ['custom_extract'] : []),
  ];
  const lines = [
    cols.join(','),
    ...links.map((l) =>
      cols
        .map((c) => escapeCsv((l as unknown as Record<string, unknown>)[c]))
        .join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
