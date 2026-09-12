import type { CSSProperties } from 'react';
import { ArrowRight, Building2, Clock, Globe } from 'lucide-react';
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

function domainMonogram(domain: string): string {
  const clean = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
  return clean.slice(0, 2).toUpperCase();
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
    <section className="animate-in mt-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-md-sys-primary" aria-hidden />
          <h2 className="text-sm font-bold tracking-tight text-md-sys-on-surface">
            {vh.resumeHeading || 'Jump Back In'}
          </h2>
        </div>
        <span className="text-xs text-md-sys-on-surface-variant font-medium">Recent audits</span>
      </div>

      <div className="stagger grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {recentAudits.map((group, i) => {
          const opening = openingCrawlId != null && openingCrawlId === group.crawlRunId;
          return (
            <button
              key={portfolioCardKey(group)}
              type="button"
              onClick={() => { onOpen(group); }}
              disabled={opening}
              style={{ '--i': i } as CSSProperties}
              className="press group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-md-sys-primary/45 hover:shadow-[var(--elevation-2)] disabled:opacity-60"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-md-sys-primary-container/40 font-mono text-xs font-bold text-md-sys-primary shadow-xs">
                      {domainMonogram(group.domainName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-md-sys-on-surface group-hover:text-md-sys-primary transition-colors">
                        {group.domainName}
                      </p>
                      <p className="text-[11px] text-md-sys-on-surface-variant truncate">
                        {group.lastAudit || group.lastCrawl || format(vh.viewUrlsCta, { count: group.urlCount })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3.5 flex items-center justify-between border-t border-md-sys-outline-variant/30 pt-2.5 text-xs">
                <span className="text-xs text-md-sys-on-surface-variant tabular-nums">
                  {format(vh.viewUrlsCta, { count: group.urlCount })}
                </span>
                {!group.crawlOnly ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-md-sys-on-surface-variant font-medium">Health</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${healthScoreClass(
                        group.healthScore,
                      )}`}
                    >
                      {group.healthScore}
                    </span>
                  </div>
                ) : (
                  <span className="rounded-full bg-md-sys-surface-container-high px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-md-sys-on-surface-variant">
                    {vh.crawlOnlyBadge}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
