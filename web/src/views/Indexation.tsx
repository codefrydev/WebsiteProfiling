
import { useMemo } from 'react';
import { FileSearch } from 'lucide-react';
import { useReport } from '../context/useReport';
import { useSectionData } from '@/hooks/useSectionData';
import { useSectionsViewReady } from '@/hooks/useSectionsViewReady';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { format, strings } from '../lib/strings';
import { PageLayout, PageHeader, Card, StatCard } from '../components';
import { metricHelpHint } from '@/lib/metricHelp';
import UrlGapListsPanel from '../components/google/UrlGapListsPanel';
import type { UrlJoinData, ViewProps } from '@/types';

export default function Indexation(_props: ViewProps) {
  const { data } = useReport();
  useSectionData('indexation');
  const indexationReady = useSectionsViewReady(['indexation']);
  const vi = strings.views.indexation;
  const cov = data?.indexation_coverage;
  const counts = cov?.counts;

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
  const sitemapPreviewLimit = 50;
  const crawledNotInSitemap = cov?.lists?.crawled_not_in_sitemap ?? [];
  const crawledNotInSitemapTotal = Number(
    cov?.lists_total?.crawled_not_in_sitemap ?? counts?.crawled_not_in_sitemap ?? crawledNotInSitemap.length,
  );

  if (!indexationReady) {
    return <ViewSectionLoading title={vi.title} />;
  }

  return (
    <PageLayout>
      <PageHeader title={vi.title} subtitle={vi.subtitle} icon={<FileSearch className="h-7 w-7 text-link shrink-0" />} />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label={vi.crawled} value={counts?.crawled ?? '—'} hint={metricHelpHint('views.indexation.crawled')} />
        <StatCard label={vi.sitemap} value={counts?.sitemap ?? '—'} hint={metricHelpHint('views.indexation.sitemap')} />
        <StatCard label={vi.gscPages} value={counts?.gsc_pages ?? '—'} hint={metricHelpHint('views.indexation.gscPages')} />
        <StatCard label={vi.sitemapOnly} value={counts?.sitemap_only ?? '—'} hint={metricHelpHint('views.indexation.sitemapOnly')} />
        <StatCard label={vi.gscNotCrawled} value={counts?.gsc_not_crawled ?? '—'} hint={metricHelpHint('views.indexation.gscNotCrawled')} />
        <StatCard label={vi.crawledNotInSitemap} value={counts?.crawled_not_in_sitemap ?? '—'} hint={metricHelpHint('views.indexation.crawledNotInSitemap')} />
      </div>
      <Card className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-2">{vi.gapsTitle}</h3>
        <p className="text-sm text-muted-foreground mb-4">{vi.gapsHint}</p>
        {urlJoin ? (
          <UrlGapListsPanel urlJoin={urlJoin} showCrawl showGsc showGa4={false} />
        ) : (
          <p className="text-sm text-muted-foreground">{vi.noSearchGaps}</p>
        )}
        {sitemapOnly.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {vi.sitemapOnlyList}
            </h4>
            {sitemapOnlyTotal > sitemapPreviewLimit ? (
              <p className="text-xs text-muted-foreground mb-2">
                {format(vi.listSampleHint, { limit: sitemapPreviewLimit, total: sitemapOnlyTotal })}
              </p>
            ) : null}
            <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
              {sitemapOnly.slice(0, sitemapPreviewLimit).map((url) => (
                <li key={url} className="truncate text-foreground font-mono text-xs">{url}</li>
              ))}
            </ul>
          </div>
        )}
        {crawledNotInSitemap.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {vi.crawledNotInSitemapList}
            </h4>
            {crawledNotInSitemapTotal > sitemapPreviewLimit ? (
              <p className="text-xs text-muted-foreground mb-2">
                {format(vi.listSampleHint, { limit: sitemapPreviewLimit, total: crawledNotInSitemapTotal })}
              </p>
            ) : null}
            <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
              {crawledNotInSitemap.slice(0, sitemapPreviewLimit).map((url) => (
                <li key={url} className="truncate text-foreground font-mono text-xs">{url}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </PageLayout>
  );
}
