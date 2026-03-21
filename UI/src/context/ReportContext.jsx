import { useState, useEffect, useCallback, useRef } from 'react';
import {
  openReportDatabase,
  listReportsFromDatabase,
  readReportPayloadFromDatabase,
} from '../lib/loadReportDb';
import { ReportContext } from './reportContext';

export function ReportProvider({ children, dbUrl = '/report.db' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportList, setReportList] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [sqlDb, setSqlDb] = useState(null);
  const dbRef = useRef(null);

  const applyPayload = useCallback((reportId = null) => {
    const db = dbRef.current;
    if (!db) return;
    setLoading(true);
    setError(null);
    try {
      const payload = readReportPayloadFromDatabase(db, reportId);
      setData(payload);
    } catch (e) {
      if (e.message === 'Report not found' && reportId != null) {
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
  }, []);

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
        setReportList(listReportsFromDatabase(db));
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
    applyPayload(selectedReportId);
  }, [sqlDb, selectedReportId, applyPayload]);

  return (
    <ReportContext.Provider
      value={{
        data,
        loading,
        error,
        reportList,
        selectedReportId,
        setSelectedReportId,
        loadReport,
        sqlDb,
      }}
    >
      {children}
    </ReportContext.Provider>
  );
}
