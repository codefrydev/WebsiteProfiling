import { useEffect } from 'react';
import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { formatReportGeneratedAt } from '../lib/reportTimestamps';

/**
 * Report + baseline selectors for the Compare view (and shared compare state in ReportContext).
 */
export default function ReportCompareControls() {
  const {
    reportList,
    selectedReportId,
    setSelectedReportId,
    compareReportId,
    setCompareReportId,
    loading,
    error,
  } = useReport();

  const effectiveId = selectedReportId ?? reportList[0]?.id ?? null;
  const s = strings.reportSelector;
  const vc = strings.views.compare;

  useEffect(() => {
    if (reportList.length < 2 || loading || error) return;
    const currentId = effectiveId;
    if (currentId == null) return;

    if (compareReportId === currentId) {
      const other = reportList.find((r) => r.id !== currentId);
      setCompareReportId(other?.id ?? null);
      return;
    }

    if (compareReportId == null) {
      const idx = reportList.findIndex((r) => r.id === currentId);
      const older = idx >= 0 ? reportList[idx + 1] : reportList[1];
      const pick = older?.id !== currentId ? older : reportList.find((r) => r.id !== currentId);
      if (pick) setCompareReportId(pick.id);
    }
  }, [
    reportList,
    effectiveId,
    compareReportId,
    setCompareReportId,
    loading,
    error,
  ]);

  if (reportList.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">{vc.needTwoReports}</p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="compare-view-report" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {vc.newerLabel}
        </label>
        <select
          id="compare-view-report"
          value={selectedReportId ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            setSelectedReportId(v === '' ? null : Number(v));
          }}
          disabled={loading || !!error}
          className="bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-foreground focus:border-blue-500 outline-none w-full"
          title={s.titleLoadReport}
        >
          <option value="">{s.latestOption}</option>
          {reportList.map((r) => (
            <option key={r.id} value={r.id}>
              {formatReportGeneratedAt(r.generated_at)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="compare-view-baseline" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {vc.baselineLabel}
        </label>
        <select
          id="compare-view-baseline"
          value={compareReportId ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            setCompareReportId(v === '' ? null : Number(v));
          }}
          disabled={loading || !!error}
          className="bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-foreground focus:border-blue-500 outline-none w-full"
          title={s.titleCompareBaseline}
        >
          <option value="">{s.noneOption}</option>
          {reportList
            .filter((r) => r.id !== effectiveId)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {formatReportGeneratedAt(r.generated_at)}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}
