import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  openReportDatabase,
  listReportsFromDatabase,
  readReportPayloadFromDatabase,
} from '../lib/loadReportDb';
import { domainQueryMatchesRow } from '../lib/domainSlug';
import { computeReportFingerprintDiff } from '../lib/reportDiff';
import { strings } from '../lib/strings';
import { ReportContext } from './reportContext';

/**
 * @param {Array<{ id: number, generated_at: string, site_name: string, canonical_domain?: string }>} full
 * @param {string | null} domainSlug
 */
function filterReportsByDomain(full, domainSlug) {
  if (domainSlug == null || domainSlug === '') return full;
  return full.filter((r) => domainQueryMatchesRow(r, domainSlug));
}

export function ReportProvider({ children, dbUrl = '/report.db', domainSlug = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportListFull, setReportListFull] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [compareReportId, setCompareReportId] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [sqlDb, setSqlDb] = useState(null);
  const dbRef = useRef(null);
  const domainSlugRef = useRef(domainSlug);
  domainSlugRef.current = domainSlug;

  const scopedList = useMemo(
    () => filterReportsByDomain(reportListFull, domainSlug),
    [reportListFull, domainSlug]
  );

  const reportList = useMemo(() => {
    if (domainSlug == null || domainSlug === '') return reportListFull;
    return scopedList;
  }, [domainSlug, reportListFull, scopedList]);

  const applyPayload = useCallback(
    (reportId) => {
      const db = dbRef.current;
      if (!db) return;
      const scoped = domainSlugRef.current;
      setLoading(true);
      setError(null);
      try {
        const payload = readReportPayloadFromDatabase(db, reportId);
        setData(payload);
      } catch (e) {
        const allowGlobalFallback =
          e.message === 'Report not found' &&
          reportId != null &&
          (scoped == null || scoped === '');
        if (allowGlobalFallback) {
          setSelectedReportId(null);
          try {
            setData(readReportPayloadFromDatabase(db, null));
          } catch (e2) {
            setError(e2.message);
          }
        } else {
          setError(e.message);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const loadReport = useCallback(
    (reportId = null) => {
      applyPayload(reportId);
    },
    [applyPayload]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setSqlDb(null);
    if (dbRef.current) {
      try {
        dbRef.current.close();
      } catch {
        /* ignore */
      }
      dbRef.current = null;
    }

    openReportDatabase(dbUrl)
      .then((db) => {
        if (cancelled) {
          db.close();
          return;
        }
        dbRef.current = db;
        setSqlDb(db);
        setReportListFull(listReportsFromDatabase(db));
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (dbRef.current) {
        try {
          dbRef.current.close();
        } catch {
          /* ignore */
        }
        dbRef.current = null;
      }
    };
  }, [dbUrl]);

  useEffect(() => {
    if (!sqlDb) return;
    if (!reportListFull.length) {
      applyPayload(null);
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
  }, [sqlDb, reportListFull, domainSlug, scopedList, selectedReportId, applyPayload]);

  useEffect(() => {
    const db = dbRef.current;
    if (!db || compareReportId == null) {
      setCompareData(null);
      return;
    }
    const list = domainSlug ? scopedList : reportListFull;
    const allowed = new Set(list.map((r) => r.id));
    if (!allowed.has(compareReportId)) {
      setCompareData(null);
      return;
    }
    try {
      setCompareData(readReportPayloadFromDatabase(db, compareReportId));
    } catch {
      setCompareData(null);
    }
  }, [sqlDb, compareReportId, domainSlug, scopedList, reportListFull]);

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
        sqlDb,
      }}
    >
      {children}
    </ReportContext.Provider>
  );
}
