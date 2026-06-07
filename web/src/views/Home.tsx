import { Building2, ChevronDown, ExternalLink, Globe, ArrowRight, Search, Trash2 } from 'lucide-react';
import { useMemo, useState, useEffect, useCallback } from 'react';
import AppLogo from '@/components/AppLogo';
import { PageLayout, Card } from '../components';
import HealthSparkline from '@/components/HealthSparkline';
import { Skeleton, SkeletonDomainCard } from '../components/Skeleton';
import { useReport } from '../context/useReport';
import { format, strings } from '../lib/strings';
import { extractHostname } from '@/lib/domainSlug';
import { apiUrl, reportApi } from '../lib/publicBase';
import type { PortfolioGroup, ReportCategory, ViewProps } from '@/types';

function scoreFromCategories(categories: ReportCategory[] = []): number | null {
  const numeric = (categories || [])
    .map((c) => Number(c?.score))
    .filter((n) => Number.isFinite(n));
  if (!numeric.length) return null;
  const avg = numeric.reduce((a, b) => a + b, 0) / numeric.length;
  return Math.round(avg);
}

function toLocalDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

function healthScoreClass(score: number): string {
  if (score >= 80) return 'text-emerald-700 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-700 dark:text-amber-400';
  return 'text-rose-700 dark:text-rose-400';
}

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
  const [healthHistoryByDomain, setHealthHistoryByDomain] = useState<Record<string, number[]>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  const toggleGroupCollapsed = useCallback((rootDomain: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(rootDomain)) next.delete(rootDomain);
      else next.add(rootDomain);
      return next;
    });
  }, []);

  const portfolioCardKey = (group: PortfolioGroup) =>
    `${group.domainParam}-${group.crawlOnly ? 'crawl' : 'report'}-${group.reportId ?? 'nr'}-${group.crawlRunId ?? 'nc'}-${group.generatedAtMs}`;

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
        if (!cancelled) setDomainGroups(Array.isArray(body.groups) ? body.groups : []);
      })
      .catch(() => {
        if (!cancelled) setDomainGroups([]);
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
      setHealthHistoryByDomain({});
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
            const scores = [...(body.history || [])]
              .map((row: { healthScore?: number | null }) => row.healthScore)
              .filter((n: unknown): n is number => typeof n === 'number' && Number.isFinite(n))
              .reverse();
            return [g.domainParam, scores] as [string, number[]];
          } catch {
            return [g.domainParam, [] as number[]] as [string, number[]];
          }
        }),
    ).then((entries) => {
      if (cancelled) return;
      const map: Record<string, number[]> = {};
      for (const [domain, scores] of entries) {
        if (scores.length) map[domain] = scores;
      }
      setHealthHistoryByDomain(map);
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

  const emptyMessage = filterQuery
    ? vh.noSearchResults
    : vh.empty;

  return (
    <PageLayout className="pt-2 sm:pt-3 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      >
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
            <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">{vh.totalBrandsLabel}</p>
            {portfolioLoading ? (
              <Skeleton className="h-5 w-10 mt-1" />
            ) : (
              <p className="text-sm sm:text-base font-bold text-foreground mt-0.5 tabular-nums">{portfolioTotals.totalBrands.toLocaleString()}</p>
            )}
          </div>
          <div className="rounded-md border border-default bg-brand-900/25 px-2 py-1.5">
            <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">{vh.totalUrlsLabel}</p>
            {portfolioLoading ? (
              <Skeleton className="h-5 w-14 mt-1" />
            ) : (
              <p className="text-sm sm:text-base font-bold text-foreground mt-0.5 tabular-nums">{portfolioTotals.totalUrls.toLocaleString()}</p>
            )}
          </div>
          <div className="rounded-md border border-default bg-brand-900/25 px-2 py-1.5">
            <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">{vh.avgHealthLabel}</p>
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
            const confirmOpen = pendingDeleteKey === cardKey;
            const isDeleting = deletingKey === cardKey;
            return (
            <div
              key={cardKey}
              className="relative min-w-[260px] max-w-[300px] shrink-0 text-left"
            >
              <Card
                shadow
                padding="none"
                className="group border-default/90 hover:border-blue-500/45 transition-all duration-200 h-full p-2"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      disabled={openingCrawlId === group.crawlRunId || isDeleting}
                      onClick={() => { void openSite(group); }}
                      className="min-w-0 flex-1 flex items-start justify-between gap-3 text-left rounded-md -m-1 p-1 hover:bg-brand-900/40 transition-colors disabled:opacity-60"
                    >
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Building2 className="h-3 w-3" />
                        {vh.brandLabel}
                      </p>
                      <h3 className="text-sm sm:text-[15px] font-semibold text-foreground truncate">{group.domainName}</h3>
                      {group.crawlOnly ? (
                        <span className="mt-0.5 inline-block rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                          {vh.crawlOnlyBadge}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.healthScoreLabel}</p>
                      <div className="flex items-center justify-end gap-1.5">
                        <HealthSparkline scores={healthHistoryByDomain[group.domainParam] || []} />
                        <p className={`text-base font-bold tabular-nums ${healthScoreClass(group.healthScore)}`}>{group.healthScore}</p>
                      </div>
                    </div>
                    </button>
                    <button
                      type="button"
                      title={vh.deleteProperty}
                      aria-label={vh.deleteProperty}
                      disabled={isDeleting}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteError(null);
                        setPendingDeleteKey(confirmOpen ? null : cardKey);
                      }}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-red-700 hover:bg-red-500/10 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {confirmOpen ? (
                    <div
                      className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 space-y-2"
                      role="alertdialog"
                      aria-labelledby={`delete-title-${cardKey}`}
                    >
                      <p id={`delete-title-${cardKey}`} className="text-xs font-medium text-foreground">
                        {vh.deleteConfirmTitle}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {group.crawlOnly
                          ? format(vh.deleteConfirmCrawlOnly, {
                              name: group.domainName,
                              count: group.urlCount.toLocaleString(),
                            })
                          : format(vh.deleteConfirmBody, { name: group.domainName })}
                      </p>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          className="px-2 py-1 text-[11px] rounded-md border border-default text-muted-foreground hover:text-foreground"
                          onClick={() => setPendingDeleteKey(null)}
                        >
                          {vh.deleteCancel}
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          className="px-2 py-1 text-[11px] rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                          onClick={() => { void handleDeletePortfolioItem(group); }}
                        >
                          {isDeleting ? vh.deleting : vh.deleteConfirm}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-md border border-default bg-brand-900/35 px-2 py-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{vh.crawlUrlLabel}</p>
                    <a
                      href={group.crawlUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex max-w-full items-center gap-1 text-xs sm:text-sm text-link hover:underline"
                      title={group.crawlUrl}
                    >
                      <span className="truncate font-mono">{group.crawlUrl}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    </a>
                  </div>

                  <div className="rounded-md bg-brand-900/35 px-2 py-1.5 border border-default">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.urlCountLabel}</p>
                        <p className="text-lg leading-none font-semibold text-bright tabular-nums mt-1">{group.urlCount.toLocaleString()}</p>
                      </div>
                      <div className="min-w-0 text-right">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.lastCrawlLabel}</p>
                        <p className="text-xs text-foreground truncate mt-1" title={group.lastCrawl || sj.emDash}>{group.lastCrawl || sj.emDash}</p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={openingCrawlId === group.crawlRunId || isDeleting}
                    onClick={() => { void openSite(group); }}
                    className="w-full rounded-md border border-default px-2 py-1.5 text-left hover:bg-brand-900/40 transition-colors disabled:opacity-60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.statusBreakdownLabel}</p>
                      <div className="text-xs text-link-soft flex items-center gap-1 font-medium">
                      <Globe className="h-3.5 w-3.5" />
                      {group.crawlOnly
                        ? format(vh.viewUrlsCta, { count: group.urlCount })
                        : vh.openBrandCta}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                    </div>
                    <div className="flex flex-wrap gap-1 text-[11px] tabular-nums mt-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        2xx {group.statusCounts.s2xx}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                        3xx {group.statusCounts.s3xx}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        4xx {group.statusCounts.s4xx}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                        5xx {group.statusCounts.s5xx}
                      </span>
                      {group.statusCounts.other > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300">
                          {format(vh.otherStatusPill, { count: group.statusCounts.other })}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              </Card>
            </div>
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
