'use client';

import type { CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { healthScoreClass, portfolioCardKey } from '@/components/portfolio/portfolioCardUtils';
import { usePortfolio } from '@/context/usePortfolio';
import { usePortfolioGroups } from '@/hooks/usePortfolioWidget';
import { format, strings } from '@/lib/strings';
import type { PortfolioGroup } from '@/types';

export interface PortfolioResumeSectionProps {
  filterQuery: string;
  onOpen: (group: PortfolioGroup) => void;
  openingCrawlId: number | null;
}

export default function PortfolioResumeSection({
  filterQuery,
  onOpen,
  openingCrawlId,
}: PortfolioResumeSectionProps) {
  const groupsStatus = usePortfolioGroups();
  const { groups } = usePortfolio();
  const vh = strings.views.home;
  const loading = groupsStatus === 'loading' || groupsStatus === 'idle';

  const recentAudits = groups.toSorted((a, b) => b.generatedAtMs - a.generatedAtMs).slice(0, 4);
  const showResume = !filterQuery && !loading && recentAudits.length > 1;

  if (!showResume) return null;

  return (
    <section className="animate-in mt-7">
      <h2 className="mb-2.5 text-sm font-semibold text-foreground">{vh.resumeHeading}</h2>
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        {recentAudits.map((group, i) => {
          const opening = openingCrawlId != null && openingCrawlId === group.crawlRunId;
          return (
            <button
              key={portfolioCardKey(group)}
              type="button"
              onClick={() => { onOpen(group); }}
              disabled={opening}
              style={{ '--i': i } as CSSProperties}
              className="press hover-lift group min-w-0 rounded-xl border border-default bg-brand-800/60 p-3 text-left transition-colors hover:border-blue-500/30 disabled:opacity-60"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-link">
                  <Building2 className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="truncate text-sm font-semibold text-foreground">
                  {group.domainName}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="tabular-nums">{format(vh.viewUrlsCta, { count: group.urlCount })}</span>
                {!group.crawlOnly ? (
                  <span className={`font-bold tabular-nums ${healthScoreClass(group.healthScore)}`}>
                    {group.healthScore}
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wide">{vh.crawlOnlyBadge}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
