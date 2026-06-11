'use client';

import { useState, useMemo, useEffect, useRef, useCallback, type MouseEvent } from 'react';
import { Link as LinkIcon, ArrowLeft, AlertTriangle, Download, List, TextQuote } from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { PageLayout, PageHeader, Card, Button, AlertBanner, ViewTabs } from '../components';
import type { ViewTabItem } from '../components';
import { useUrlTab } from '@/hooks/useUrlTab';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type {
  InspectorBrokenItem,
  InspectorCategoryIssue,
  InspectorDetails,
  InspectorRedirectItem,
  InspectorSecurityFinding,
  InspectorSeoIssue,
  LinkLighthouseData,
  ReportIssue,
  ReportLink,
  ViewProps,
} from '@/types';

import { CopyBtn, InspectorTabs } from '../components/links';
import {
  type LinkSortKey,
  LinksExplorerAnchorsTab,
  LinksExplorerTableTab,
} from '../components/links/explorer';
import {
  CONTENT_URL_KEYS, CONTENT_LABELS, CONTENT_RECOMMENDATIONS,
  SEO_ISSUE_RECOMMENDATIONS,
} from '../utils/linkUtils';
import type { LinksFilterValues } from '../components/links/LinksFilterBar';
import { linkHasBrowserErrors } from '@/lib/browserErrors';
import { browserInspectorIssueRows } from '@/components/browser/BrowserDiagnosticsPanel';
import { exportLinksCsv } from '@/utils/linkExport';
import { useOptionalPipeline } from '../context/PipelineContext';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import { buildTechnicalLinkIssueContext } from '@/lib/fixSuggestionContext';
import { crawledUrlCount } from '@/lib/crawlCounts';

const EXPLORER_TABS = ['urls', 'anchors'] as const;
type ExplorerTabId = (typeof EXPLORER_TABS)[number];

const INSPECTOR_TABS = [
  'overview',
  'analysis',
  'search',
  'seo',
  'content',
  'technical',
  'issues',
] as const;

function normalizeForCompare(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/$/, '') || '/'}`;
  } catch {
    return (url || '').toLowerCase().replace(/\/$/, '');
  }
}

function resolveInspectUrl(inspectParam: string, links: ReportLink[]): string | null {
  const exact = links.find((l) => l.url === inspectParam);
  if (exact) return exact.url;
  const normTarget = normalizeForCompare(inspectParam);
  const normMatch = links.find((l) => normalizeForCompare(l.url) === normTarget);
  return normMatch?.url ?? null;
}

export default function Links({ searchQuery = '' }: ViewProps) {
  const vl = strings.views.links;
  const sj = strings.common;
  const { data } = useReport();
  const pipeline = useOptionalPipeline();
  const propertyId = Number(pipeline?.configState.active_property_id || 0);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [sortBy, setSortBy] = useState<LinkSortKey>('inlinks');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const perPage = 20;

  const [statusFilter, setStatusFilter] = useState(sj.all);
  const [inlinksFilter, setInlinksFilter] = useState(sj.all);
  const [rtFilter, setRtFilter] = useState(sj.all);
  const [wcFilter, setWcFilter] = useState(sj.all);
  const [jsErrorFilter, setJsErrorFilter] = useState(sj.all);

  const [inspectNotFound, setInspectNotFound] = useState(false);

  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const tableRef = useRef<HTMLDivElement | null>(null);

  const links = useMemo(() => data?.links || [], [data]);
  const crawledCount = useMemo(() => crawledUrlCount(data), [data]);

  const hasLinkAttributes = Boolean(
    data?.link_rel_summary || (data?.inlink_anchor_matrix?.length ?? 0) > 0,
  );

  const explorerValidTabs = useMemo((): readonly ExplorerTabId[] => {
    if (hasLinkAttributes) return EXPLORER_TABS;
    return ['urls'];
  }, [hasLinkAttributes]);

  const [explorerTab, setExplorerTab] = useUrlTab(explorerValidTabs, 'urls');

  const linkAttributeLabels = useMemo(
    () => ({
      title: vl.linkAttributesTitle ?? 'Link attributes',
      total: vl.linkAttrTotal ?? 'Total links',
      internal: vl.linkAttrInternal ?? 'Internal',
      nofollow: vl.linkAttrNofollow ?? 'Nofollow internal',
      sponsored: vl.linkAttrSponsored ?? 'Sponsored internal',
      external: vl.linkAttrExternal ?? 'External',
      anchorMatrix: vl.inlinkAnchorMatrix ?? 'Inlink anchor text',
      target: vl.inlinkTarget ?? 'Target URL',
      anchor: vl.inlinkAnchor ?? 'Anchor text',
      inlinks: vl.inlinkCount ?? 'Inlinks',
      follow: vl.linkAttrFollow ?? 'Follow internal',
      ugc: vl.linkAttrUgc ?? 'UGC internal',
    }),
    [vl],
  );

  const explorerTabItems = useMemo((): ViewTabItem[] => {
    const items: ViewTabItem[] = [
      {
        id: 'urls',
        label: vl.tabs.urls,
        icon: <List className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        badge: crawledCount > 0 ? crawledCount : null,
      },
    ];
    if (hasLinkAttributes) {
      items.push({
        id: 'anchors',
        label: vl.tabs.anchors,
        icon: <TextQuote className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        badge: data?.inlink_anchor_matrix?.length ?? null,
      });
    }
    return items;
  }, [vl.tabs, crawledCount, hasLinkAttributes, data?.inlink_anchor_matrix?.length]);

  const inspectParam = searchParams.get('inspect');
  const tabParam = searchParams.get('tab');

  const matchedInspectUrl = useMemo(() => {
    if (!inspectParam || !links.length) return null;
    return resolveInspectUrl(inspectParam, links);
  }, [inspectParam, links]);

  const inInspector = matchedInspectUrl != null;
  const inspectorUrl = inInspector ? matchedInspectUrl : null;

  const inspectorTab = useMemo(() => {
    if (!inInspector || !inspectorUrl) return 'overview';
    if (tabParam && (INSPECTOR_TABS as readonly string[]).includes(tabParam)) {
      return tabParam;
    }
    const link = links.find((l) => l.url === inspectorUrl);
    if (link && linkHasBrowserErrors(link)) return 'analysis';
    return 'overview';
  }, [inInspector, inspectorUrl, tabParam, links]);

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  useEffect(() => {
    if (!inspectParam) {
      setInspectNotFound(false);
      return;
    }
    if (!links.length) return;
    setInspectNotFound(!matchedInspectUrl);
  }, [inspectParam, links.length, matchedInspectUrl]);

  const openInspector = useCallback(
    (url: string, initialTab: string) => {
      replaceParams((params) => {
        params.set('inspect', url);
        params.set('tab', initialTab);
      });
    },
    [replaceParams],
  );

  const setInspectorTab = useCallback(
    (tab: string, section?: string) => {
      replaceParams((params) => {
        params.set('tab', tab);
        if (tab === 'analysis' && section) {
          params.set('section', section);
        } else {
          params.delete('section');
        }
      });
    },
    [replaceParams],
  );

  const closeInspector = useCallback(() => {
    setInspectNotFound(false);
    replaceParams((params) => {
      params.delete('inspect');
      params.delete('tab');
      params.delete('section');
    });
  }, [replaceParams]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && inInspector) closeInspector();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inInspector, closeInspector]);

  const filtered = useMemo(() => {
    let list = [...links];
    if (statusFilter !== sj.all) list = list.filter((l) => String(l.status) === statusFilter);
    if (inlinksFilter === 'Orphans') list = list.filter((l) => (l.inlinks ?? 0) === 0);
    if (rtFilter === 'Fast') list = list.filter((l) => (l.response_time_ms ?? 0) < 500);
    if (rtFilter === 'Slow') list = list.filter((l) => (l.response_time_ms ?? 0) > 2000);
    if (wcFilter === 'Thin')   list = list.filter((l) => (l.word_count ?? 0) < 300);
    if (wcFilter === 'Medium') list = list.filter((l) => { const w = l.word_count ?? 0; return w >= 300 && w < 1000; });
    if (wcFilter === 'Long')   list = list.filter((l) => (l.word_count ?? 0) >= 1000);
    if (jsErrorFilter === 'Has errors') list = list.filter((l) => linkHasBrowserErrors(l));
    if (jsErrorFilter === 'Clean') list = list.filter((l) => !linkHasBrowserErrors(l));
    const q = (searchQuery || '').toLowerCase().trim();
    if (q) {
      list = list.filter((l) => {
        const url = (l.url || '').toLowerCase();
        const title = (l.title || '').toLowerCase();
        return url.includes(q) || title.includes(q) || String(l.status ?? '').includes(q);
      });
    }
    list.sort((a, b) => {
      let va: string | number = (a[sortBy] ?? '') as string | number;
      let vb: string | number = (b[sortBy] ?? '') as string | number;
      if (sortBy === 'depth') {
        va = va != null && va !== '' ? Number(va) : -1;
        vb = vb != null && vb !== '' ? Number(vb) : -1;
        return sortDesc ? Number(vb) - Number(va) : Number(va) - Number(vb);
      }
      if (typeof va === 'string') {
        va = va.toLowerCase();
        vb = String(vb ?? '').toLowerCase();
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDesc ? -cmp : cmp;
    });
    return list;
  }, [links, statusFilter, inlinksFilter, rtFilter, wcFilter, jsErrorFilter, searchQuery, sortBy, sortDesc, sj.all]);

  const maxInlinksInResults = useMemo(() => {
    if (!filtered.length) return 1;
    let m = 0;
    for (const l of filtered) m = Math.max(m, l.inlinks ?? 0);
    return Math.max(1, m);
  }, [filtered]);

  const inspectorDetails = useMemo((): InspectorDetails | null => {
    if (!inspectorUrl || !data) return null;
    const url = inspectorUrl;
    const issues = data.issues || {};
    const broken = (issues.broken || [])
      .filter((item) => item.url === url)
      .map((item): InspectorBrokenItem => ({ url: item.url ?? url, status: item.status }));
    const redirects = (issues.redirects || [])
      .filter((item) => item.url === url)
      .map((item): InspectorRedirectItem => ({
        url: item.url ?? url,
        status: item.status,
        final_url: typeof item.final_url === 'string' ? item.final_url : undefined,
      }));
    const seoIssues = (issues.seo || [])
      .filter((item) => item.url === url)
      .map((item): InspectorSeoIssue => ({
        url: item.url ?? url,
        type: item.type,
        message: item.message,
      }));
    const categoryIssues: InspectorCategoryIssue[] = [];
    (data.categories || []).forEach((cat) => {
      (cat.issues || []).forEach((iss: ReportIssue) => {
        if (iss.url === url) {
          categoryIssues.push({
            category: cat.name || cat.id || '',
            url: iss.url,
            priority: iss.priority,
            message: iss.message,
            recommendation: iss.recommendation,
          });
        }
      });
    });
    const contentUrls = data.content_urls || {};
    const contentFlags: Array<{ type: string; label: string; detail: string | null; recommendation: string }> = [];
    CONTENT_URL_KEYS.forEach((key) => {
      const arr = contentUrls[key] || [];
      const entry = arr.find((item) => item.url === url);
      if (entry) {
        let detail: string | null = null;
        if (key === 'meta_desc_short' || key === 'meta_desc_long') detail = `${entry.meta_desc_len ?? 0} chars`;
        if (key === 'thin_content') detail = `${entry.content_length ?? 0} chars`;
        if (key === 'multiple_h1') detail = `${entry.h1_count ?? 0} H1s`;
        contentFlags.push({
          type: key,
          label: CONTENT_LABELS[key as keyof typeof CONTENT_LABELS] || key,
          detail,
          recommendation: CONTENT_RECOMMENDATIONS[key as keyof typeof CONTENT_RECOMMENDATIONS] || '',
        });
      }
    });
    const securityFindings: InspectorSecurityFinding[] = (data.security_findings || [])
      .filter((item) => item.url === url)
      .map((f) => ({
        url: f.url,
        severity: f.severity,
        message: f.message,
        recommendation: f.recommendation,
      }));
    const allRecommendations = new Set<string>();
    seoIssues.forEach((iss) => {
      const rec = SEO_ISSUE_RECOMMENDATIONS[iss.type as keyof typeof SEO_ISSUE_RECOMMENDATIONS];
      if (rec) allRecommendations.add(rec);
    });
    contentFlags.forEach((f) => { if (f.recommendation) allRecommendations.add(f.recommendation); });
    categoryIssues.forEach((iss) => { if (iss.recommendation) allRecommendations.add(iss.recommendation); });
    securityFindings.forEach((f) => { if (f.recommendation) allRecommendations.add(f.recommendation); });
    const linkForIssues = links.find((l) => l.url === url);
    const browserIssues = browserInspectorIssueRows(
      linkForIssues?.page_analysis && typeof linkForIssues.page_analysis === 'object'
        ? linkForIssues.page_analysis.browser
        : undefined,
    );
    browserIssues.forEach((iss) => { if (iss.recommendation) allRecommendations.add(iss.recommendation); });
    return {
      broken,
      redirects,
      seoIssues,
      categoryIssues,
      contentFlags,
      securityFindings,
      browserIssues,
      recommendations: [...allRecommendations],
    } as InspectorDetails;
  }, [inspectorUrl, data, links]);

  const siteTechnicalIssues = useMemo(() => {
    const q = (searchQuery || '').toLowerCase().trim();
    const issues = data?.issues || {};
    const rows: Array<{ message: string; url: string; kind: string }> = [];
    (issues.broken || []).forEach((item) => {
      const url = String(item.url || '');
      const message = `Broken link (${item.status ?? 'error'})`;
      if (!q || `${url} ${message}`.toLowerCase().includes(q)) {
        rows.push({ message, url, kind: 'broken_link' });
      }
    });
    (issues.redirects || []).forEach((item) => {
      const url = String(item.url || '');
      const message = `Redirect ${item.status ?? ''} → ${item.final_url || ''}`.trim();
      if (!q || `${url} ${message}`.toLowerCase().includes(q)) {
        rows.push({ message, url, kind: 'redirect' });
      }
    });
    return rows.slice(0, 40);
  }, [data?.issues, searchQuery]);

  const handleRowMouseEnter = useCallback((e: MouseEvent<HTMLTableRowElement>, link: ReportLink) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const containerRect = tableRef.current?.getBoundingClientRect?.() || { top: 0, left: 0, width: 800 };
    setTooltipPos({
      top: rect.top - containerRect.top + rect.height + 4,
      left: Math.min(rect.left - containerRect.left, (containerRect.width || 800) - 290),
    });
    setHoveredRow(link.url);
  }, []);

  if (!data) return null;

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageLinks = filtered.slice((page - 1) * perPage, page * perPage);

  const toggleSort = (key: string) => {
    const sortKey = key as LinkSortKey;
    if (sortBy === sortKey) setSortDesc((d) => !d);
    else {
      setSortBy(sortKey);
      setSortDesc(['inlinks', 'depth', 'response_time_ms', 'word_count'].includes(sortKey));
    }
    setPage(1);
  };

  const filterValues: LinksFilterValues = {
    inlinksFilter,
    statusFilter,
    rtFilter,
    wcFilter,
    jsErrorFilter,
  };

  const handleFilterChange = (key: keyof LinksFilterValues, value: string) => {
    if (key === 'inlinksFilter') setInlinksFilter(value);
    if (key === 'statusFilter') setStatusFilter(value);
    if (key === 'rtFilter') setRtFilter(value);
    if (key === 'wcFilter') setWcFilter(value);
    if (key === 'jsErrorFilter') setJsErrorFilter(value);
    setPage(1);
  };

  const clearAllFilters = () => {
    setInlinksFilter(sj.all);
    setStatusFilter(sj.all);
    setRtFilter(sj.all);
    setWcFilter(sj.all);
    setJsErrorFilter(sj.all);
    setPage(1);
  };

  const loadSavedFilter = (values: LinksFilterValues) => {
    setInlinksFilter(values.inlinksFilter);
    setStatusFilter(values.statusFilter);
    setRtFilter(values.rtFilter);
    setWcFilter(values.wcFilter);
    setJsErrorFilter(values.jsErrorFilter);
    setPage(1);
  };

  const linkForInspector = inspectorUrl ? (links.find((l) => l.url === inspectorUrl) || null) : null;

  return (
    <PageLayout className="flex flex-col gap-4">
      {data?.crawl_only_preview ? (
        <AlertBanner variant="warning">{vl.crawlPreviewBanner}</AlertBanner>
      ) : null}
      {inspectNotFound && (
        <AlertBanner
          variant="warning"
          icon={<AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" aria-hidden />}
          onDismiss={() => setInspectNotFound(false)}
        >
          {strings.components?.urlGapLists?.notInCrawlBanner || 'This URL was reported by Google but isn\'t in the crawl. Inspector data is limited.'}
        </AlertBanner>
      )}
      {!inInspector ? (
        <>
          <PageHeader
            title={vl.title}
            subtitle={
              <>
                {vl.showingResults}{' '}
                <span className="font-bold text-bright">{filtered.length.toLocaleString()}</span> {vl.resultsSuffix}
                <span className="block text-sm mt-2 max-w-3xl leading-relaxed">{vl.explorerHint}</span>
              </>
            }
            className="mb-0"
            actions={
              explorerTab === 'urls' && filtered.length > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => exportLinksCsv(filtered)}
                  className="inline-flex items-center gap-2"
                >
                  <Download className="h-4 w-4 shrink-0" aria-hidden />
                  {vl.exportCsv}
                </Button>
              ) : undefined
            }
          />

          <ViewTabs
            tabs={explorerTabItems}
            activeTab={explorerTab}
            onChange={(id) => setExplorerTab(id as ExplorerTabId)}
            ariaLabel={vl.title}
            idPrefix="links-explorer"
          />

          {siteTechnicalIssues.length > 0 ? (
            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-bold text-foreground">{vl.siteTechnicalIssuesTitle}</h2>
              <p className="text-xs text-muted-foreground">{vl.siteTechnicalIssuesHint}</p>
              <ul className="space-y-3 max-h-64 overflow-y-auto">
                {siteTechnicalIssues.map((row, i) => (
                  <li key={`${row.url}-${row.kind}-${i}`} className="border border-default rounded-lg px-3 py-2 space-y-2">
                    <div className="text-xs font-mono text-link break-all">{row.url}</div>
                    <div className="text-xs text-muted-foreground">{row.message}</div>
                    <AiSuggestionButton request={buildTechnicalLinkIssueContext(row.message, row.url, row.kind)} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {explorerTab === 'urls' ? (
          <LinksExplorerTableTab
            filterValues={filterValues}
            onFilterChange={handleFilterChange}
            onClearAllFilters={clearAllFilters}
            propertyId={propertyId}
            onLoadSavedFilter={loadSavedFilter}
            searchQuery={searchQuery}
            filtered={filtered}
            pageLinks={pageLinks}
            links={links}
            page={page}
            totalPages={totalPages}
            sortBy={sortBy}
            sortDesc={sortDesc}
            onToggleSort={toggleSort}
            onPagePrev={() => setPage((p) => Math.max(1, p - 1))}
            onPageNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            maxInlinksInResults={maxInlinksInResults}
            onInspect={openInspector}
            hoveredRow={hoveredRow}
            tooltipPos={tooltipPos}
            tableRef={tableRef}
            onRowMouseEnter={handleRowMouseEnter}
            onRowMouseLeave={() => setHoveredRow(null)}
          />
          ) : (
            <LinksExplorerAnchorsTab
              summary={data?.link_rel_summary}
              anchors={data?.inlink_anchor_matrix}
              labels={linkAttributeLabels}
            />
          )}
        </>
      ) : (
        <>
          <div className="flex justify-between items-center flex-wrap gap-4">
            <Button variant="secondary" onClick={closeInspector} className="inline-flex items-center gap-2 text-foreground">
              <ArrowLeft className="h-4 w-4" /> {vl.backToExplorer}
            </Button>
            <h1 className="text-2xl font-bold text-bright flex items-center gap-2">
              <LinkIcon className="h-6 w-6 text-blue-500 shrink-0" /> {vl.urlInspector}
            </h1>
          </div>
          <div className="flex items-center gap-2 bg-brand-900 border border-default p-3 rounded-xl">
            <span className="font-mono text-link text-sm break-all flex-1">{matchedInspectUrl}</span>
            <CopyBtn text={matchedInspectUrl} className="shrink-0" />
            <a href={matchedInspectUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-bright transition-colors shrink-0">
              <LinkIcon className="h-4 w-4" />
            </a>
          </div>
          <Card padding="none" overflowHidden className="flex flex-col min-h-[min(400px,60vh)]">
            {linkForInspector ? (
              <InspectorTabs
                link={linkForInspector}
                lhData={(data.lighthouse_by_url?.[matchedInspectUrl] ?? null) as LinkLighthouseData | null}
                inspectorDetails={inspectorDetails}
                activeTab={inspectorTab}
                onTabChange={setInspectorTab}
              />
            ) : (
              <div className="p-8 text-center text-muted-foreground">{vl.noUrlData}</div>
            )}
          </Card>
        </>
      )}
    </PageLayout>
  );
}
