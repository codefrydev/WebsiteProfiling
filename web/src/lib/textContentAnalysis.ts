import type { LinkDetail, ReportLink } from '@/types';
import { parseKeywords, normaliseKw } from '@/utils/linkUtils';
import { filterSemanticTerms } from '@/lib/semanticTextHygiene';

export interface ByPageTextRow extends Record<string, unknown> {
  url: string;
  word_count: number;
  reading_level: number;
  top_terms: string;
  _search: string;
}

export function buildByPageTextRows(
  links: Array<ReportLink | LinkDetail> | undefined,
  searchQuery: string,
): ByPageTextRow[] {
  const q = (searchQuery || '').trim().toLowerCase();
  const rows: ByPageTextRow[] = [];

  for (const link of links ?? []) {
    const detail = link as LinkDetail;
    const status = String(link.status ?? '');
    if (status && !status.match(/^2\d{2}$/)) continue;

    const url = String(link.url ?? '').trim();
    if (!url) continue;

    const kws = filterSemanticTerms(
      parseKeywords(detail.top_keywords)
        .map(normaliseKw)
        .filter((k) => k.word),
    );
    const topTerms = kws
      .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0))
      .slice(0, 3)
      .map((k) => `${k.word} (${Number(k.count) || 0})`)
      .join(', ');

    const row: ByPageTextRow = {
      url,
      word_count: Number(link.word_count) || 0,
      reading_level: Number(detail.reading_level) || 0,
      top_terms: topTerms,
      _search: `${url} ${topTerms}`.toLowerCase(),
    };

    if (!q || row._search.includes(q)) {
      rows.push(row);
    }
  }

  return rows;
}
