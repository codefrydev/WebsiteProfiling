import { Building2, ExternalLink, Globe, ArrowRight, Search, Settings2 } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { PageLayout, Card } from '../components';
import { Skeleton, SkeletonDomainCard } from '../components/Skeleton.jsx';
import { useReport } from '../context/useReport';
import { format, strings } from '../lib/strings';
import { reportApi } from '../lib/publicBase';

function scoreFromCategories(categories = []) {
  const numeric = (categories || [])
    .map((c) => Number(c?.score))
    .filter((n) => Number.isFinite(n));
  if (!numeric.length) return null;
  const avg = numeric.reduce((a, b) => a + b, 0) / numeric.length;
  return Math.round(avg);
}

function toLocalDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

function healthScoreClass(score) {
  if (score >= 80) return 'text-emerald-700 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-700 dark:text-amber-400';
  return 'text-rose-700 dark:text-rose-400';
}

export default function Home({ onNavigate, onOpenIntegrations }) {
  const { data, reportList } = useReport();
  const vh = strings.views.home;
  const sj = strings.common;
  const [filterQuery, setFilterQuery] = useState('');
  const [domainGroups, setDomainGroups] = useState([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  useEffect(() => {
    if (!reportList.length) {
      setDomainGroups([]);
      setPortfolioLoading(false);
      return;
    }
    let cancelled = false;
    setPortfolioLoading(true);
    const ids = reportList.map((r) => r.id).join(',');
    fetch(reportApi(`/portfolio?ids=${encodeURIComponent(ids)}`))
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
  }, [reportList]);

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

  if (!data) return null;

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
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{vh.title}</h1>
        <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">{vh.subtitle}</p>

        {onOpenIntegrations ? (
          <button
            type="button"
            onClick={onOpenIntegrations}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-default bg-brand-900/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-brand-800 transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            Configure Google (GSC &amp; GA4)
          </button>
        ) : null}

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

      {portfolioLoading ? (
        <div className="w-full mt-2" role="status" aria-busy="true" aria-label={strings.app.loading}>
          <span className="sr-only">{strings.app.loading}</span>
          <div className="flex w-full flex-row flex-wrap justify-center gap-3 items-stretch">
            <SkeletonDomainCard />
            <SkeletonDomainCard />
            <SkeletonDomainCard />
          </div>
        </div>
      ) : filteredGroups.length > 0 ? (
        <div className="w-full mt-2">
          <div className="flex w-full flex-row flex-wrap justify-center gap-3 items-stretch">
          {filteredGroups.map((group) => (
            <button
              key={group.domainName}
              type="button"
              onClick={() => {
                onNavigate?.('overview', {
                  domain: group.domainParam,
                  reportId: group.reportId ?? undefined,
                });
              }}
              className="text-left w-[min(260px,100%)] max-w-[260px] min-w-0"
            >
              <Card
                shadow
                padding="none"
                className="group border-default/90 hover:border-blue-500/45 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer h-full p-2"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Building2 className="h-3 w-3" />
                        {vh.brandLabel}
                      </p>
                      <h3 className="text-sm sm:text-[15px] font-semibold text-foreground truncate">{group.domainName}</h3>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.healthScoreLabel}</p>
                      <p className={`text-base font-bold tabular-nums ${healthScoreClass(group.healthScore)}`}>{group.healthScore}</p>
                    </div>
                  </div>

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

                  <div className="rounded-md border border-default px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.statusBreakdownLabel}</p>
                      <div className="text-xs text-link-soft flex items-center gap-1 font-medium">
                        <Globe className="h-3.5 w-3.5" />
                        {vh.openBrandCta}
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
                  </div>
                </div>
              </Card>
            </button>
          ))}
          </div>
        </div>
      ) : (
        <Card>
          <p className="text-muted-foreground">{filterQuery ? vh.noSearchResults : vh.empty}</p>
        </Card>
      )}
    </PageLayout>
  );
}
