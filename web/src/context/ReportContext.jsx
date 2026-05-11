'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { domainQueryMatchesRow } from '../lib/domainSlug';
import { computeReportFingerprintDiff } from '../lib/reportDiff';
import { strings } from '../lib/strings';
import { reportApi } from '../lib/publicBase';
import { ReportContext } from './reportContext';

/**
 * @param {Array<{ id: number, generated_at: string, site_name: string, canonical_domain?: string }>} full
 * @param {string | null} domainSlug
 */
function filterReportsByDomain(full, domainSlug) {
  if (domainSlug == null || domainSlug === '') return full;
  return full.filter((r) => domainQueryMatchesRow(r, domainSlug));
}

/** @param {Array<{ id: number, start_url: string, created_at: string }>} crawlRuns */
function crawlMaps(crawlRuns) {
  const startUrlByRunId = new Map();
  const runCreatedAtByRunId = new Map();
  for (const cr of crawlRuns) {
    startUrlByRunId.set(cr.id, cr.start_url || '');
    runCreatedAtByRunId.set(cr.id, cr.created_at || '');
  }
  return { startUrlByRunId, runCreatedAtByRunId };
}

export function ReportProvider({ children, domainSlug = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportListFull, setReportListFull] = useState([]);
  const [crawlRuns, setCrawlRuns] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [compareReportId, setCompareReportId] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const domainSlugRef = useRef(domainSlug);
  domainSlugRef.current = domainSlug;

  const { startUrlByRunId } = useMemo(() => crawlMaps(crawlRuns), [crawlRuns]);

  const scopedList = useMemo(
    () => filterReportsByDomain(reportListFull, domainSlug),
    [reportListFull, domainSlug]
  );

  const reportList = useMemo(() => {
    if (domainSlug == null || domainSlug === '') return reportListFull;
    return scopedList;
  }, [domainSlug, reportListFull, scopedList]);

  const applyPayload = useCallback(async (reportId) => {
    const scoped = domainSlugRef.current;
    setLoading(true);
    setError(null);
    try {
      const url =
        reportId != null
          ? reportApi(`/payload?reportId=${encodeURIComponent(String(reportId))}`)
          : reportApi('/payload');
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || res.statusText);
      setData(body.payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const allowGlobalFallback =
        msg === 'Report not found' &&
        reportId != null &&
        (scoped == null || scoped === '');
      if (allowGlobalFallback) {
        setSelectedReportId(null);
        try {
          const res = await fetch(reportApi('/payload'));
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || res.statusText);
          setData(body.payload);
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

  const loadReport = useCallback(
    async (reportId = null) => {
      await applyPayload(reportId);
    },
    [applyPayload]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setReportListFull([]);
    setCrawlRuns([]);

    fetch(reportApi('/meta'))
      .then((res) => res.json())
      .then((body) => {
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
      .catch((e) => {
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
  }, [reportListFull, crawlRuns, domainSlug, scopedList, selectedReportId, applyPayload]);

  useEffect(() => {
    if (compareReportId == null) {
      setCompareData(null);
      return;
    }
    const list = domainSlug ? scopedList : reportListFull;
    const allowed = new Set(list.map((r) => r.id));
    if (!allowed.has(compareReportId)) {
      setCompareData(null);
      return;
    }
    let cancelled = false;
    fetch(reportApi(`/payload?reportId=${encodeURIComponent(String(compareReportId))}`))
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && body.payload != null) setCompareData(body.payload);
        else if (!cancelled) setCompareData(null);
      })
      .catch(() => {
        if (!cancelled) setCompareData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [compareReportId, domainSlug, scopedList, reportListFull]);

  useEffect(() => {
    const list = domainSlug ? scopedList : reportListFull;
    const allowed = new Set(list.map((r) => r.id));
    if (compareReportId != null && !allowed.has(compareReportId)) {
      setCompareReportId(null);
    }
  }, [domainSlug, scopedList, reportListFull, compareReportId]);

  const reportDiff = useMemo(() => {
    if (data == null || compareData == null) return null;
    return computeReportFingerprintDiff(data, compareData);
  }, [data, compareData]);

  return (
    <ReportContext.Provider
      value={{
        data,
        loading,
        error,
        reportList,
        selectedReportId,
        setSelectedReportId,
        compareReportId,
        setCompareReportId,
        compareData,
        reportDiff,
        loadReport,
        startUrlByRunId,
      }}
    >
      {children}
    </ReportContext.Provider>
  );
}
