import { Building2, ExternalLink, Globe, ArrowRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageLayout, Card } from '../components';
import { useReport } from '../context/useReport';
import { readReportPayloadFromDatabase } from '../lib/loadReportDb';
import { strings, format } from '../lib/strings';

function extractHostname(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

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

export default function Home({ onNavigate }) {
  const { data, sqlDb, reportList, setSelectedReportId } = useReport();
  const vh = strings.views.home;
  const sj = strings.common;
  const [filterQuery, setFilterQuery] = useState('');

  const domainGroups = useMemo(() => {
    if (!sqlDb) return [];

    const startUrlByRunId = new Map();
    const runCreatedAtByRunId = new Map();
    const runRows = sqlDb.exec('SELECT id, start_url, created_at FROM crawl_runs');
    if (runRows.length && runRows[0].values.length) {
      const cols = runRows[0].columns;
      const idIdx = cols.indexOf('id');
      const urlIdx = cols.indexOf('start_url');
      const createdAtIdx = cols.indexOf('created_at');
      runRows[0].values.forEach((row) => {
        const runId = Number(row[idIdx]);
        startUrlByRunId.set(runId, String(row[urlIdx] || ''));
        runCreatedAtByRunId.set(runId, String(row[createdAtIdx] || ''));
      });
    }

    const brandMap = new Map();
    reportList.forEach((r) => {
      let payload;
      try {
        payload = readReportPayloadFromDatabase(sqlDb, r.id);
      } catch {
        return;
      }

      const runId = payload?.crawl_run_id != null ? Number(payload.crawl_run_id) : null;
      const runStartUrl = runId != null ? startUrlByRunId.get(runId) || '' : '';
      const fallbackUrl = String(payload?.top_pages?.[0]?.url || payload?.links?.[0]?.url || '');
      const crawlUrl = (runStartUrl || fallbackUrl || '').trim();
      const startDomain = extractHostname(runStartUrl);
      const fallbackDomain = extractHostname(crawlUrl);
      const domainName = startDomain || fallbackDomain || String(payload?.site_name || vh.unknownBrand);
      const brandKey = startDomain || (fallbackDomain ? `fallback:${fallbackDomain}` : `report:${r.id}`);

      const summary = payload?.summary || {};
      const statusCounts = {
        s2xx: Number(summary.count_2xx || 0),
        s3xx: Number(summary.count_3xx || 0),
        s4xx: Number(summary.count_4xx || 0),
        s5xx: Number(summary.count_5xx || 0),
        other: Number(summary.count_error || 0),
      };
      const urlCount = Number(summary.total_urls || payload?.links?.length || payload?.top_pages?.length || 0);
      const successPct = urlCount > 0 ? Math.round((statusCounts.s2xx / urlCount) * 100) : 0;
      const globalHealthBase = scoreFromCategories(payload?.categories) ?? Number(summary.success_rate || 0);
      const healthScore = Math.round(globalHealthBase * 0.6 + successPct * 0.4);
      const runCreatedAt = runId != null ? runCreatedAtByRunId.get(runId) : '';
      const lastCrawl = toLocalDateTime(runCreatedAt || payload?.crawl_run_created_at || payload?.report_generated_at || r.generated_at);
      const generatedAtMs = Number(new Date(r.generated_at || 0));

      const existing = brandMap.get(brandKey);
      if (!existing || generatedAtMs > existing.generatedAtMs) {
        brandMap.set(brandKey, {
          domainName,
          crawlUrl: crawlUrl || sj.emDash,
          urlCount,
          healthScore,
          statusCounts,
          lastCrawl,
          reportId: r.id,
          generatedAtMs,
        });
      }
    });

    return Array.from(brandMap.values()).sort((a, b) => b.generatedAtMs - a.generatedAtMs);
  }, [sqlDb, reportList, sj.emDash, vh.unknownBrand]);

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
            <p className="text-sm sm:text-base font-bold text-foreground mt-0.5 tabular-nums">{portfolioTotals.totalBrands.toLocaleString()}</p>
          </div>
          <div className="rounded-md border border-default bg-brand-900/25 px-2 py-1.5">
            <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">{vh.totalUrlsLabel}</p>
            <p className="text-sm sm:text-base font-bold text-foreground mt-0.5 tabular-nums">{portfolioTotals.totalUrls.toLocaleString()}</p>
          </div>
          <div className="rounded-md border border-default bg-brand-900/25 px-2 py-1.5">
            <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">{vh.avgHealthLabel}</p>
            <p className={`text-sm sm:text-base font-bold mt-0.5 tabular-nums ${portfolioTotals.avgHealth != null ? healthScoreClass(portfolioTotals.avgHealth) : 'text-foreground'}`}>
              {portfolioTotals.avgHealth ?? sj.emDash}
            </p>
          </div>
        </div>
        </div>
      </div>

      {filteredGroups.length > 0 ? (
        <div className="max-w-3xl mx-auto grid grid-cols-[repeat(auto-fit,minmax(220px,260px))] justify-center gap-2 mt-2">
          {filteredGroups.map((group) => (
            <button
              key={group.domainName}
              type="button"
              onClick={() => {
                if (group.reportId != null) setSelectedReportId(group.reportId);
                onNavigate?.('overview');
              }}
              className="text-left w-full max-w-[260px]"
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
                      className="inline-flex max-w-full items-center gap-1 text-xs sm:text-sm text-blue-700 dark:text-blue-400 hover:underline"
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
                      <div className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1 font-medium">
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
      ) : (
        <Card>
          <p className="text-muted-foreground">{filterQuery ? vh.noSearchResults : vh.empty}</p>
        </Card>
      )}
    </PageLayout>
  );
}
