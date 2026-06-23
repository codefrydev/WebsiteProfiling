'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link2, Settings2, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useUrlTab } from '@/hooks/useUrlTab';
import { useReport } from '../context/useReport';
import { useSectionData } from '@/hooks/useSectionData';
import { useSectionsViewReady } from '@/hooks/useSectionsViewReady';
import { useTabSections } from '@/hooks/useTabSections';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { BACKLINKS_TAB_SECTIONS } from '@/lib/reportViewSections';
import { useActivePropertyContext } from '@/hooks/useActivePropertyContext';
import { apiUrl, apiFetch } from '../lib/publicBase';
import { strings, format } from '../lib/strings';
import { PageLayout, PageHeader, ViewTabs, EmptyState } from '../components';
import SortablePaginatedTable from '../components/google/SortablePaginatedTable';
import GoogleTableToolbar from '../components/google/GoogleTableToolbar';
import GscLinksSummaryCards from '../components/backlinks/GscLinksSummaryCards';
import CompetitorGapImport from '../components/backlinks/CompetitorGapImport';
import ThirdPartyLinksImport from '../components/backlinks/ThirdPartyLinksImport';
import {
  buildAnchorExportColumns,
  buildDomainExportColumns,
  buildLinkedPageExportColumns,
  buildSampleLinkExportColumns,
  combinedSampleLinks,
  exportCsv,
  filterBySearch,
} from '../components/backlinks/backlinksTableUtils';
import { buildLinksInspectHref } from '../lib/reportNav';
import type { TableColumn } from '@/types/components';
import type { ViewProps } from '@/types';

const TABS = ['overview', 'domains', 'pages', 'anchors', 'sample'] as const;
type BacklinksTabId = (typeof TABS)[number];

export default function Backlinks(_props: ViewProps) {
  const vb = strings.views.backlinks;
  const searchParams = useSearchParams();
  const { data, loadReport } = useReport();
  useSectionData('gsc-links');
  const gscLinksReady = useSectionsViewReady(['gsc-links']);
  const { propertyId, contextReady } = useActivePropertyContext();
  const gscLinks = data?.gsc_links;
  const bingBacklinks = data?.bing_backlinks;
  const competitorGap = data?.competitor_link_gap;
  const [velocity, setVelocity] = useState<Array<{ capturedAt: string; referringDomains: number }>>([]);

  useEffect(() => {
    if (!contextReady || !propertyId) {
      if (contextReady) setVelocity([]);
      return;
    }
    let cancelled = false;
    void apiFetch(apiUrl(`/backlinks/velocity?propertyId=${propertyId}`))
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setVelocity(body.snapshots || []);
      })
      .catch(() => {
        if (!cancelled) setVelocity([]);
      });
    return () => {
      cancelled = true;
    };
  }, [contextReady, propertyId]);

  const paginationLabels = {
    showingSlice: vb.table.showingSlice,
    pageOf: vb.table.pageOf,
    of: vb.table.of,
    previous: vb.table.previous,
    next: vb.table.next,
    rowsPerPage: vb.table.rowsPerPage,
  };

  const [activeTab, setActiveTab] = useUrlTab(TABS, 'overview');
  useTabSections(BACKLINKS_TAB_SECTIONS, true);
  const [domainSearch, setDomainSearch] = useState('');
  const [pageSearch, setPageSearch] = useState('');
  const [anchorSearch, setAnchorSearch] = useState('');
  const [sampleSearch, setSampleSearch] = useState('');

  const filteredDomains = useMemo(
    () => filterBySearch(gscLinks?.top_linking_sites ?? [], domainSearch, 'site'),
    [gscLinks?.top_linking_sites, domainSearch],
  );
  const filteredPages = useMemo(
    () => filterBySearch(gscLinks?.top_linked_pages ?? [], pageSearch, 'target_page'),
    [gscLinks?.top_linked_pages, pageSearch],
  );
  const filteredAnchors = useMemo(
    () => filterBySearch(gscLinks?.top_linking_text ?? [], anchorSearch, 'anchor_text'),
    [gscLinks?.top_linking_text, anchorSearch],
  );
  const allSample = useMemo(() => combinedSampleLinks(gscLinks), [gscLinks]);
  const filteredSample = useMemo(() => {
    const q = sampleSearch.trim().toLowerCase();
    if (!q) return allSample;
    return allSample.filter((row) => {
      const hay = [
        row.source_page,
        row.target_page,
        row.anchor_text,
        row.linking_site,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allSample, sampleSearch]);

  const headerMeta: ReactNode = gscLinks?.imported_at ? (
    <span>
      {' '}
      &middot; {format(vb.fetchedAt, { date: new Date(String(gscLinks.imported_at)).toLocaleDateString() })}
    </span>
  ) : null;

  const domainColumns = useMemo(
    (): TableColumn[] => [
      { key: 'site', label: vb.table.site, hint: 'views.backlinks.referringDomain', render: (v) => <span className="font-mono text-xs">{String(v ?? '')}</span> },
      {
        key: 'link_count',
        label: vb.table.links,
        hint: 'views.backlinks.linkCount',
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'target_page_count',
        label: vb.table.targetPages,
        hint: 'views.backlinks.targetPages',
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
    ],
    [vb.table],
  );

  const pageColumns = useMemo(
    (): TableColumn[] => [
      {
        key: 'target_page',
        label: vb.table.targetPage,
        hint: 'views.backlinks.targetPage',
        render: (v, row) => {
          const url = String(v ?? '');
          const inCrawl = row?.target_in_crawl === true;
          const inspectHref = inCrawl
            ? buildLinksInspectHref(String(row?.crawl_url || url), searchParams)
            : null;
          return inspectHref ? (
            <a href={inspectHref} className="font-mono text-xs text-link hover:underline break-all">
              {url}
            </a>
          ) : (
            <span className="font-mono text-xs break-all">{url}</span>
          );
        },
      },
      {
        key: 'link_count',
        label: vb.table.links,
        hint: 'views.backlinks.linkCount',
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'linking_site_count',
        label: vb.table.linkingSites,
        hint: 'views.backlinks.linkingSites',
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
    ],
    [vb.table, searchParams],
  );

  const anchorColumns = useMemo(
    (): TableColumn[] => [
      {
        key: 'anchor_text',
        label: vb.table.anchorText,
        hint: 'views.backlinks.anchorText',
        render: (v) => (
          <span className="text-sm">{String(v ?? '').trim() || '—'}</span>
        ),
      },
      {
        key: 'link_count',
        label: vb.table.links,
        hint: 'views.backlinks.linkCount',
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
    ],
    [vb.table],
  );

  const sampleColumns = useMemo(
    (): TableColumn[] => [
      {
        key: 'source_page',
        label: vb.table.sourcePage,
        hint: 'views.backlinks.sourcePage',
        render: (v) => (
          <a
            href={String(v ?? '')}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-link hover:underline break-all"
          >
            {String(v ?? '')}
          </a>
        ),
      },
      {
        key: 'target_page',
        label: vb.table.targetPage,
        hint: 'views.backlinks.targetPage',
        render: (v, row) => {
          const url = String(v ?? '');
          const inspectHref =
            row?.target_in_crawl === true
              ? buildLinksInspectHref(String(row?.crawl_url || url), searchParams)
              : null;
          if (inspectHref) {
            return (
              <a href={inspectHref} className="font-mono text-xs text-link hover:underline break-all">
                {url}
              </a>
            );
          }
          return <span className="font-mono text-xs break-all">{url}</span>;
        },
      },
      {
        key: 'anchor_text',
        label: vb.table.anchorText,
        hint: 'views.backlinks.anchorText',
        render: (v) => <span className="text-sm">{String(v ?? '').trim() || '—'}</span>,
      },
      {
        key: 'discovered_at',
        label: vb.table.discovered,
        render: (v) => <span className="text-xs text-muted-foreground">{String(v ?? '—')}</span>,
      },
    ],
    [vb.table, searchParams],
  );

  if (!gscLinks?.export_types?.length) {
    if (!gscLinksReady) {
      return <ViewSectionLoading title={vb.title} />;
    }
    return (
      <PageLayout className="space-y-6">
        <EmptyState
          icon={Link2}
          title={vb.emptyTitle}
          description={
            <>
              {vb.emptyBody}
              <span className="mt-3 flex items-center justify-center gap-1 text-xs">
                <Settings2 className="h-3.5 w-3.5 shrink-0" />
                {vb.emptyIntegrationsHint}
              </span>
            </>
          }
        />
      </PageLayout>
    );
  }

  const tabLabels = vb.tabs as Record<BacklinksTabId, string>;

  const backlinksTabItems = TABS.map((id) => ({
    id,
    label: tabLabels[id],
  }));

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        icon={<Link2 className="h-7 w-7 text-link shrink-0" />}
        title={vb.title}
        subtitle={
          <>
            {vb.subtitle}
            {headerMeta}
            <span className="block text-xs text-muted-foreground mt-2 max-w-3xl">{vb.disclaimer}</span>
          </>
        }
      />

      <GscLinksSummaryCards data={gscLinks} labels={vb.kpi} />

      <ViewTabs
        tabs={backlinksTabItems}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as BacklinksTabId)}
        ariaLabel={vb.title}
        idPrefix="backlinks"
      />

      {activeTab === 'overview' && bingBacklinks?.ok ? (
        <div className="mb-6 p-4 rounded-xl border border-default bg-brand-800/50">
          <h3 className="text-sm font-bold text-foreground mb-2">{vb.bingTitle}</h3>
          <p className="text-xs text-muted-foreground mb-3">{vb.bingHint}</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              <span className="text-muted-foreground">{vb.bingLinkedPages}: </span>
              <span className="font-semibold tabular-nums">{bingBacklinks.linked_page_count ?? 0}</span>
            </span>
            <span>
              <span className="text-muted-foreground">{vb.bingInboundLinks}: </span>
              <span className="font-semibold tabular-nums">{bingBacklinks.total_inbound_links ?? 0}</span>
            </span>
          </div>
          {(bingBacklinks.linked_pages || []).length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs font-mono max-h-32 overflow-y-auto">
              {(bingBacklinks.linked_pages || []).slice(0, 8).map((row) => (
                <li key={row.url} className="flex justify-between gap-2">
                  <span className="truncate text-muted-foreground">{row.url}</span>
                  <span className="tabular-nums shrink-0">{row.inbound_links ?? 0}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'overview' ? (
        <ThirdPartyLinksImport gscLinks={gscLinks} onImported={() => void loadReport()} />
      ) : null}

      {activeTab === 'overview' && gscLinks ? <CompetitorGapImport gscLinks={gscLinks} /> : null}

      {activeTab === 'overview' && competitorGap?.competitors?.length ? (
        <div className="mb-6 p-4 rounded-xl border border-default bg-brand-800/50">
          <h3 className="text-sm font-bold text-foreground mb-2">Competitor link gap</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Based on imported GSC Links sample ({competitorGap.provenance || 'Search Console'}).
          </p>
          <ul className="text-sm space-y-1">
            {(competitorGap.competitors as Array<{ competitor?: string; links_to_us?: boolean }>).map((row) => (
              <li key={row.competitor} className="flex items-center gap-2">
                <span className="font-mono text-xs">{row.competitor}</span>
                <span className={row.links_to_us ? 'text-emerald-600 text-xs' : 'text-amber-600 text-xs'}>
                  {row.links_to_us ? 'links to you' : 'not in referring domains sample'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {activeTab === 'overview' && velocity.length >= 2 && (
        <div className="mb-6 p-4 rounded-xl border border-default bg-brand-800/50">
          <h3 className="text-sm font-bold text-foreground mb-2">Referring domain velocity</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {format('{latest} domains ({delta} vs prior snapshot)', {
              latest: velocity[velocity.length - 1].referringDomains.toLocaleString(),
              delta:
                velocity[velocity.length - 1].referringDomains -
                velocity[velocity.length - 2].referringDomains,
            })}
          </p>
          <div className="flex items-end gap-1 h-16">
            {velocity.map((snap) => {
              const max = Math.max(...velocity.map((s) => s.referringDomains), 1);
              const h = Math.max(4, (snap.referringDomains / max) * 100);
              return (
                <div
                  key={snap.capturedAt}
                  className="flex-1 bg-accent/70 rounded-t"
                  style={{ height: `${h}%` }}
                  title={`${snap.capturedAt}: ${snap.referringDomains}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-bold text-foreground mb-3">{vb.overview.topDomainsTitle}</h3>
            <SortablePaginatedTable
              rows={(gscLinks.top_linking_sites ?? []).slice(0, 10) as Record<string, unknown>[]}
              columns={domainColumns}
              emptyMessage={vb.table.noData}
              paginationLabels={paginationLabels}
            />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground mb-3">{vb.overview.topPagesTitle}</h3>
            <SortablePaginatedTable
              rows={(gscLinks.top_linked_pages ?? []).slice(0, 10) as Record<string, unknown>[]}
              columns={pageColumns}
              emptyMessage={vb.table.noData}
              paginationLabels={paginationLabels}
            />
          </div>
        </div>
      )}

      {activeTab === 'domains' && (
        <>
          <GoogleTableToolbar
            search={domainSearch}
            onSearch={setDomainSearch}
            searchPlaceholder={vb.table.searchDomains}
            onExport={() =>
              exportCsv(
                filteredDomains as Record<string, unknown>[],
                buildDomainExportColumns(vb.table),
                'gsc-referring-domains.csv',
              )
            }
            exportLabel={vb.table.exportCsv}
          />
          <SortablePaginatedTable
            rows={filteredDomains as Record<string, unknown>[]}
            columns={domainColumns}
            emptyMessage={vb.table.noData}
            paginationLabels={paginationLabels}
          />
        </>
      )}

      {activeTab === 'pages' && (
        <>
          <GoogleTableToolbar
            search={pageSearch}
            onSearch={setPageSearch}
            searchPlaceholder={vb.table.searchPages}
            onExport={() =>
              exportCsv(
                filteredPages as Record<string, unknown>[],
                buildLinkedPageExportColumns(vb.table),
                'gsc-linked-pages.csv',
              )
            }
            exportLabel={vb.table.exportCsv}
          />
          <SortablePaginatedTable
            rows={filteredPages as Record<string, unknown>[]}
            columns={pageColumns}
            emptyMessage={vb.table.noData}
            paginationLabels={paginationLabels}
          />
        </>
      )}

      {activeTab === 'anchors' && (
        <>
          <GoogleTableToolbar
            search={anchorSearch}
            onSearch={setAnchorSearch}
            searchPlaceholder={vb.table.searchAnchors}
            onExport={() =>
              exportCsv(
                filteredAnchors as Record<string, unknown>[],
                buildAnchorExportColumns(vb.table),
                'gsc-linking-text.csv',
              )
            }
            exportLabel={vb.table.exportCsv}
          />
          <SortablePaginatedTable
            rows={filteredAnchors as Record<string, unknown>[]}
            columns={anchorColumns}
            emptyMessage={vb.table.noData}
            paginationLabels={paginationLabels}
          />
        </>
      )}

      {activeTab === 'sample' && (
        <>
          <GoogleTableToolbar
            search={sampleSearch}
            onSearch={setSampleSearch}
            searchPlaceholder={vb.table.searchLinks}
            onExport={() =>
              exportCsv(
                filteredSample as Record<string, unknown>[],
                buildSampleLinkExportColumns(vb.table),
                'gsc-sample-links.csv',
              )
            }
            exportLabel={vb.table.exportCsv}
          />
          <SortablePaginatedTable
            rows={filteredSample as Record<string, unknown>[]}
            columns={sampleColumns}
            emptyMessage={vb.table.noData}
            paginationLabels={paginationLabels}
          />
        </>
      )}
    </PageLayout>
  );
}
