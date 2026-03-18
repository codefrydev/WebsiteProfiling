import { useState, useEffect, useCallback } from 'react';
import { loadReportFromDb, listReportsFromDb } from '../lib/loadReportDb';
import { ReportContext } from './reportContext';

export function ReportProvider({ children, dbUrl = '/report.db' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportList, setReportList] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState(null);

  const loadReport = useCallback(
    (reportId = null) => {
      setLoading(true);
      setError(null);
      loadReportFromDb(dbUrl, reportId)
        .then(setData)
        .catch((e) => {
          if (e.message === 'Report not found' && reportId != null) {
            setSelectedReportId(null);
            return loadReportFromDb(dbUrl, null).then(setData);
          }
          setError(e.message);
        })
        .finally(() => setLoading(false));
    },
    [dbUrl]
  );

  useEffect(() => {
    listReportsFromDb(dbUrl)
      .then((list) => {
        setReportList(list);
      })
      .catch(() => setReportList([]));
  }, [dbUrl]);

  useEffect(() => {
    loadReport(selectedReportId);
  }, [dbUrl, selectedReportId, loadReport]);

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
      }}
    >
      {children}
    </ReportContext.Provider>
  );
}
