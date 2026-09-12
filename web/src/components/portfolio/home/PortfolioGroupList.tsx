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
  statusFilter?: string;
  sortBy?: string;
  collapsedGroups: Set<string>;
  pendingDeleteKey: string | null;
  deletingKey: string | null;
  openingCrawlId: number | null;
  onToggleCollapsed: (rootDomain: string) => void;
  onOpen: (group: PortfolioGroup) => void;
  onDeleteToggle: (cardKey: string) => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: (group: PortfolioGroup) => void;
  onClearFilters?: () => void;
}

export default function PortfolioGroupList({
  filterQuery,
  statusFilter = 'all',
  sortBy = 'recent',
  collapsedGroups,
  pendingDeleteKey,
  deletingKey,
  openingCrawlId,
  onToggleCollapsed,
  onOpen,
  onDeleteToggle,
  onDeleteCancel,
  onDeleteConfirm,
  onClearFilters,
}: PortfolioGroupListProps) {
  const groupsStatus = usePortfolioGroups();
  const { groups } = usePortfolio();
  const vh = strings.views.home;
  const loading = groupsStatus === 'loading' || groupsStatus === 'idle';

  const filteredGroups = useMemo(() => {
    const q = filterQuery.toLowerCase().trim();
    let res = groups;

    // Search filter
    if (q) {
      res = res.filter(
        (group) =>
          group.domainName.toLowerCase().includes(q) ||
          group.crawlUrl.toLowerCase().includes(q),
      );
    }

    // Status filter
    if (statusFilter === 'attention') {
      res = res.filter(
        (g) => g.healthScore < 70 || (g.issueCounts?.critical || 0) > 0,
      );
    } else if (statusFilter === 'healthy') {
      res = res.filter((g) => g.healthScore >= 75 && !g.crawlOnly);
    } else if (statusFilter === 'crawl_only') {
      res = res.filter((g) => g.crawlOnly);
    }

    // Sort order
    return res.toSorted((a, b) => {
      switch (sortBy) {
        case 'health_desc':
          return b.healthScore - a.healthScore;
        case 'health_asc':
          return a.healthScore - b.healthScore;
        case 'urls':
          return b.urlCount - a.urlCount;
        case 'name':
          return a.domainName.localeCompare(b.domainName);
        case 'recent':
        default:
          return b.generatedAtMs - a.generatedAtMs;
      }
    });
  }, [groups, filterQuery, statusFilter, sortBy]);

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
        items,
      }))
      .toSorted((a, b) => (b.items[0]?.generatedAtMs ?? 0) - (a.items[0]?.generatedAtMs ?? 0));
  }, [filteredGroups]);

  if (loading) {
    return (
      <div className="w-full mt-8 space-y-5" role="status" aria-busy="true" aria-label={strings.app.loading}>
        <span className="sr-only">{strings.app.loading}</span>
        {[0, 1].map((i) => (
          <section
            key={i}
            className="min-w-0 rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/20 p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-md-sys-surface-container-high" />
                <Skeleton className="h-5 w-36 rounded-full" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
              {[0, 1].map((j) => (
                <div key={j} className="h-64 rounded-2xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container p-5 space-y-3">
                  <div className="flex justify-between">
                    <Skeleton className="h-6 w-32 rounded-full" />
                    <Skeleton className="h-6 w-12 rounded-full" />
                  </div>
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-10 w-full rounded-full" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  if (filteredGroups.length > 0) {
    return (
      <div className="w-full mt-8 space-y-6">
        {groupedPortfolio.map(({ rootDomain, items }) => {
          const collapsed = collapsedGroups.has(rootDomain);
          return (
            <section
              key={rootDomain}
              className="animate-in min-w-0 rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/25 overflow-hidden transition-all duration-200"
            >
              <button
                type="button"
                onClick={() => onToggleCollapsed(rootDomain)}
                aria-expanded={!collapsed}
                aria-controls={`portfolio-group-${rootDomain}`}
                className="press flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-md-sys-surface-container-high/40"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-md-sys-primary-container/30 text-md-sys-primary">
                    <Building2 className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="truncate text-base font-bold text-md-sys-on-surface">{rootDomain}</span>
                  <span className="rounded-full bg-md-sys-surface-container-high px-2.5 py-0.5 text-xs font-semibold text-md-sys-on-surface-variant tabular-nums">
                    {format(vh.groupPropertyCount, { count: items.length })}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-md-sys-on-surface-variant font-medium">
                    {collapsed ? 'Expand' : 'Collapse'}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-md-sys-on-surface-variant transition-transform duration-200 ${
                      collapsed ? '' : 'rotate-180'
                    }`}
                    aria-hidden
                  />
                </div>
              </button>

              {!collapsed ? (
                <div
                  id={`portfolio-group-${rootDomain}`}
                  className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5 p-5 border-t border-md-sys-outline-variant/30 items-stretch"
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

  if (filterQuery || statusFilter !== 'all') {
    return (
      <div className="mt-8">
        <EmptyState
          icon={Search}
          title={vh.noSearchResults}
          description="No portfolio properties match the active search and filter criteria."
          secondaryAction={
            onClearFilters
              ? {
                  label: 'Clear all filters',
                  onClick: onClearFilters,
                }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="mt-8">
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
