import { Building2, ChevronDown, Search } from 'lucide-react';
import { useMemo, useState, useEffect, useCallback } from 'react';
import AppLogo from '@/components/AppLogo';
import { PageLayout, Card, LabelWithHint } from '../components';
import PortfolioPropertyCard from '@/components/portfolio/PortfolioPropertyCard';
import { healthScoreClass, portfolioCardKey } from '@/components/portfolio/portfolioCardUtils';
import { Skeleton, SkeletonDomainCard } from '../components/Skeleton';
import { useReport } from '../context/useReport';
import { format, strings } from '../lib/strings';
import { extractHostname } from '@/lib/domainSlug';
import { apiUrl, reportApi } from '../lib/publicBase';
import {
  parsePortfolioAuditHistory,
  type PortfolioAuditHistoryPoint,
} from '@/lib/portfolioAuditHistory';
import type { PortfolioCrawlHistoryPoint } from '@/types/api';
import type { PortfolioGroup, ViewProps } from '@/types';

function portfolioRootDomain(group: PortfolioGroup): string {
  const host = extractHostname(group.crawlUrl) || group.domainName.trim().toLowerCase();
  if (!host) return group.domainName || 'unknown';
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

export default function Home({ onNavigate }: ViewProps) {
  const { reportList, crawlRuns, loadCrawlPreview, refreshReports } = useReport();
  const vh = strings.views.home;
  const sj = strings.common;
  const [filterQuery, setFilterQuery] = useState('');
  const [domainGroups, setDomainGroups] = useState<PortfolioGroup[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [openingCrawlId, setOpeningCrawlId] = useState<number | null>(null);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [auditHistoryByDomain, setAuditHistoryByDomain] = useState<
    Record<string, PortfolioAuditHistoryPoint[]>
  >({});
  const [crawlHistoryByDomain, setCrawlHistoryByDomain] = useState<
    Record<string, PortfolioCrawlHistoryPoint[]>
  >({});
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  const toggleGroupCollapsed = useCallback((rootDomain: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(rootDomain)) next.delete(rootDomain);
      else next.add(rootDomain);
      return next;
    });
  }, []);

  const openSite = useCallback(async (group: PortfolioGroup) => {
    if (group.crawlOnly && group.crawlRunId != null) {
      setOpeningCrawlId(group.crawlRunId);
      const ok = await loadCrawlPreview(group.crawlRunId);
      setOpeningCrawlId(null);
      if (ok) {
        onNavigate?.('links', { domain: group.domainParam });
      }
      return;
    }
    onNavigate?.('overview', {
      domain: group.domainParam,
      reportId: group.reportId ?? undefined,
    });
  }, [loadCrawlPreview, onNavigate]);

  const handleDeletePortfolioItem = useCallback(
    async (group: PortfolioGroup) => {
      const key = portfolioCardKey(group);
      setDeletingKey(key);
      setDeleteError(null);
      try {
        const res = await fetch(apiUrl('/portfolio/delete'), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId: group.reportId,
            crawlRunId: group.crawlRunId ?? null,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setDeleteError(data.error || vh.deleteFailed);
          return;
        }
        setPendingDeleteKey(null);
        setDomainGroups((prev) => prev.filter((g) => portfolioCardKey(g) !== key));
        await refreshReports();
      } catch {
        setDeleteError(vh.deleteFailed);
      } finally {
        setDeletingKey(null);
      }
    },
    [refreshReports, vh.deleteFailed],
  );

  useEffect(() => {
    if (!reportList.length && !crawlRuns.length) {
      setDomainGroups([]);
      setCrawlHistoryByDomain({});
      setPortfolioLoading(false);
      return;
    }
    let cancelled = false;
    setPortfolioLoading(true);
    const ids = reportList.map((r) => r.id).join(',');
    const qs = ids ? `?ids=${encodeURIComponent(ids)}` : '';
    fetch(reportApi(`/portfolio${qs}`))
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        setDomainGroups(Array.isArray(body.groups) ? body.groups : []);
        const crawlHistory = body.crawlHistoryByDomain;
        setCrawlHistoryByDomain(
          crawlHistory && typeof crawlHistory === 'object' ? crawlHistory : {},
        );
      })
      .catch(() => {
        if (!cancelled) {
          setDomainGroups([]);
          setCrawlHistoryByDomain({});
        }
      })
      .finally(() => {
        if (!cancelled) setPortfolioLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportList, crawlRuns]);

  useEffect(() => {
    if (!domainGroups.length) {
      setAuditHistoryByDomain({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      domainGroups
        .filter((g) => !g.crawlOnly && g.domainParam)
        .map(async (g) => {
          try {
            const res = await fetch(
              apiUrl(`/report/history?domain=${encodeURIComponent(g.domainParam)}&limit=8`),
            );
            const body = await res.json();
            const points = parsePortfolioAuditHistory(body.history || []);
            return [g.domainParam, points] as [string, PortfolioAuditHistoryPoint[]];
          } catch {
            return [g.domainParam, [] as PortfolioAuditHistoryPoint[]] as [
              string,
              PortfolioAuditHistoryPoint[],
            ];
          }
        }),
    ).then((entries) => {
      if (cancelled) return;
      const map: Record<string, PortfolioAuditHistoryPoint[]> = {};
      for (const [domain, points] of entries) {
        if (points.length) map[domain] = points;
      }
      setAuditHistoryByDomain(map);
    });
    return () => {
      cancelled = true;
    };
  }, [domainGroups]);

  const portfolioTotals = useMemo(() => {
    const totalBrands = domainGroups.length;
    const totalUrls = domainGroups.reduce((sum, g) => sum + g.urlCount, 0);
    const avgHealth = totalBrands
      ? Math.round(domainGroups.reduce((sum, g) => sum + g.healthScore, 0) / totalBrands)
      : null;
    return { totalBrands, totalUrls, avgHealth };
  }, [domainGroups]);

  const filteredGroups = useMemo(() => {
    const q = filterQuery.toLowerCase().trim();
    if (!q) return domainGroups;
    return domainGroups.filter((group) => (
      group.domainName.toLowerCase().includes(q) ||
      group.crawlUrl.toLowerCase().includes(q)
    ));
  }, [domainGroups, filterQuery]);

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

  const emptyMessage = filterQuery ? vh.noSearchResults : vh.empty;

  return (
    <PageLayout className="pt-2 sm:pt-3 relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-28 -left-20 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute top-16 right-0 h-80 w-80 rounded-full bg-violet-500/12 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-900/15 via-transparent to-brand-900/20" />
      </div>

      <div className="min-h-[42vh] flex items-center justify-center">
        <div className="max-w-2xl mx-auto text-center w-full">
          <div className="mb-3 flex justify-center">
            <AppLogo size={40} className="opacity-90" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{vh.title}</h1>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">{vh.subtitle}</p>

          <div className="mt-2.5 relative">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={vh.searchPlaceholder}
              className="w-full rounded-full border border-default bg-brand-900/30 px-9 py-2 text-xs sm:text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="grid grid-cols-3 gap-1.5 mt-2.5">
            <div className="rounded-md border border-default bg-brand-900/25 px-2 py-1.5">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">
                <LabelWithHint label={vh.totalBrandsLabel} helpKey="views.home.totalBrands" />
              </p>
              {portfolioLoading ? (
                <Skeleton className="h-5 w-10 mt-1" />
              ) : (
                <p className="text-sm sm:text-base font-bold text-foreground mt-0.5 tabular-nums">{portfolioTotals.totalBrands.toLocaleString()}</p>
              )}
            </div>
            <div className="rounded-md border border-default bg-brand-900/25 px-2 py-1.5">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">
                <LabelWithHint label={vh.totalUrlsLabel} helpKey="views.home.totalUrls" />
              </p>
              {portfolioLoading ? (
                <Skeleton className="h-5 w-14 mt-1" />
              ) : (
                <p className="text-sm sm:text-base font-bold text-foreground mt-0.5 tabular-nums">{portfolioTotals.totalUrls.toLocaleString()}</p>
              )}
            </div>
            <div className="rounded-md border border-default bg-brand-900/25 px-2 py-1.5">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">
                <LabelWithHint label={vh.avgHealthLabel} helpKey="views.home.avgHealth" />
              </p>
              {portfolioLoading ? (
                <Skeleton className="h-5 w-8 mt-1" />
              ) : (
                <p className={`text-sm sm:text-base font-bold mt-0.5 tabular-nums ${portfolioTotals.avgHealth != null ? healthScoreClass(portfolioTotals.avgHealth) : 'text-foreground'}`}>
                  {portfolioTotals.avgHealth ?? sj.emDash}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {deleteError ? (
        <p className="mt-2 text-center text-sm text-red-700 dark:text-red-400" role="alert">
          {deleteError}
        </p>
      ) : null}

      {portfolioLoading ? (
        <div className="w-full mt-4 space-y-6" role="status" aria-busy="true" aria-label={strings.app.loading}>
          <span className="sr-only">{strings.app.loading}</span>
          <div>
            <Skeleton className="mb-3 h-5 w-36" />
            <div className="flex gap-3 overflow-x-auto pb-1">
              <SkeletonDomainCard />
              <SkeletonDomainCard />
              <SkeletonDomainCard />
            </div>
          </div>
        </div>
      ) : filteredGroups.length > 0 ? (
        <div className="w-full mt-4 space-y-6">
          {groupedPortfolio.map(({ rootDomain, items }) => {
            const collapsed = collapsedGroups.has(rootDomain);
            return (
              <section key={rootDomain} className="min-w-0 rounded-xl border border-default/80 bg-brand-900/20">
                <button
                  type="button"
                  onClick={() => toggleGroupCollapsed(rootDomain)}
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
                          group={group}
                          cardKey={cardKey}
                          auditHistory={auditHistoryByDomain[group.domainParam] || []}
                          crawlHistory={crawlHistoryByDomain[group.domainParam] || []}
                          confirmOpen={pendingDeleteKey === cardKey}
                          isDeleting={deletingKey === cardKey}
                          isOpening={openingCrawlId === group.crawlRunId}
                          onOpen={() => { void openSite(group); }}
                          onDeleteToggle={() => {
                            setDeleteError(null);
                            setPendingDeleteKey(pendingDeleteKey === cardKey ? null : cardKey);
                          }}
                          onDeleteCancel={() => setPendingDeleteKey(null)}
                          onDeleteConfirm={() => { void handleDeletePortfolioItem(group); }}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : (
        <Card>
          <p className="text-muted-foreground">{emptyMessage}</p>
        </Card>
      )}
    </PageLayout>
  );
}
