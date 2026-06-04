'use client';

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { domainQueryMatchesRow } from '../lib/domainSlug';
import {
  filterKeywordRowsForDomain,
  keywordsPayloadMatchesDomain,
} from '../lib/filterKeywordsForDomain';
import { stripGoogleIfDomainMismatch } from '../lib/filterGoogleForDomain';
import type { KeywordRow } from '@/types';
import { computeReportFingerprintDiff } from '../lib/reportDiff';
import { buildReportCompareSummary } from '../lib/reportCompare';
import { strings } from '../lib/strings';
import { reportApi } from '../lib/publicBase';
import type { ReportContextValue } from './reportContextTypes';
import type {
  CrawlRunRow,
  ReportListRow,
  ReportMetaResponse,
  ReportPayload,
  ReportFingerprintDiff,
} from '@/types/report';
import type { ReportCompareSummary } from '@/lib/reportCompare';

export const ReportContext = createContext<ReportContextValue | null>(null);

interface PayloadApiResponse {
  payload?: ReportPayload;
  error?: string;
}

interface CompareApiResponse {
  summary?: ReportCompareSummary;
  reportDiff?: ReportFingerprintDiff;
  error?: string;
}

function viewNeedsFullComparePayload(pathname: string): boolean {
  return pathname.includes('compare') || pathname.includes('site-structure');
}

interface MetaApiResponse extends Partial<ReportMetaResponse> {
  error?: string;
}

function filterReportsByDomain(
  full: ReportListRow[],
  domainSlug: string | null | undefined,
): ReportListRow[] {
  if (domainSlug == null || domainSlug === '') return full;
  return full.filter((r) => domainQueryMatchesRow(r, domainSlug));
}

function sanitizePayloadForDomain(
  payload: ReportPayload | null,
  domainSlug: string | null | undefined,
): ReportPayload | null {
  if (!payload || !domainSlug) return payload;
  let next = stripGoogleIfDomainMismatch(payload, domainSlug);
  const kw = next.keywords;
  if (!kw || !Array.isArray(kw.rows) || kw.rows.length === 0) return next;
  const rows = kw.rows as KeywordRow[];
  if (keywordsPayloadMatchesDomain(rows, domainSlug)) {
    const filtered = filterKeywordRowsForDomain(rows, domainSlug);
    if (filtered.length === rows.length) return next;
    return {
      ...next,
      keywords: { ...kw, rows: filtered },
    };
  }
  const filtered = filterKeywordRowsForDomain(rows, domainSlug);
  return {
    ...next,
    keywords: {
      ...kw,
      rows: filtered,
      cannibalisation: Array.isArray(kw.cannibalisation) ? kw.cannibalisation : [],
    },
  };
}

function crawlMaps(crawlRuns: CrawlRunRow[]): {
  startUrlByRunId: Map<number, string>;
  runCreatedAtByRunId: Map<number, string>;
} {
  const startUrlByRunId = new Map<number, string>();
  const runCreatedAtByRunId = new Map<number, string>();
  for (const cr of crawlRuns) {
    startUrlByRunId.set(cr.id, cr.start_url || '');
    runCreatedAtByRunId.set(cr.id, cr.created_at || '');
  }
  return { startUrlByRunId, runCreatedAtByRunId };
}

export interface ReportProviderProps {
  children: ReactNode;
  domainSlug?: string | null;
}

export function ReportProvider({ children, domainSlug = null }: ReportProviderProps) {
  const pathname = usePathname();
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportListFull, setReportListFull] = useState<ReportListRow[]>([]);
  const [crawlRuns, setCrawlRuns] = useState<CrawlRunRow[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [compareReportId, setCompareReportId] = useState<number | null>(null);
  const [compareData, setCompareData] = useState<ReportPayload | null>(null);
  const [compareDataLoading, setCompareDataLoading] = useState(false);
  const [compareSummary, setCompareSummary] = useState<ReportCompareSummary | null>(null);
  const [compareSummaryLoading, setCompareSummaryLoading] = useState(false);
  const [serverReportDiff, setServerReportDiff] = useState<ReportFingerprintDiff | null>(null);
  const [crawlPreviewRunId, setCrawlPreviewRunId] = useState<number | null>(null);
  const compareSummaryKeyRef = useRef<string>('');
  const domainSlugRef = useRef(domainSlug);
  domainSlugRef.current = domainSlug;

  const { startUrlByRunId } = useMemo(() => crawlMaps(crawlRuns), [crawlRuns]);

  const scopedList = useMemo(
    () => filterReportsByDomain(reportListFull, domainSlug),
    [reportListFull, domainSlug],
  );

  const reportList = useMemo(() => {
    if (domainSlug == null || domainSlug === '') return reportListFull;
    return scopedList;
  }, [domainSlug, reportListFull, scopedList]);

  const applyPayload = useCallback(async (reportId: number | null) => {
    const scoped = domainSlugRef.current;
    setLoading(true);
    setError(null);
    try {
      const domainQ =
        scoped != null && scoped !== ''
          ? `&domain=${encodeURIComponent(scoped)}`
          : '';
      const url =
        reportId != null
          ? reportApi(`/payload?reportId=${encodeURIComponent(String(reportId))}${domainQ}`)
          : reportApi(scoped ? `/payload?domain=${encodeURIComponent(scoped)}` : '/payload');
      const res = await fetch(url);
      const body = (await res.json().catch(() => ({}))) as PayloadApiResponse;
      if (!res.ok) throw new Error(body.error || res.statusText);
      setData(sanitizePayloadForDomain(body.payload ?? null, scoped));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const allowGlobalFallback =
        msg === 'Report not found' &&
        reportId != null &&
        (scoped == null || scoped === '');
      if (allowGlobalFallback) {
        setSelectedReportId(null);
        try {
          const res = await fetch(
            scoped
              ? reportApi(`/payload?domain=${encodeURIComponent(scoped)}`)
              : reportApi('/payload'),
          );
          const body = (await res.json().catch(() => ({}))) as PayloadApiResponse;
          if (!res.ok) throw new Error(body.error || res.statusText);
          setData(sanitizePayloadForDomain(body.payload ?? null, scoped));
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : String(e2));
        }
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshReports = useCallback(async () => {
    const scoped = domainSlugRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(reportApi('/meta'));
      const body = (await res.json().catch(() => ({}))) as MetaApiResponse;
      if (!res.ok) throw new Error(body.error || res.statusText);

      const reps = Array.isArray(body.reports) ? body.reports : [];
      const cr = Array.isArray(body.crawlRuns) ? body.crawlRuns : [];
      setReportListFull(reps);
      setCrawlRuns(cr);

      setCrawlPreviewRunId(null);

      if (reps.length === 0) {
        setData(null);
        setError((prev) => (
          prev === 'No report_payload in DB' || prev === strings.app.noReportForDomain ? null : prev
        ));
        setLoading(false);
        return;
      }

      const list = scoped ? filterReportsByDomain(reps, scoped) : reps;
      if (scoped && list.length === 0) {
        setError(strings.app.noReportForDomain);
        setData(null);
        setLoading(false);
        return;
      }

      setError((prev) => (prev === strings.app.noReportForDomain ? null : prev));

      const latestId = list[0]?.id ?? null;
      if (latestId != null) {
        setSelectedReportId(latestId);
      }
      await applyPayload(latestId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }, [applyPayload]);

  const loadReport = refreshReports;

  const loadCrawlPreview = useCallback(async (crawlRunId: number | null): Promise<boolean> => {
    if (crawlRunId == null || !Number.isFinite(Number(crawlRunId))) return false;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        reportApi(`/crawl-payload?crawlRunId=${encodeURIComponent(String(crawlRunId))}`),
      );
      const body = (await res.json().catch(() => ({}))) as PayloadApiResponse;
      if (!res.ok) throw new Error(body.error || res.statusText);
      setData(body.payload ?? null);
      setSelectedReportId(null);
      setCrawlPreviewRunId(Number(crawlRunId));
      setCompareReportId(null);
      setCompareData(null);
      setCompareSummary(null);
      setServerReportDiff(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setReportListFull([]);
    setCrawlRuns([]);

    fetch(reportApi('/meta'))
      .then((res) => res.json())
      .then((body: MetaApiResponse) => {
        if (cancelled) return;
        if (body.error) {
          setError(String(body.error));
          setLoading(false);
          return;
        }
        const reps = Array.isArray(body.reports) ? body.reports : [];
        const cr = Array.isArray(body.crawlRuns) ? body.crawlRuns : [];
        setReportListFull(reps);
        setCrawlRuns(cr);
        if (reps.length === 0) setLoading(false);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (crawlPreviewRunId != null) return;
    if (!reportListFull.length && !crawlRuns.length) return;
    if (!reportListFull.length) {
      setLoading(false);
      return;
    }

    if (domainSlug && scopedList.length === 0) {
      setError(strings.app.noReportForDomain);
      setData(null);
      setLoading(false);
      return;
    }

    setError((prev) => (prev === strings.app.noReportForDomain ? null : prev));

    const list = domainSlug ? scopedList : reportListFull;
    const allowedIds = new Set(list.map((r) => r.id));
    let id = selectedReportId;
    if (id == null || !allowedIds.has(id)) {
      id = list[0]?.id ?? null;
      if (id != null && id !== selectedReportId) {
        setSelectedReportId(id);
        return;
      }
    }
    if (id == null) {
      applyPayload(null);
      return;
    }
    applyPayload(id);
  }, [reportListFull, crawlRuns, domainSlug, scopedList, selectedReportId, applyPayload, crawlPreviewRunId]);

  const setSelectedReportIdWrapped = useCallback((id: number | null) => {
    setCrawlPreviewRunId(null);
    setSelectedReportId(id);
  }, []);

  const effectiveReportId = useMemo(() => {
    const list = domainSlug ? scopedList : reportListFull;
    const allowedIds = new Set(list.map((r) => r.id));
    let id = selectedReportId;
    if (id == null || !allowedIds.has(id)) {
      id = list[0]?.id ?? null;
    }
    return id;
  }, [domainSlug, scopedList, reportListFull, selectedReportId]);

  useEffect(() => {
    if (compareReportId == null || effectiveReportId == null) {
      setCompareSummary(null);
      setServerReportDiff(null);
      compareSummaryKeyRef.current = '';
      return;
    }
    const list = domainSlug ? scopedList : reportListFull;
    const allowed = new Set(list.map((r) => r.id));
    if (!allowed.has(compareReportId)) {
      setCompareSummary(null);
      setServerReportDiff(null);
      return;
    }

    const key = `${effectiveReportId}:${compareReportId}`;
    if (compareSummaryKeyRef.current === key) {
      return;
    }
    compareSummaryKeyRef.current = key;

    let cancelled = false;
    setCompareSummaryLoading(true);
    const url = reportApi(
      `/compare?reportId=${encodeURIComponent(String(effectiveReportId))}&baselineId=${encodeURIComponent(String(compareReportId))}`,
    );
    fetch(url)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as CompareApiResponse;
        if (!cancelled && res.ok && body.summary) {
          setCompareSummary(body.summary);
          setServerReportDiff(body.reportDiff ?? null);
        } else if (!cancelled) {
          setCompareSummary(null);
          setServerReportDiff(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCompareSummary(null);
          setServerReportDiff(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCompareSummaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [compareReportId, effectiveReportId, domainSlug, scopedList, reportListFull]);

  const needsFullComparePayload = viewNeedsFullComparePayload(pathname);

  useEffect(() => {
    if (!needsFullComparePayload || compareReportId == null) {
      setCompareData(null);
      setCompareDataLoading(false);
      return;
    }
    const list = domainSlug ? scopedList : reportListFull;
    const allowed = new Set(list.map((r) => r.id));
    if (!allowed.has(compareReportId)) {
      setCompareData(null);
      return;
    }
    let cancelled = false;
    setCompareDataLoading(true);
    fetch(reportApi(`/payload?reportId=${encodeURIComponent(String(compareReportId))}`))
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as PayloadApiResponse;
        if (!cancelled && res.ok && body.payload != null) setCompareData(body.payload);
        else if (!cancelled) setCompareData(null);
      })
      .catch(() => {
        if (!cancelled) setCompareData(null);
      })
      .finally(() => {
        if (!cancelled) setCompareDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needsFullComparePayload, compareReportId, domainSlug, scopedList, reportListFull]);

  useEffect(() => {
    const list = domainSlug ? scopedList : reportListFull;
    const allowed = new Set(list.map((r) => r.id));
    if (compareReportId != null && !allowed.has(compareReportId)) {
      setCompareReportId(null);
    }
  }, [domainSlug, scopedList, reportListFull, compareReportId]);

  const reportDiff = useMemo(() => {
    if (serverReportDiff) return serverReportDiff;
    if (data == null || compareData == null) return null;
    return computeReportFingerprintDiff(data, compareData);
  }, [serverReportDiff, data, compareData]);

  const reportCompare = useMemo(() => {
    if (compareSummary) return compareSummary;
    if (data == null || compareData == null) return null;
    const vo = strings.views.overview;
    const c = strings.views.compare;
    const m = c.metrics;
    return buildReportCompareSummary(
      data,
      compareData,
      {
        totalUrls: vo.totalUrls,
        successRate: vo.successRate,
        count4xx: vo.broken,
        count5xx: m.count5xx,
        healthScore: m.healthScore,
        auditIssues: m.auditIssues,
        securityFindings: m.securityFindings,
        avgPerformance: m.avgPerformance,
        avgSeoScore: m.avgSeoScore,
      },
      {
        linkMetrics: c.linkMetrics,
        content: c.contentMetrics,
        google: c.googleMetrics,
      },
    );
  }, [compareSummary, data, compareData]);

  const contextValue = useMemo<ReportContextValue>(
    () => ({
      data,
      loading,
      error,
      reportList,
      selectedReportId,
      setSelectedReportId: setSelectedReportIdWrapped,
      compareReportId,
      setCompareReportId,
      compareData,
      compareDataLoading,
      reportDiff,
      reportCompare,
      compareSummaryLoading,
      loadReport,
      refreshReports,
      loadCrawlPreview,
      crawlRuns,
      startUrlByRunId,
      domainSlug: domainSlug ?? null,
    }),
    [
      data,
      loading,
      error,
      reportList,
      selectedReportId,
      setSelectedReportIdWrapped,
      compareReportId,
      compareData,
      compareDataLoading,
      reportDiff,
      reportCompare,
      compareSummaryLoading,
      loadReport,
      refreshReports,
      loadCrawlPreview,
      crawlRuns,
      startUrlByRunId,
      domainSlug,
    ],
  );

  return (
    <ReportContext.Provider value={contextValue}>
      {children}
    </ReportContext.Provider>
  );
}
