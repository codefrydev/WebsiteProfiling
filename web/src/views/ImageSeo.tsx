
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { useSectionData } from '@/hooks/useSectionData';
import { useSectionsViewReady } from '@/hooks/useSectionsViewReady';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { useActivePropertyContext } from '@/hooks/useActivePropertyContext';
import { PageLayout, PageHeader, Card, ViewTabs, ViewTabPanel, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '@/components';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import ImageAuditSummaryCards, { type ImageAuditSummaryData } from '@/components/imageSeo/ImageAuditSummaryCards';
import { paginateSlice, PAGE_SIZE } from '@/components/google/tableUtils';
import { useUrlTab } from '@/hooks/useUrlTab';
import { fetchAuditTool } from '@/lib/fetchAuditTool';
import { strings } from '@/lib/strings';
import UrlInspectorButton from '@/components/UrlInspectorButton';
import type { ViewProps } from '@/types';

const TABS = ['overview', 'alt', 'lazy', 'dimensions', 'largest', 'unoptimized'] as const;
type TabId = (typeof TABS)[number];

const TAB_TOOLS: Partial<Record<TabId, string>> = {
  alt: 'list_pages_with_missing_alt',
  lazy: 'list_pages_without_lazy_images',
  dimensions: 'list_pages_with_images_missing_dimensions',
  largest: 'list_largest_images',
  unoptimized: 'list_unoptimized_images',
};

function summaryFromApi(raw: Record<string, unknown>): ImageAuditSummaryData {
  const inv = raw.image_inventory_summary as Record<string, unknown> | undefined;
  return {
    pagesMissingAlt: Number(raw.pages_missing_alt) || 0,
    pagesWithoutLazy: Number(raw.pages_without_lazy_images) || 0,
    pagesMissingDimensions: Number(raw.pages_missing_image_dimensions) || 0,
    lighthouseImageDiagnostics: Number(raw.lighthouse_image_diagnostics) || 0,
    imagesTotal: Number(raw.images_total_crawled) || 0,
    ogCoveragePct: raw.og_image_coverage_pct != null ? Number(raw.og_image_coverage_pct) : null,
    ogMissingCount: raw.og_image_missing_count != null ? Number(raw.og_image_missing_count) : null,
    inventoryAvailable: Boolean(raw.image_inventory_available),
    inventoryProbed: inv?.probed != null ? Number(inv.probed) : null,
  };
}

function listRowsFromApi(data: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(data.pages)) return data.pages as Array<Record<string, unknown>>;
  if (Array.isArray(data.items)) return data.items as Array<Record<string, unknown>>;
  return [];
}

export default function ImageSeo({ searchQuery = '' }: ViewProps) {
  const vi = strings.views.imageSeo;
  useSectionData('content');
  const contentReady = useSectionsViewReady(['content']);
  const { propertyId, reportId, contextReady } = useActivePropertyContext();

  const [activeTab, setActiveTab] = useUrlTab(TABS, 'overview');
  const [summary, setSummary] = useState<ImageAuditSummaryData | null>(null);
  const [listRows, setListRows] = useState<Array<Record<string, unknown>>>([]);
  const [listTotal, setListTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const q = (searchQuery || '').toLowerCase().trim();

  useEffect(() => {
    if (!contextReady || !propertyId) return;
    let cancelled = false;
    void fetchAuditTool({ toolName: 'get_image_audit_summary', propertyId, reportId })
      .then((data) => {
        if (!cancelled) setSummary(summaryFromApi(data));
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [contextReady, propertyId, reportId]);

  const loadList = useCallback(async () => {
    const tool = TAB_TOOLS[activeTab];
    if (!contextReady || !tool || !propertyId) {
      setListRows([]);
      setListTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuditTool({
        toolName: tool,
        propertyId,
        reportId,
        args: { limit: 500 },
      });
      if (typeof data.error === 'string' && data.error.trim()) {
        throw new Error(data.error);
      }
      const pages = listRowsFromApi(data);
      setListRows(pages);
      setListTotal(Number(data.total) || pages.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setListRows([]);
      setListTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, contextReady, propertyId, reportId]);

  useEffect(() => {
    if (activeTab === 'overview') return;
    void loadList();
  }, [activeTab, loadList]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, q]);

  const filteredRows = useMemo(() => {
    if (!q) return listRows;
    return listRows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [listRows, q]);

  const pagination = useMemo(
    () => paginateSlice(filteredRows, page, PAGE_SIZE),
    [filteredRows, page],
  );

  const inventoryGated = activeTab === 'largest' || activeTab === 'unoptimized';

  const overviewDevData = useMemo(
    () =>
      summary
        ? {
            widget: 'imageSeo.overview.summary',
            ...summary,
            issueBreakdown: [
              { key: 'pagesMissingAlt', count: summary.pagesMissingAlt },
              { key: 'pagesWithoutLazy', count: summary.pagesWithoutLazy },
              { key: 'pagesMissingDimensions', count: summary.pagesMissingDimensions },
              { key: 'lighthouseImageDiagnostics', count: summary.lighthouseImageDiagnostics },
            ].filter((item) => item.count > 0),
          }
        : { widget: 'imageSeo.overview.summary', loading: true },
    [summary],
  );

  const listTableDevData = useMemo(
    () => ({
      widget: `imageSeo.${activeTab}.table`,
      tab: activeTab,
      tool: TAB_TOOLS[activeTab] ?? null,
      searchQuery: q || null,
      listTotal,
      filteredCount: filteredRows.length,
      page: pagination.page,
      totalPages: pagination.totalPages,
      from: pagination.from,
      to: pagination.to,
      inventoryGated: inventoryGated && summary != null && !summary.inventoryAvailable,
      rows: pagination.slice.map((row) => {
        const url = String(row.url || '');
        const details = Object.fromEntries(
          Object.entries(row).filter(([k]) => k !== 'url'),
        );
        return { url, ...details };
      }),
    }),
    [
      activeTab,
      filteredRows.length,
      inventoryGated,
      listTotal,
      pagination,
      q,
      summary,
    ],
  );

  if (!contentReady) {
    return <ViewSectionLoading title={vi.title} />;
  }

  return (
    <PageLayout>
      <PageHeader
        title={vi.title}
        subtitle={vi.subtitle}
        icon={<ImageIcon className="h-7 w-7 text-link shrink-0" />}
      />
      <p className="text-xs text-muted-foreground mb-4 -mt-2">
        {vi.galleryLinkPrefix}{' '}
        <Link to="/gallery" className="text-link hover:underline">
          {vi.galleryLinkLabel}
        </Link>
      </p>

      <ViewTabs
        tabs={[
          { id: 'overview', label: vi.tabOverview },
          { id: 'alt', label: vi.tabAlt },
          { id: 'lazy', label: vi.tabLazy },
          { id: 'dimensions', label: vi.tabDimensions },
          { id: 'largest', label: vi.tabLargest },
          { id: 'unoptimized', label: vi.tabUnoptimized },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        ariaLabel={vi.title}
        idPrefix="image-seo"
      />

      {activeTab === 'overview' ? (
      <ViewTabPanel idPrefix="image-seo" tabId="overview">
        {summary ? (
          <div className="relative group/dev-card">
            <DevCopyJsonButton data={overviewDevData} />
            <ImageAuditSummaryCards data={summary} />
          </div>
        ) : (
          <Card className="p-8 text-center text-sm text-muted-foreground">{strings.app.loading}</Card>
        )}
      </ViewTabPanel>
      ) : null}

      {(['alt', 'lazy', 'dimensions', 'largest', 'unoptimized'] as const).map((tabId) =>
        activeTab === tabId ? (
        <ViewTabPanel key={tabId} idPrefix="image-seo" tabId={tabId}>
          {inventoryGated && tabId === activeTab && summary && !summary.inventoryAvailable ? (
            <Card className="p-6 border-amber-500/30 bg-amber-500/5">
              <p className="text-sm text-foreground">{vi.inventoryRequiredHint}</p>
            </Card>
          ) : loading ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">{strings.app.loading}</Card>
          ) : error ? (
            <Card className="p-6 text-sm text-red-400">{error}</Card>
          ) : filteredRows.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">{vi.emptyList}</Card>
          ) : (
            <Card className="overflow-hidden" devData={listTableDevData}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>{vi.colUrl}</TableHeadCell>
                    <TableHeadCell>{vi.colDetails}</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagination.slice.map((row, i) => {
                    const url = String(row.url || '');
                    const detail = Object.entries(row)
                      .filter(([k]) => k !== 'url')
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ');
                    return (
                      <TableRow key={`${url}-${i}`}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs break-all">{url}</span>
                            {url ? <UrlInspectorButton url={url} /> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{detail || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="px-4 py-2 text-xs text-muted-foreground border-t border-default">
                {vi.pageOf} {pagination.from}–{pagination.to} {vi.of} {listTotal}
              </p>
            </Card>
          )}
        </ViewTabPanel>
        ) : null,
      )}
    </PageLayout>
  );
}
