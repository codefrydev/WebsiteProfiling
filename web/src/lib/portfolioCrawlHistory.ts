import { extractHostname } from '@/lib/domainSlug';
import type { CrawlRunSummary } from '@/types/report';

export interface PortfolioCrawlHistoryPoint {
  pagesDiscovered: number;
  titleCoverage: number;
  avgWordCount: number;
  createdAtMs: number;
}

export function titleCoveragePct(withTitle: number, urlCount: number): number {
  if (urlCount <= 0) return 0;
  return Math.round((withTitle / urlCount) * 100);
}

export function crawlSummaryToHistoryPoint(row: CrawlRunSummary): PortfolioCrawlHistoryPoint {
  const pagesDiscovered = Number(row.url_count) || 0;
  return {
    pagesDiscovered,
    titleCoverage: titleCoveragePct(Number(row.with_title) || 0, pagesDiscovered),
    avgWordCount: Math.round(Number(row.avg_word_count) || 0),
    createdAtMs: Number(new Date(row.created_at || 0)),
  };
}

export function buildCrawlHistoryByDomain(
  summaries: CrawlRunSummary[],
): Record<string, PortfolioCrawlHistoryPoint[]> {
  const map = new Map<string, PortfolioCrawlHistoryPoint[]>();

  for (const row of summaries) {
    const key = extractHostname(row.start_url).toLowerCase();
    if (!key) continue;

    const list = map.get(key) ?? [];
    list.push(crawlSummaryToHistoryPoint(row));
    map.set(key, list);
  }

  const out: Record<string, PortfolioCrawlHistoryPoint[]> = {};
  for (const [key, list] of map) {
    out[key] = list
      .toSorted((a, b) => a.createdAtMs - b.createdAtMs)
      .slice(-8);
  }
  return out;
}

export function crawlHistorySeries(
  points: PortfolioCrawlHistoryPoint[],
  key: 'pagesDiscovered' | 'titleCoverage' | 'avgWordCount',
): number[] {
  return points
    .map((p) => p[key])
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}
