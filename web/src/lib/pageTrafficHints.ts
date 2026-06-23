import type { LinkDetail } from '@/types/report';
import type { CompareMetricRow } from '@/lib/reportCompare';
import type { PageGa4Slice, PageGscSlice } from '@/lib/pageGoogleData';

export type PageHintCategory = 'search' | 'analytics' | 'onpage' | 'retention' | 'compare';

export interface PageTrafficHint {
  severity: 'high' | 'medium' | 'low';
  category: PageHintCategory;
  message: string;
  action?: string;
}

export interface PageTrafficHintsInput {
  link: LinkDetail;
  gsc: PageGscSlice | null;
  ga4: PageGa4Slice | null;
  coverage?: { inCrawl?: boolean; inGsc?: boolean; inGa4?: boolean };
  siteBenchmarks?: {
    gsc?: { ctr?: number; position?: number };
    ga4?: { engagementRate?: number };
  };
  keywordCount?: number;
  cannibalisationCount?: number;
  compare?: CompareMetricRow[];
  dataSource?: 'snapshot' | 'live';
}

export function buildPageTrafficHints(input: PageTrafficHintsInput): PageTrafficHint[] {
  const hints: PageTrafficHint[] = [];
  const { link, gsc, ga4, coverage, siteBenchmarks, compare } = input;

  if (gsc && (gsc.impressions ?? 0) >= 50 && (gsc.ctr ?? 0) < 3) {
    hints.push({
      severity: 'high',
      category: 'search',
      message: 'Strong impressions but low CTR — searchers see the page but rarely click.',
      action: 'Rewrite title and meta description to match intent and add a clear value proposition.',
    });
  }

  const pos = gsc?.position ?? 0;
  if (gsc && (gsc.impressions ?? 0) >= 30 && pos >= 4 && pos <= 15) {
    hints.push({
      severity: 'medium',
      category: 'search',
      message: `Ranking around position ${pos} — close to page-one with room to grow.`,
      action: 'Expand content depth, improve internal links, and target supporting queries.',
    });
  }

  const siteEng = siteBenchmarks?.ga4?.engagementRate;
  if (
    ga4 &&
    (ga4.sessions ?? 0) >= 10 &&
    siteEng != null &&
    (ga4.engagementRate ?? 0) < siteEng * 0.85
  ) {
    hints.push({
      severity: 'high',
      category: 'retention',
      message: 'Engagement rate is below your site average for pages with traffic.',
      action: 'Add clear next steps, scannable structure, and media above the fold to keep users on site.',
    });
  }

  if (ga4 && (ga4.sessions ?? 0) >= 20 && (ga4.avgSessionDuration ?? 0) < 30) {
    hints.push({
      severity: 'medium',
      category: 'retention',
      message: 'Short average session duration on a page with meaningful traffic.',
      action: 'Lead with the answer immediately; reduce friction and distractions in the first screen.',
    });
  }

  if (coverage?.inGsc && !coverage?.inCrawl) {
    hints.push({
      severity: 'medium',
      category: 'search',
      message: 'Page appears in Search Console but was not in your last crawl.',
      action: 'Include this URL in crawl scope or verify it is linked internally.',
    });
  }

  if ((input.cannibalisationCount ?? 0) > 0) {
    hints.push({
      severity: 'high',
      category: 'search',
      message: `Keyword cannibalisation detected across ${input.cannibalisationCount} cluster(s).`,
      action: 'Consolidate competing URLs or differentiate intent with canonicals and internal links.',
    });
  }

  if (!link.title?.trim()) {
    hints.push({
      severity: 'high',
      category: 'onpage',
      message: 'Missing page title.',
      action: 'Add a unique, descriptive title tag (roughly 50–60 characters).',
    });
  }

  if (!link.meta_description?.trim() && !(link.meta_description_len && link.meta_description_len > 0)) {
    hints.push({
      severity: 'medium',
      category: 'onpage',
      message: 'Missing meta description.',
      action: 'Add a compelling meta description to improve CTR from search.',
    });
  }

  if ((link.word_count ?? 0) > 0 && (link.word_count ?? 0) < 300) {
    hints.push({
      severity: 'medium',
      category: 'onpage',
      message: 'Thin content relative to typical ranking pages.',
      action: 'Add substantive sections that answer related questions users may have.',
    });
  }

  for (const row of compare ?? []) {
    if (row.id === 'gsc_impr' && row.delta != null && row.delta > 0 && row.current != null) {
      const ctrRow = compare?.find((r) => r.id === 'gsc_ctr');
      if (ctrRow?.delta != null && ctrRow.delta <= 0) {
        hints.push({
          severity: 'high',
          category: 'compare',
          message: 'Impressions increased but CTR did not improve.',
          action: 'Test new titles/snippets — visibility grew without earning more clicks.',
        });
      }
    }
    if (row.id === 'ga4_sessions' && row.delta != null && row.delta > 0) {
      const eng = compare?.find((r) => r.id === 'ga4_engagement');
      if (eng?.delta != null && eng.delta <= 0) {
        hints.push({
          severity: 'medium',
          category: 'compare',
          message: 'Sessions grew while engagement rate slipped vs the prior period.',
          action: 'Align landing content with traffic sources; improve on-page hooks for new visitors.',
        });
      }
    }
    if (row.deltaPct != null && row.id === 'gsc_pos' && row.delta != null && row.delta > 1) {
      hints.push({
        severity: 'medium',
        category: 'compare',
        message: 'Average search position worsened vs the comparison period.',
        action: 'Review recent content changes and competitor movement for top queries.',
      });
    }
  }

  if (input.dataSource === 'live') {
    hints.unshift({
      severity: 'low',
      category: 'search',
      message: 'Metrics below are from a live Google API fetch for this URL.',
    });
  }

  return hints;
}
