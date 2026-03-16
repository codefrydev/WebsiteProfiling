import { useState, useEffect } from 'react';
import { loadReportFromDb } from '../lib/loadReportDb';
import { ReportContext } from './reportContext';

export function ReportProvider({ children, dbUrl = '/report.db' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7896/ingest/bf9ba990-fb7e-4815-b60b-2fd68e811ccc',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'40080b'},body:JSON.stringify({sessionId:'40080b',location:'ReportContext.jsx:useEffect',message:'effect run',data:{dbUrl},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    loadReportFromDb(dbUrl)
      .then((d) => {
        // #region agent log
        fetch('http://127.0.0.1:7896/ingest/bf9ba990-fb7e-4815-b60b-2fd68e811ccc',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'40080b'},body:JSON.stringify({sessionId:'40080b',location:'ReportContext.jsx:then',message:'loadReportFromDb resolved',data:{hasData:!!d},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        setData(d);
      })
      .catch((e) => {
        // #region agent log
        fetch('http://127.0.0.1:7896/ingest/bf9ba990-fb7e-4815-b60b-2fd68e811ccc',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'40080b'},body:JSON.stringify({sessionId:'40080b',location:'ReportContext.jsx:catch',message:'loadReportFromDb rejected',data:{message:e?.message},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [dbUrl]);

  return (
    <ReportContext.Provider value={{ data, loading, error }}>
      {children}
    </ReportContext.Provider>
  );
}
