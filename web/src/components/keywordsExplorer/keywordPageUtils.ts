import type { KeywordRow } from '@/types/components';

export type PageAggregate = {
  url: string;
  path: string;
  impressions: number;
  clicks: number;
  keywords: number;
};

export type PageSortKey = 'impressions' | 'keywords' | 'path';

/** Group GSC keyword rows by landing page URL. */
export function aggregatePagesFromRows(rows: KeywordRow[]): PageAggregate[] {
  const map: Record<string, PageAggregate> = {};
  for (const r of rows) {
    const url = (r.gsc_url || '').trim();
    if (!url) continue;
    if (!map[url]) {
      let path = '/';
      try {
        path = new URL(url).pathname || '/';
      } catch {
        path = url.replace(/^https?:\/\/[^/]+/, '') || '/';
      }
      map[url] = { url, path, impressions: 0, clicks: 0, keywords: 0 };
    }
    map[url].impressions += Number(r.gsc_impressions) || 0;
    map[url].clicks += Number(r.gsc_clicks) || 0;
    map[url].keywords += 1;
  }
  return Object.values(map);
}

export function sortPages(pages: PageAggregate[], sort: PageSortKey): PageAggregate[] {
  const copy = [...pages];
  if (sort === 'path') {
    return copy.sort((a, b) => a.path.localeCompare(b.path));
  }
  if (sort === 'keywords') {
    return copy.sort((a, b) => b.keywords - a.keywords || b.impressions - a.impressions);
  }
  return copy.sort((a, b) => b.impressions - a.impressions || b.keywords - a.keywords);
}

export function filterPages(pages: PageAggregate[], query: string): PageAggregate[] {
  const q = query.trim().toLowerCase();
  if (!q) return pages;
  return pages.filter((p) => p.url.toLowerCase().includes(q) || p.path.toLowerCase().includes(q));
}
