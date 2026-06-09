import type { ReportLink } from '@/types';
import { collectCustomFieldKeys, parseLinkCustomFields } from '@/lib/customFields';

function escapeCsv(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportLinksCsv(links: ReportLink[], filename = 'crawl_urls.csv'): void {
  if (!links.length) return;
  const hasCustomExtract = links.some((l) => l.custom_extract);
  const customFieldKeys = collectCustomFieldKeys(links);
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
    ...customFieldKeys,
  ];
  const lines = [
    cols.join(','),
    ...links.map((l) => {
      const fields = parseLinkCustomFields(l);
      const row: Record<string, unknown> = { ...l, ...fields };
      return cols.map((c) => escapeCsv(row[c])).join(',');
    }),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
