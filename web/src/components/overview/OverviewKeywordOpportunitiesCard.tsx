'use client';

import Link from 'next/link';
import { Lightbulb, Zap, ChevronRight, Tag } from 'lucide-react';
import type { KeywordRow } from '@/types/components';
import type { ContentAnalyticsData, KeywordOpportunities, KeywordReportData } from '@/types/report';
import { strings, format } from '@/lib/strings';
import { viewIdToPathSlug } from '@/routes';
import { Card } from '@/components';
import { isJunkSemanticTerm } from '@/lib/semanticTextHygiene';
import {
  formatCrawlActionLabel,
  formatCrawlPagesSuffix,
  formatGscOpportunitySuffix,
  formatGscQuickWinSuffix,
  selectCrawlHighEmphasis,
  selectCrawlQuickWins,
  selectGscOpportunities,
  selectGscQuickWins,
  selectSiteTopKeywords,
  selectTopTopicClusters,
} from './overviewKeywordOpportunities';

interface OverviewKeywordOpportunitiesCardProps {
  keywords?: KeywordReportData;
  keywordOpportunities?: KeywordOpportunities;
  contentAnalytics?: ContentAnalyticsData;
  keywordsHref: string;
  hasGoogleConnected: boolean;
}

function KeywordListRow({ keyword, suffix }: { keyword: string; suffix: string }) {
  return (
    <li className="flex justify-between gap-2 text-sm bg-brand-900 border border-default rounded-lg px-3 py-2">
      <span className="text-foreground font-medium truncate min-w-0" title={keyword}>
        {keyword}
      </span>
      {suffix ? (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 text-right max-w-[45%]">
          {suffix}
        </span>
      ) : null}
    </li>
  );
}

export function OverviewKeywordOpportunitiesCard({
  keywords,
  keywordOpportunities,
  contentAnalytics,
  keywordsHref,
  hasGoogleConnected,
}: OverviewKeywordOpportunitiesCardProps) {
  const vo = strings.views.overview;
  const ke = strings.views.keywordsExplorer;
  const sj = strings.common;

  const kwRows: KeywordRow[] = Array.isArray(keywords?.rows) ? keywords.rows : [];
  const gscKeywordCount = keywords?.gsc_keyword_count ?? 0;
  const hasGscEnrichment = gscKeywordCount > 0;

  const gscQuickWins = selectGscQuickWins(kwRows);
  const gscOpportunities = selectGscOpportunities(kwRows);
  const crawlQuickWins = selectCrawlQuickWins(keywordOpportunities?.quick_wins);
  const crawlHighValue = selectCrawlHighEmphasis(keywordOpportunities?.high_value);
  const topicClusters = selectTopTopicClusters(keywordOpportunities?.token_topic_clusters);
  const siteTopTerms = selectSiteTopKeywords(contentAnalytics?.top_keywords_site);

  const useGscMode = hasGscEnrichment && (gscQuickWins.length > 0 || gscOpportunities.length > 0);
  const showCrawlColumns = !useGscMode && (crawlQuickWins.length > 0 || crawlHighValue.length > 0);
  const showSiteTerms = !useGscMode && !showCrawlColumns && siteTopTerms.length > 0;
  const showCard = useGscMode || showCrawlColumns || showSiteTerms || topicClusters.length > 0;

  if (!showCard) return null;

  const quickWinsHref = `${keywordsHref}${keywordsHref.includes('?') ? '&' : '?'}tab=quickwins`;
  const opportunitiesHref = `${keywordsHref}${keywordsHref.includes('?') ? '&' : '?'}tab=opportunities`;

  return (
    <Card shadow className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Lightbulb className="h-5 w-5 text-yellow-700 dark:text-yellow-400 shrink-0" />
          <h2 className="text-lg font-bold text-bright">{vo.keywordOpportunities}</h2>
        </div>
        {kwRows.length > 0 ? (
          <Link
            href={keywordsHref}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"
          >
            {vo.viewKeywords}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground mb-4 max-w-3xl">
        {useGscMode ? vo.keywordOpportunitiesGscHint : vo.keywordOpportunitiesHint}
      </p>

      {!hasGscEnrichment && !hasGoogleConnected ? (
        <p className="text-xs text-muted-foreground mb-4 rounded-lg border border-default bg-brand-900/60 px-3 py-2">
          {ke.dataStatus.noGscDetail}
        </p>
      ) : null}

      {(useGscMode || showCrawlColumns || showSiteTerms) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {useGscMode ? (
            <>
              {gscQuickWins.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-500" aria-hidden />
                      {ke.overview.topQuickWins}
                    </h3>
                    <Link href={quickWinsHref} className="text-xs text-link hover:underline">
                      {ke.overview.viewAll}
                    </Link>
                  </div>
                  <ul className="space-y-2">
                    {gscQuickWins.map((row) => (
                      <KeywordListRow
                        key={`gsc-qw-${row.keyword}`}
                        keyword={String(row.keyword ?? '')}
                        suffix={formatGscQuickWinSuffix(row)}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
              {gscOpportunities.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-violet-400" aria-hidden />
                      {ke.overview.topOpportunities}
                    </h3>
                    <Link href={opportunitiesHref} className="text-xs text-link hover:underline">
                      {ke.overview.viewAll}
                    </Link>
                  </div>
                  <ul className="space-y-2">
                    {gscOpportunities.map((row) => (
                      <KeywordListRow
                        key={`gsc-opp-${row.keyword}`}
                        keyword={String(row.keyword ?? '')}
                        suffix={formatGscOpportunitySuffix(row)}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : showSiteTerms ? (
            <div className="lg:col-span-2">
              <h3 className="text-sm font-semibold text-foreground mb-2">{vo.siteTopTerms}</h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {siteTopTerms.map((term) => (
                  <KeywordListRow
                    key={`site-term-${term.keyword}`}
                    keyword={term.keyword}
                    suffix={format(vo.siteTermMentions, { n: term.count.toLocaleString() })}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <>
              {crawlQuickWins.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">{vo.quickWinsEase}</h3>
                  <ul className="space-y-2">
                    {crawlQuickWins.map((k, idx) => (
                      <KeywordListRow
                        key={`crawl-qw-${k.keyword}-${idx}`}
                        keyword={String(k.keyword ?? '')}
                        suffix={formatCrawlActionLabel(k.recommended_action, vo.crawlActionLabels)}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
              {crawlHighValue.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">{vo.highEmphasis}</h3>
                  <ul className="space-y-2">
                    {crawlHighValue.map((k, idx) => (
                      <KeywordListRow
                        key={`crawl-hv-${k.keyword}-${idx}`}
                        keyword={String(k.keyword ?? '')}
                        suffix={
                          formatCrawlPagesSuffix(k, (n) => format(vo.onPagesCount, { n })) || sj.emDash
                        }
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {topicClusters.length > 0 ? (
        <div className={useGscMode || showCrawlColumns || showSiteTerms ? 'mt-6 pt-6 border-t border-default' : ''}>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Tag className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden />
            {vo.topThemes}
          </h3>
          <ul className="space-y-2">
            {topicClusters.map((cl, idx) => {
              const label = String(cl.top_keyword ?? cl.representative ?? '');
              const related = Array.isArray(cl.keywords)
                ? cl.keywords.filter((kw) => !isJunkSemanticTerm(String(kw))).slice(0, 4).join(', ')
                : '';
              return (
                <li
                  key={`theme-${label}-${idx}`}
                  className="text-sm bg-brand-900 border border-default rounded-lg px-3 py-2"
                >
                  <div className="font-medium text-foreground truncate" title={label}>
                    {label}
                  </div>
                  {related ? (
                    <div className="text-xs text-muted-foreground truncate mt-0.5" title={related}>
                      {related}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

export function buildKeywordsHref(searchParams: string): string {
  const base = `/${viewIdToPathSlug('keywords-explorer')}`;
  return searchParams ? `${base}?${searchParams}` : base;
}
