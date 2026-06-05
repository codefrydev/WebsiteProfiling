'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Link2, Settings2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useReport } from '../context/useReport';
import { strings, format } from '../lib/strings';
import { PageLayout } from '../components';
import SortablePaginatedTable from '../components/google/SortablePaginatedTable';
import GoogleTableToolbar from '../components/google/GoogleTableToolbar';
import GscLinksSummaryCards from '../components/backlinks/GscLinksSummaryCards';
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
  const { data } = useReport();
  const gscLinks = data?.gsc_links;

  const paginationLabels = {
    showingSlice: vb.table.showingSlice,
    pageOf: vb.table.pageOf,
    of: vb.table.of,
    previous: vb.table.previous,
    next: vb.table.next,
    rowsPerPage: vb.table.rowsPerPage,
  };

  const [activeTab, setActiveTab] = useState<BacklinksTabId>('overview');
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
      { key: 'site', label: vb.table.site, render: (v) => <span className="font-mono text-xs">{String(v ?? '')}</span> },
      {
        key: 'link_count',
        label: vb.table.links,
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'target_page_count',
        label: vb.table.targetPages,
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
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'linking_site_count',
        label: vb.table.linkingSites,
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
        render: (v) => (
          <span className="text-sm">{String(v ?? '').trim() || '—'}</span>
        ),
      },
      {
        key: 'link_count',
        label: vb.table.links,
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
    return (
      <PageLayout>
        <div className="max-w-md mx-auto text-center py-16">
          <Link2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-bright mb-2">{vb.emptyTitle}</h2>
          <p className="text-muted-foreground text-sm mb-6">{vb.emptyBody}</p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Settings2 className="h-3.5 w-3.5 shrink-0" />
            {vb.emptyIntegrationsHint}
          </p>
        </div>
      </PageLayout>
    );
  }

  const tabLabels = vb.tabs as Record<BacklinksTabId, string>;

  return (
    <PageLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-bright mb-2 flex items-center gap-2">
          <Link2 className="h-7 w-7 text-link shrink-0" />
          {vb.title}
        </h1>
        <p className="text-muted-foreground">
          {vb.subtitle}
          {headerMeta}
        </p>
        <p className="text-xs text-muted-foreground mt-2 max-w-3xl">{vb.disclaimer}</p>
      </div>

      <GscLinksSummaryCards data={gscLinks} labels={vb.kpi} />

      <div className="border-b border-default mb-6" role="tablist" aria-label={vb.title}>
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              id={`backlinks-tab-btn-${id}`}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-link text-link'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tabLabels[id]}
            </button>
          ))}
        </div>
      </div>

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
