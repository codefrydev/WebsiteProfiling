
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link2, Settings2, Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
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
import { PageLayout, PageHeader, ViewTabs, EmptyState, Card, AlertBanner, HelpHint } from '../components';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import SortablePaginatedTable from '../components/google/SortablePaginatedTable';
import GoogleTableToolbar from '../components/google/GoogleTableToolbar';
import GscLinksSummaryCards from '../components/backlinks/GscLinksSummaryCards';
import BacklinksVelocityChart from '../components/backlinks/BacklinksVelocityChart';
import {
  filterBacklinkAnchors,
  filterBacklinkDomains,
  filterBacklinkPages,
  filterBacklinkSample,
} from '../components/backlinks/backlinksSearch';
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
  hasGscLinksExportType,
  summaryCounts,
} from '../components/backlinks/backlinksTableUtils';
import { buildLinksInspectHref } from '../lib/reportNav';
import type { TableColumn } from '@/types/components';
import type { ViewProps } from '@/types';

const TABS = ['overview', 'domains', 'pages', 'anchors', 'sample'] as const;
type BacklinksTabId = (typeof TABS)[number];

export default function Backlinks({ searchQuery = '' }: ViewProps) {
  const vb = strings.views.backlinks;
  const [searchParams] = useSearchParams();
  const q = (searchQuery || '').trim();
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
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (!cancelled) setVelocity([]);
          return;
        }
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

  const filteredDomains = useMemo(() => {
    const local = filterBySearch(gscLinks?.top_linking_sites ?? [], domainSearch, 'site');
    return filterBacklinkDomains(local, q);
  }, [gscLinks?.top_linking_sites, domainSearch, q]);
  const filteredPages = useMemo(() => {
    const local = filterBySearch(gscLinks?.top_linked_pages ?? [], pageSearch, 'target_page');
    return filterBacklinkPages(local, q);
  }, [gscLinks?.top_linked_pages, pageSearch, q]);
  const filteredAnchors = useMemo(() => {
    const local = filterBySearch(gscLinks?.top_linking_text ?? [], anchorSearch, 'anchor_text');
    return filterBacklinkAnchors(local, q);
  }, [gscLinks?.top_linking_text, anchorSearch, q]);
  const allSample = useMemo(() => combinedSampleLinks(gscLinks), [gscLinks]);
  const hasSampleExport = hasGscLinksExportType(gscLinks, 'sample_links');
  const hasLatestExport = hasGscLinksExportType(gscLinks, 'latest_links');
  const sampleTabHint =
    !hasSampleExport && !hasLatestExport ? vb.sampleTabNotImported : vb.table.noData;
  const filteredSample = useMemo(() => {
    const local = (() => {
      const query = sampleSearch.trim().toLowerCase();
      if (!query) return allSample;
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
        return hay.includes(query);
      });
    })();
    return filterBacklinkSample(local, q);
  }, [allSample, sampleSearch, q]);

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

  const kpiDevData = useMemo(
    () => ({
      widget: 'backlinks.kpiSummary',
      importedAt: gscLinks?.imported_at ?? null,
      exportTypes: gscLinks?.export_types ?? [],
      ...summaryCounts(gscLinks),
    }),
    [gscLinks],
  );

  const bingDevData = useMemo(
    () => ({
      widget: 'backlinks.overview.bing',
      ok: bingBacklinks?.ok ?? false,
      linkedPageCount: bingBacklinks?.linked_page_count ?? null,
      totalInboundLinks: bingBacklinks?.total_inbound_links ?? null,
      linkedPages: (bingBacklinks?.linked_pages ?? []).slice(0, 8).map((row) => ({
        url: row.url,
        inbound_links: row.inbound_links ?? null,
      })),
    }),
    [bingBacklinks],
  );

  const competitorGapDevData = useMemo(
    () => ({
      widget: 'backlinks.overview.competitorGap',
      provenance: competitorGap?.provenance ?? null,
      competitors: (competitorGap?.competitors ?? []) as Array<{
        competitor?: string;
        links_to_us?: boolean;
      }>,
    }),
    [competitorGap],
  );

  const velocityDevData = useMemo(
    () => ({
      widget: 'backlinks.overview.velocity',
      snapshots: velocity,
    }),
    [velocity],
  );

  const overviewTopDomainsDevData = useMemo(
    () => ({
      widget: 'backlinks.overview.topDomains',
      rows: (gscLinks?.top_linking_sites ?? []).slice(0, 10),
    }),
    [gscLinks?.top_linking_sites],
  );

  const overviewTopPagesDevData = useMemo(
    () => ({
      widget: 'backlinks.overview.topPages',
      rows: (gscLinks?.top_linked_pages ?? []).slice(0, 10),
    }),
    [gscLinks?.top_linked_pages],
  );

  const domainsTableDevData = useMemo(
    () => ({
      widget: 'backlinks.domains.table',
      searchQuery: domainSearch || null,
      rowCount: filteredDomains.length,
      rows: filteredDomains,
    }),
    [domainSearch, filteredDomains],
  );

  const pagesTableDevData = useMemo(
    () => ({
      widget: 'backlinks.pages.table',
      searchQuery: pageSearch || null,
      rowCount: filteredPages.length,
      rows: filteredPages,
    }),
    [filteredPages, pageSearch],
  );

  const anchorsTableDevData = useMemo(
    () => ({
      widget: 'backlinks.anchors.table',
      searchQuery: anchorSearch || null,
      rowCount: filteredAnchors.length,
      rows: filteredAnchors,
    }),
    [anchorSearch, filteredAnchors],
  );

  const sampleTableDevData = useMemo(
    () => ({
      widget: 'backlinks.sample.table',
      searchQuery: sampleSearch || null,
      hasSampleExport,
      hasLatestExport,
      rowCount: filteredSample.length,
      rows: filteredSample,
    }),
    [filteredSample, hasLatestExport, hasSampleExport, sampleSearch],
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
  const kpiCounts = summaryCounts(gscLinks);

  const backlinksTabItems = TABS.map((id) => ({
    id,
    label: tabLabels[id],
    badge:
      id === 'domains' && kpiCounts.referringDomains > 0
        ? kpiCounts.referringDomains
        : id === 'pages' && kpiCounts.linkedPages > 0
          ? kpiCounts.linkedPages
          : id === 'sample' && allSample.length > 0
            ? allSample.length
            : null,
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
          </>
        }
      />

      <div className="relative group/dev-card">
        <DevCopyJsonButton data={kpiDevData} />
        <p className="text-xs text-muted-foreground mb-3">
          <HelpHint title="Data scope">{vb.disclaimerHint}</HelpHint>
        </p>
        <GscLinksSummaryCards data={gscLinks} labels={vb.kpi} />
      </div>

      <ViewTabs
        tabs={backlinksTabItems}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as BacklinksTabId)}
        ariaLabel={vb.title}
        idPrefix="backlinks"
      />

      {q ? (
        <p className="text-xs text-muted-foreground -mt-4">{vb.searchFilterHint}</p>
      ) : null}

      {activeTab === 'overview' && bingBacklinks?.ok ? (
        <Card className="mb-6" devData={bingDevData}>
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
        </Card>
      ) : null}

      {activeTab === 'overview' ? (
        <AlertBanner
          variant="info"
          collapsible
          defaultOpen={false}
          title={vb.importsSectionTitle}
          className="mb-6"
        >
          <div className="space-y-4">
            <ThirdPartyLinksImport gscLinks={gscLinks} onImported={() => void loadReport()} />
            {gscLinks ? <CompetitorGapImport gscLinks={gscLinks} /> : null}
          </div>
        </AlertBanner>
      ) : null}

      {activeTab === 'overview' && competitorGap?.competitors?.length ? (
        <Card className="mb-6" devData={competitorGapDevData}>
          <h3 className="text-sm font-bold text-foreground mb-2">{vb.competitorGapTitle}</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {format(vb.competitorGapProvenance, {
              provenance: competitorGap.provenance || 'Search Console',
            })}
          </p>
          <ul className="text-sm space-y-1">
            {(competitorGap.competitors as Array<{ competitor?: string; links_to_us?: boolean }>).map((row) => (
              <li key={row.competitor} className="flex items-center gap-2">
                <span className="font-mono text-xs">{row.competitor}</span>
                <span className={row.links_to_us ? 'text-emerald-600 text-xs' : 'text-amber-600 text-xs'}>
                  {row.links_to_us ? vb.linksToYou : vb.notInSample}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {activeTab === 'overview' && velocity.length >= 2 ? (
        <BacklinksVelocityChart snapshots={velocity} devData={velocityDevData} />
      ) : null}

      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card devData={overviewTopDomainsDevData}>
            <h3 className="text-sm font-bold text-foreground mb-3">{vb.overview.topDomainsTitle}</h3>
            <SortablePaginatedTable
              rows={(gscLinks.top_linking_sites ?? []).slice(0, 10) as Record<string, unknown>[]}
              columns={domainColumns}
              emptyMessage={vb.table.noData}
              paginationLabels={paginationLabels}
            />
            <button
              type="button"
              onClick={() => setActiveTab('domains')}
              className="mt-3 text-xs text-link hover:underline"
            >
              {vb.overview.viewAllDomains}
            </button>
          </Card>
          <Card devData={overviewTopPagesDevData}>
            <h3 className="text-sm font-bold text-foreground mb-3">{vb.overview.topPagesTitle}</h3>
            <SortablePaginatedTable
              rows={(gscLinks.top_linked_pages ?? []).slice(0, 10) as Record<string, unknown>[]}
              columns={pageColumns}
              emptyMessage={vb.table.noData}
              paginationLabels={paginationLabels}
            />
            <button
              type="button"
              onClick={() => setActiveTab('pages')}
              className="mt-3 text-xs text-link hover:underline"
            >
              {vb.overview.viewAllPages}
            </button>
          </Card>
        </div>
      )}

      {activeTab === 'domains' && (
        <div className="relative group/dev-card space-y-4">
          <DevCopyJsonButton data={domainsTableDevData} />
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
        </div>
      )}

      {activeTab === 'pages' && (
        <div className="relative group/dev-card space-y-4">
          <DevCopyJsonButton data={pagesTableDevData} />
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
        </div>
      )}

      {activeTab === 'anchors' && (
        <div className="relative group/dev-card space-y-4">
          <DevCopyJsonButton data={anchorsTableDevData} />
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
        </div>
      )}

      {activeTab === 'sample' && (
        <div className="relative group/dev-card space-y-4">
          <DevCopyJsonButton data={sampleTableDevData} />
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
            emptyMessage={sampleTabHint}
            paginationLabels={paginationLabels}
          />
        </div>
      )}
    </PageLayout>
  );
}
