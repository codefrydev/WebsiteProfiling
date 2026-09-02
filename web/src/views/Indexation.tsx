
import { useMemo } from 'react';
import { FileSearch, AlertCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useReport } from '../context/useReport';
import { useSectionData } from '@/hooks/useSectionData';
import { useSectionsViewReady } from '@/hooks/useSectionsViewReady';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { useUrlTab } from '@/hooks/useUrlTab';
import { strings } from '../lib/strings';
import { PageLayout, PageHeader, Card, StatCard, ViewTabs, ViewTabPanel, AlertBanner } from '../components';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import { metricHelpHint } from '@/lib/metricHelp';
import UrlGapListsPanel from '../components/google/UrlGapListsPanel';
import UrlCoverageDoughnut from '../components/google/UrlCoverageDoughnut';
import SitemapGapUrlPanel from '../components/indexation/SitemapGapUrlPanel';
import type { UrlJoinData, ViewProps } from '@/types';

const TABS = ['summary', 'gscGaps', 'sitemapGaps'] as const;
type IndexationTabId = (typeof TABS)[number];

function tabHref(searchParams: URLSearchParams, tab: IndexationTabId): string {
  const next = new URLSearchParams(searchParams.toString());
  if (tab === 'summary') {
    next.delete('tab');
  } else {
    next.set('tab', tab);
  }
  const q = next.toString();
  return q ? `/indexation?${q}` : '/indexation';
}

function gapStatProps(
  count: number | null | undefined,
  tab: IndexationTabId,
  searchParams: URLSearchParams,
  bandLabel: string,
) {
  const n = Number(count ?? 0);
  if (n <= 0) return {};
  return {
    band: bandLabel,
    bandClassName: 'text-amber-700 dark:text-amber-400',
    href: tabHref(searchParams, tab),
  };
}

function searchPerformanceCoverageHref(searchParams: URLSearchParams): string {
  const next = new URLSearchParams(searchParams.toString());
  next.set('tab', 'coverage');
  return `/search-performance?${next.toString()}`;
}

export default function Indexation({ searchQuery = '' }: ViewProps) {
  const { data } = useReport();
  useSectionData('indexation');
  const indexationReady = useSectionsViewReady(['indexation']);
  const vi = strings.views.indexation;
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useUrlTab(TABS, 'summary');
  const cov = data?.indexation_coverage;
  const counts = cov?.counts;
  const q = (searchQuery || '').trim();

  const querySuffix = searchParams.toString() ? `?${searchParams.toString()}` : '';

  const urlJoin = useMemo((): UrlJoinData | null => {
    if (cov?.url_join) {
      return cov.url_join;
    }
    const gscUrls = cov?.lists?.gsc_not_crawled;
    if (!gscUrls?.length) {
      return null;
    }
    return {
      lists: {
        gsc_only: gscUrls.map((url) => ({ url })),
      },
      lists_total: {
        gsc_only: Number(cov?.lists_total?.gsc_not_crawled ?? cov?.counts?.gsc_not_crawled ?? gscUrls.length),
      },
      list_limit: 200,
    };
  }, [cov]);

  const sitemapOnly = cov?.lists?.sitemap_only ?? [];
  const sitemapOnlyTotal = Number(
    cov?.lists_total?.sitemap_only ?? counts?.sitemap_only ?? sitemapOnly.length,
  );
  const crawledNotInSitemap = cov?.lists?.crawled_not_in_sitemap ?? [];
  const crawledNotInSitemapTotal = Number(
    cov?.lists_total?.crawled_not_in_sitemap ?? counts?.crawled_not_in_sitemap ?? crawledNotInSitemap.length,
  );

  const hasSitemapGapData = sitemapOnly.length > 0 || crawledNotInSitemap.length > 0;
  const showNoGscBanner = !urlJoin && hasSitemapGapData;

  const statsDevData = useMemo(
    () => ({
      widget: 'indexation.stats',
      crawled: counts?.crawled ?? null,
      sitemap: counts?.sitemap ?? null,
      gscPages: counts?.gsc_pages ?? null,
      sitemapOnly: counts?.sitemap_only ?? null,
      gscNotCrawled: counts?.gsc_not_crawled ?? null,
      crawledNotInSitemap: counts?.crawled_not_in_sitemap ?? null,
    }),
    [counts],
  );

  const coverageChartDevData = useMemo(
    () => ({
      widget: 'indexation.summary.coverageChart',
      urlJoin: urlJoin
        ? {
            matched: urlJoin.matched ?? null,
            crawl_only: urlJoin.crawl_only ?? null,
            gsc_only: urlJoin.gsc_only ?? null,
            ga4_only: urlJoin.ga4_only ?? null,
          }
        : null,
    }),
    [urlJoin],
  );

  const gapsDevData = useMemo(
    () => ({
      widget: 'indexation.gaps',
      hasUrlJoin: urlJoin != null,
      urlJoin: urlJoin
        ? {
            matched: urlJoin.matched ?? null,
            crawlOnly: urlJoin.crawl_only ?? null,
            gscOnly: urlJoin.gsc_only ?? null,
            ga4Only: urlJoin.ga4_only ?? null,
            lists: urlJoin.lists ?? null,
            listsTotal: urlJoin.lists_total ?? null,
          }
        : null,
    }),
    [urlJoin],
  );

  const sitemapOnlyDevData = useMemo(
    () => ({
      widget: 'indexation.sitemapGaps.sitemapOnly',
      total: sitemapOnlyTotal,
      urls: sitemapOnly,
    }),
    [sitemapOnly, sitemapOnlyTotal],
  );

  const crawledNotInSitemapDevData = useMemo(
    () => ({
      widget: 'indexation.sitemapGaps.crawledNotInSitemap',
      total: crawledNotInSitemapTotal,
      urls: crawledNotInSitemap,
    }),
    [crawledNotInSitemap, crawledNotInSitemapTotal],
  );

  const tabLabels = vi.tabs as Record<IndexationTabId, string>;
  const indexationTabItems = TABS.map((id) => ({
    id,
    label: tabLabels[id],
    badge:
      id === 'gscGaps' && Number(counts?.gsc_not_crawled ?? 0) > 0
        ? Number(counts?.gsc_not_crawled)
        : id === 'sitemapGaps' &&
            (Number(counts?.sitemap_only ?? 0) > 0 || Number(counts?.crawled_not_in_sitemap ?? 0) > 0)
          ? Number(counts?.sitemap_only ?? 0) + Number(counts?.crawled_not_in_sitemap ?? 0)
          : null,
  }));

  if (!indexationReady) {
    return <ViewSectionLoading title={vi.title} />;
  }

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title={vi.title}
        subtitle={vi.subtitle}
        icon={<FileSearch className="h-7 w-7 text-link shrink-0" />}
        actions={
          <>
            <Link
              to={searchPerformanceCoverageHref(searchParams)}
              className="text-sm text-link hover:underline"
            >
              {vi.viewSearchPerformance}
            </Link>
            <Link to={`/subdomains${querySuffix}`} className="text-sm text-link hover:underline">
              {vi.viewSubdomains}
            </Link>
          </>
        }
      />

      {showNoGscBanner ? (
        <AlertBanner
          variant="warning"
          icon={<AlertCircle className="h-4 w-4 shrink-0" aria-hidden />}
        >
          <p>{vi.noGscHint}</p>
        </AlertBanner>
      ) : null}

      <ViewTabs
        tabs={indexationTabItems}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as IndexationTabId)}
        ariaLabel={vi.title}
        idPrefix="indexation"
      />

      {activeTab === 'summary' ? (
        <ViewTabPanel idPrefix="indexation" tabId="summary" className="space-y-6">
          <div className="relative group/dev-card">
            <DevCopyJsonButton data={statsDevData} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label={vi.crawled} value={counts?.crawled ?? '—'} hint={metricHelpHint('views.indexation.crawled')} />
              <StatCard label={vi.sitemap} value={counts?.sitemap ?? '—'} hint={metricHelpHint('views.indexation.sitemap')} />
              <StatCard label={vi.gscPages} value={counts?.gsc_pages ?? '—'} hint={metricHelpHint('views.indexation.gscPages')} />
              <StatCard
                label={vi.sitemapOnly}
                value={counts?.sitemap_only ?? '—'}
                hint={metricHelpHint('views.indexation.sitemapOnly')}
                {...gapStatProps(counts?.sitemap_only, 'sitemapGaps', searchParams, vi.gapBandLabel)}
              />
              <StatCard
                label={vi.gscNotCrawled}
                value={counts?.gsc_not_crawled ?? '—'}
                hint={metricHelpHint('views.indexation.gscNotCrawled')}
                {...gapStatProps(counts?.gsc_not_crawled, 'gscGaps', searchParams, vi.gapBandLabel)}
              />
              <StatCard
                label={vi.crawledNotInSitemap}
                value={counts?.crawled_not_in_sitemap ?? '—'}
                hint={metricHelpHint('views.indexation.crawledNotInSitemap')}
                {...gapStatProps(counts?.crawled_not_in_sitemap, 'sitemapGaps', searchParams, vi.gapBandLabel)}
              />
            </div>
          </div>
          {urlJoin ? (
            <UrlCoverageDoughnut
              urlJoin={urlJoin}
              devData={coverageChartDevData}
              title={vi.coverageChartTitle}
              hint={vi.coverageChartHint}
              ariaLabel={vi.coverageChartAria}
            />
          ) : null}
        </ViewTabPanel>
      ) : null}

      {activeTab === 'gscGaps' ? (
        <ViewTabPanel idPrefix="indexation" tabId="gscGaps">
          <Card devData={gapsDevData}>
            <h3 className="text-sm font-semibold text-foreground mb-2">{vi.gapsTitle}</h3>
            <p className="text-sm text-muted-foreground mb-4">{vi.gapsHint}</p>
            {urlJoin ? (
              <UrlGapListsPanel
                urlJoin={urlJoin}
                searchParams={searchParams}
                showCrawl
                showGsc
                showGa4={false}
                globalSearch={q}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{vi.noSearchGaps}</p>
            )}
          </Card>
        </ViewTabPanel>
      ) : null}

      {activeTab === 'sitemapGaps' ? (
        <ViewTabPanel idPrefix="indexation" tabId="sitemapGaps" className="space-y-6">
          <SitemapGapUrlPanel
            urls={sitemapOnly}
            total={sitemapOnlyTotal}
            title={vi.sitemapOnlyList}
            globalSearch={q}
            searchParams={searchParams}
            devData={sitemapOnlyDevData}
          />
          <SitemapGapUrlPanel
            urls={crawledNotInSitemap}
            total={crawledNotInSitemapTotal}
            title={vi.crawledNotInSitemapList}
            globalSearch={q}
            searchParams={searchParams}
            devData={crawledNotInSitemapDevData}
          />
          {!hasSitemapGapData ? (
            <Card>
              <p className="text-sm text-muted-foreground">{strings.common.notEnoughData}</p>
            </Card>
          ) : null}
        </ViewTabPanel>
      ) : null}
    </PageLayout>
  );
}
