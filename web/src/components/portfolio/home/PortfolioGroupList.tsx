
import { useMemo } from 'react';
import { Building2, ChevronDown, Cpu, Gauge, MessageSquare, Search, Sparkles } from 'lucide-react';
import PortfolioPropertyCard from '@/components/portfolio/PortfolioPropertyCard';
import { portfolioCardKey } from '@/components/portfolio/portfolioCardUtils';
import { EmptyState } from '@/components';
import { Skeleton } from '@/components/Skeleton';
import { usePortfolio } from '@/context/usePortfolio';
import { usePortfolioGroups } from '@/hooks/usePortfolioWidget';
import { format, strings } from '@/lib/strings';
import type { PortfolioGroup } from '@/types';
import { portfolioRootDomain } from './portfolioGroupUtils';

export interface PortfolioGroupListProps {
  filterQuery: string;
  collapsedGroups: Set<string>;
  pendingDeleteKey: string | null;
  deletingKey: string | null;
  openingCrawlId: number | null;
  onToggleCollapsed: (rootDomain: string) => void;
  onOpen: (group: PortfolioGroup) => void;
  onDeleteToggle: (cardKey: string) => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: (group: PortfolioGroup) => void;
}

export default function PortfolioGroupList({
  filterQuery,
  collapsedGroups,
  pendingDeleteKey,
  deletingKey,
  openingCrawlId,
  onToggleCollapsed,
  onOpen,
  onDeleteToggle,
  onDeleteCancel,
  onDeleteConfirm,
}: PortfolioGroupListProps) {
  const groupsStatus = usePortfolioGroups();
  const { groups } = usePortfolio();
  const vh = strings.views.home;
  const loading = groupsStatus === 'loading' || groupsStatus === 'idle';

  const filteredGroups = useMemo(() => {
    const q = filterQuery.toLowerCase().trim();
    if (!q) return groups;
    return groups.filter(
      (group) =>
        group.domainName.toLowerCase().includes(q) ||
        group.crawlUrl.toLowerCase().includes(q),
    );
  }, [groups, filterQuery]);

  const groupedPortfolio = useMemo(() => {
    const map = new Map<string, PortfolioGroup[]>();
    for (const group of filteredGroups) {
      const key = portfolioRootDomain(group);
      const items = map.get(key) ?? [];
      items.push(group);
      map.set(key, items);
    }
    return Array.from(map.entries())
      .map(([rootDomain, items]) => ({
        rootDomain,
        items: items.toSorted((a, b) => b.generatedAtMs - a.generatedAtMs),
      }))
      .toSorted((a, b) => (b.items[0]?.generatedAtMs ?? 0) - (a.items[0]?.generatedAtMs ?? 0));
  }, [filteredGroups]);

  if (loading) {
    return (
      <div className="w-full mt-7 space-y-3" role="status" aria-busy="true" aria-label={strings.app.loading}>
        <span className="sr-only">{strings.app.loading}</span>
        {[0, 1, 2].map((i) => (
          <section
            key={i}
            className="min-w-0 rounded-xl border border-default/80 bg-brand-900/20 px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          </section>
        ))}
      </div>
    );
  }

  if (filteredGroups.length > 0) {
    return (
      <div className="w-full mt-7 space-y-6">
        {groupedPortfolio.map(({ rootDomain, items }) => {
          const collapsed = collapsedGroups.has(rootDomain);
          return (
            <section
              key={rootDomain}
              className="animate-in min-w-0 rounded-xl border border-default/80 bg-brand-900/20"
            >
              <button
                type="button"
                onClick={() => onToggleCollapsed(rootDomain)}
                aria-expanded={!collapsed}
                aria-controls={`portfolio-group-${rootDomain}`}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-brand-900/35"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{rootDomain}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {format(vh.groupPropertyCount, { count: items.length })}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-180'}`}
                    aria-hidden
                  />
                </span>
              </button>
              {!collapsed ? (
                <div
                  id={`portfolio-group-${rootDomain}`}
                  className="flex gap-3 overflow-x-auto px-3 pb-3 items-stretch"
                >
                  {items.map((group) => {
                    const cardKey = portfolioCardKey(group);
                    return (
                      <PortfolioPropertyCard
                        key={cardKey}
                        liteGroup={group}
                        cardKey={cardKey}
                        fetchEnabled={!collapsed}
                        confirmOpen={pendingDeleteKey === cardKey}
                        isDeleting={deletingKey === cardKey}
                        isOpening={openingCrawlId === group.crawlRunId}
                        onOpen={() => { onOpen(group); }}
                        onDeleteToggle={() => onDeleteToggle(cardKey)}
                        onDeleteCancel={onDeleteCancel}
                        onDeleteConfirm={() => { onDeleteConfirm(group); }}
                      />
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    );
  }

  if (filterQuery) {
    return (
      <div className="mt-7">
        <EmptyState icon={Search} title={vh.noSearchResults} />
      </div>
    );
  }

  return (
    <div className="mt-7">
      <EmptyState
        aurora
        icon={Sparkles}
        title={vh.emptyTitle}
        description={vh.emptyBody}
        primaryAction={{ label: vh.emptyCta, href: '/pipeline' }}
        highlights={[
          { icon: Gauge, label: vh.emptyHighlightCrawl },
          { icon: Cpu, label: vh.emptyHighlightLighthouse },
          { icon: MessageSquare, label: vh.emptyHighlightAi },
        ]}
      />
    </div>
  );
}
