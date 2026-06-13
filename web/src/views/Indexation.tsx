'use client';

import { useMemo } from 'react';
import { FileSearch } from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { PageLayout, PageHeader, Card, StatCard } from '../components';
import { metricHelpHint } from '@/lib/metricHelp';
import UrlGapListsPanel from '../components/google/UrlGapListsPanel';
import type { UrlJoinData, ViewProps } from '@/types';

export default function Indexation(_props: ViewProps) {
  const { data } = useReport();
  const vi = strings.views.indexation;
  const cov = data?.indexation_coverage;
  const counts = cov?.counts;

  const urlJoin = useMemo((): UrlJoinData | null => {
    const base = cov?.url_join;
    if (!base && !cov?.lists) return null;
    const lists = {
      ...(base?.lists || {}),
      crawl_only: base?.lists?.crawl_only ?? cov?.lists?.crawled_not_in_sitemap?.map((url) => ({ url })) ?? [],
      gsc_only: base?.lists?.gsc_only ?? cov?.lists?.gsc_not_crawled?.map((url) => ({ url })) ?? [],
    };
    return {
      ...base,
      lists,
      lists_total: {
        ...(base?.lists_total || {}),
        crawl_only: Number(cov?.lists_total?.crawled_not_in_sitemap ?? cov?.counts?.crawled_not_in_sitemap ?? 0),
        gsc_only: Number(cov?.lists_total?.gsc_not_crawled ?? cov?.counts?.gsc_not_crawled ?? 0),
      },
    };
  }, [cov]);

  return (
    <PageLayout>
      <PageHeader title={vi.title} subtitle={vi.subtitle} icon={<FileSearch className="h-7 w-7 text-link shrink-0" />} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label={vi.crawled} value={counts?.crawled ?? '—'} hint={metricHelpHint('views.indexation.crawled')} />
        <StatCard label={vi.sitemap} value={counts?.sitemap ?? '—'} hint={metricHelpHint('views.indexation.sitemap')} />
        <StatCard label={vi.gscPages} value={counts?.gsc_pages ?? '—'} hint={metricHelpHint('views.indexation.gscPages')} />
        <StatCard label={vi.sitemapOnly} value={counts?.sitemap_only ?? '—'} hint={metricHelpHint('views.indexation.sitemapOnly')} />
      </div>
      <Card className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-2">{vi.gapsTitle}</h3>
        <p className="text-sm text-muted-foreground mb-4">{vi.gapsHint}</p>
        <UrlGapListsPanel urlJoin={urlJoin} showCrawl showGsc showGa4={false} />
        {(cov?.lists?.sitemap_only?.length ?? 0) > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {vi.sitemapOnlyList}
            </h4>
            <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
              {(cov?.lists?.sitemap_only ?? []).slice(0, 50).map((url) => (
                <li key={url} className="truncate text-foreground font-mono text-xs">{url}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </PageLayout>
  );
}
