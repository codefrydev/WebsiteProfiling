import {
  Building2,
  ChevronDown,
  Cpu,
  Gauge,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { PageLayout, Button, StatCard, EmptyState, LabelWithHint } from '../components';
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
  const [greeting, setGreeting] = useState(vh.greetingMorning);
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

  // Time-aware greeting computed after mount to avoid SSR/timezone hydration mismatch.
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? vh.greetingMorning : h < 18 ? vh.greetingAfternoon : vh.greetingEvening);
  }, [vh.greetingMorning, vh.greetingAfternoon, vh.greetingEvening]);

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

  // "Jump back in" — the most recently generated audits, derived from existing data.
  const recentAudits = useMemo(
    () => domainGroups.toSorted((a, b) => b.generatedAtMs - a.generatedAtMs).slice(0, 4),
    [domainGroups],
  );
  const showResume = !filterQuery && !portfolioLoading && recentAudits.length > 1;

  // Inline (span) shimmer for StatCard values — a block <Skeleton> here would nest
  // a <div> inside StatCard's value <p>, which is invalid DOM.
  const statSkeleton = (
    <span
      className="shimmer inline-block h-6 w-14 rounded-md bg-brand-800/90 align-middle dark:bg-white/[0.07]"
      aria-hidden
    />
  );

  return (
    <PageLayout className="pt-2 sm:pt-3 relative overflow-hidden">
      <div aria-hidden className="aurora-bg" />

      {/* Welcome header + quick actions */}
      <header className="animate-in flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-warm">
            {greeting}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-bright sm:text-3xl">
            {vh.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{vh.greetingTagline}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href="/chat">
            <Button variant="secondary">
              <MessageSquare className="h-4 w-4" aria-hidden />
              {vh.quickActionChatLabel}
            </Button>
          </Link>
          <Link href="/pipeline">
            <Button variant="primary">
              <Plus className="h-4 w-4" aria-hidden />
              {vh.quickActionRunLabel}
            </Button>
          </Link>
        </div>
      </header>

      {/* Search */}
      <div className="mt-5 relative max-w-xl">
        <Search className="h-4 w-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder={vh.searchPlaceholder}
          className="w-full rounded-full border border-default bg-brand-900/40 px-10 py-2.5 text-sm text-foreground outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {/* Portfolio stat row */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={<LabelWithHint label={vh.totalBrandsLabel} helpKey="views.home.totalBrands" />}
          value={portfolioLoading ? statSkeleton : portfolioTotals.totalBrands.toLocaleString()}
          icon={<Building2 className="h-3.5 w-3.5" aria-hidden />}
          size="lg"
          shadow
        />
        <StatCard
          label={<LabelWithHint label={vh.totalUrlsLabel} helpKey="views.home.totalUrls" />}
          value={portfolioLoading ? statSkeleton : portfolioTotals.totalUrls.toLocaleString()}
          icon={<Gauge className="h-3.5 w-3.5" aria-hidden />}
          size="lg"
          shadow
        />
        <StatCard
          label={<LabelWithHint label={vh.avgHealthLabel} helpKey="views.home.avgHealth" />}
          value={
            portfolioLoading ? statSkeleton : (portfolioTotals.avgHealth ?? sj.emDash)
          }
          valueClassName={
            portfolioTotals.avgHealth != null ? healthScoreClass(portfolioTotals.avgHealth) : 'text-bright'
          }
          icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
          size="lg"
          shadow
        />
      </div>

      {deleteError ? (
        <p className="mt-3 text-center text-sm text-red-700 dark:text-red-400" role="alert">
          {deleteError}
        </p>
      ) : null}

      {/* Jump back in */}
      {showResume ? (
        <section className="animate-in mt-7">
          <h2 className="mb-2.5 text-sm font-semibold text-foreground">{vh.resumeHeading}</h2>
          <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
            {recentAudits.map((group, i) => {
              const opening = openingCrawlId != null && openingCrawlId === group.crawlRunId;
              return (
                <button
                  key={portfolioCardKey(group)}
                  type="button"
                  onClick={() => { void openSite(group); }}
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
      ) : null}

      {/* Portfolio groups */}
      {portfolioLoading ? (
        <div className="w-full mt-7 space-y-6" role="status" aria-busy="true" aria-label={strings.app.loading}>
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
        <div className="w-full mt-7 space-y-6">
          {groupedPortfolio.map(({ rootDomain, items }) => {
            const collapsed = collapsedGroups.has(rootDomain);
            return (
              <section key={rootDomain} className="animate-in min-w-0 rounded-xl border border-default/80 bg-brand-900/20">
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
      ) : filterQuery ? (
        <div className="mt-7">
          <EmptyState icon={Search} title={vh.noSearchResults} />
        </div>
      ) : (
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
      )}
    </PageLayout>
  );
}
