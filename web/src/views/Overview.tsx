import { Globe, CheckCircle, TrendingUp, BarChart3 } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUrlTab } from '@/hooks/useUrlTab';
import { useReport } from '../context/useReport';
import {
  canonicalDomainFromPayload,
  hostsMatch,
  normalizeDomainQueryParam,
} from '../lib/domainSlug';
import { strings, format } from '../lib/strings';
import { PageLayout, PageHeader, ViewTabs } from '../components';
import type { ViewTabItem } from '../components';
import type { ReportCategory, ViewProps } from '@/types';
import CrawlScopeBanner from '../components/CrawlScopeBanner';
import { viewIdToPathSlug } from '@/routes';
import {
  type OverviewTabId,
  OVERVIEW_TABS,
  useOverviewCharts,
  OverviewSummaryTab,
  OverviewChartsTab,
  OverviewHealthTab,
  OverviewPagesTab,
} from '../components/overview';

export default function Overview({ searchQuery = '' }: ViewProps) {
  const { data, reportList, startUrlByRunId } = useReport();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useUrlTab(OVERVIEW_TABS, 'summary');
  const vo = strings.views.overview;
  const q = (searchQuery || '').toLowerCase().trim();

  const expectedHost = useMemo(() => {
    const fromPayload = canonicalDomainFromPayload(data, startUrlByRunId);
    const fromQuery = normalizeDomainQueryParam(
      searchParams.get('domain') ?? searchParams.get('brand') ?? '',
    );
    if (fromPayload && fromQuery && !hostsMatch(fromPayload, fromQuery)) return fromPayload;
    return fromPayload || fromQuery;
  }, [data, startUrlByRunId, searchParams]);

  const compareHref = useMemo(() => {
    const params = searchParams.toString();
    return params ? `/compare?${params}` : '/compare';
  }, [searchParams]);

  const categoriesFiltered = useMemo((): ReportCategory[] => {
    const cats = data?.categories || [];
    if (!q) return cats;
    return cats.filter((cat) => String(cat.name || cat.id || '').toLowerCase().includes(q));
  }, [data?.categories, q]);

  const recommendationsFiltered = useMemo((): string[] => {
    const recs = data?.recommendations || [];
    if (!q) return recs;
    return recs.filter((r: string) => r.toLowerCase().includes(q));
  }, [data?.recommendations, q]);

  const topPagesFiltered = useMemo(() => {
    const pages = data?.top_pages || [];
    if (!q) return pages;
    return pages.filter((p) => {
      const u = (p.url || '').toLowerCase();
      const t = (p.title || '').toLowerCase();
      return u.includes(q) || t.includes(q);
    });
  }, [data?.top_pages, q]);

  const charts = useOverviewCharts(data, expectedHost);

  const overviewTabItems = useMemo((): ViewTabItem[] => {
    const catCount = data?.categories?.length ?? 0;
    const pageCount = data?.top_pages?.length ?? 0;
    return [
      { id: 'summary', label: vo.tabs.summary, icon: <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden /> },
      {
        id: 'charts',
        label: vo.tabs.charts,
        icon: <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        badge: charts.chartCount > 0 ? charts.chartCount : null,
      },
      {
        id: 'health',
        label: vo.tabs.health,
        icon: <CheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        badge: catCount > 0 ? catCount : null,
      },
      {
        id: 'pages',
        label: vo.tabs.pages,
        icon: <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        badge: pageCount > 0 ? pageCount : null,
      },
    ];
  }, [vo.tabs, charts.chartCount, data?.categories?.length, data?.top_pages?.length]);

  if (!data) return null;

  const s = data.summary || {};
  const siteName = data.site_name || strings.app.defaultSiteName;
  const depth = data.depth_distribution || {};
  const exportPath = `/${viewIdToPathSlug('export')}`;
  const exportHref = searchParams.toString() ? `${exportPath}?${searchParams.toString()}` : exportPath;

  return (
    <PageLayout className="space-y-6">
      <CrawlScopeBanner data={data} />

      <PageHeader
        title={vo.dashboard}
        subtitle={
          <>
            {vo.subtitleSiteHealth} <span className="text-link">{siteName}</span>.{' '}
            {s.crawl_time_s != null ? format(vo.crawlDoneSeconds, { seconds: s.crawl_time_s }) : vo.crawlDone}
          </>
        }
      />

      <ViewTabs
        tabs={overviewTabItems}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as OverviewTabId)}
        ariaLabel={vo.dashboard}
        idPrefix="overview"
      />

      {activeTab === 'summary' && (
        <OverviewSummaryTab
          data={data}
          exportHref={exportHref}
          compareHref={compareHref}
          reportCount={reportList.length}
        />
      )}

      {activeTab === 'charts' && <OverviewChartsTab charts={charts} depth={depth} />}

      {activeTab === 'health' && (
        <OverviewHealthTab
          data={data}
          categoriesFiltered={categoriesFiltered}
          recommendationsFiltered={recommendationsFiltered}
        />
      )}

      {activeTab === 'pages' && (
        <OverviewPagesTab
          topPages={topPagesFiltered}
          hasTopPages={(data.top_pages || []).length > 0}
        />
      )}
    </PageLayout>
  );
}
