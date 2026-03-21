import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';

function formatGeneratedAt(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export default function ReportSelector() {
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

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="report-select" className="text-xs text-slate-500 whitespace-nowrap">
          {strings.reportSelector.reportLabel}
        </label>
        <select
          id="report-select"
          value={selectedReportId ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            setSelectedReportId(v === '' ? null : Number(v));
          }}
          disabled={loading || !!error}
          className="bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 outline-none min-w-[180px]"
          title={reportList.length <= 1 ? strings.reportSelector.titleReportHistory : strings.reportSelector.titleLoadReport}
        >
          <option value="">{strings.reportSelector.latestOption}</option>
          {reportList.map((r) => (
            <option key={r.id} value={r.id}>
              {formatGeneratedAt(r.generated_at)}
            </option>
          ))}
        </select>
      </div>
      {reportList.length >= 2 && (
        <div className="flex items-center gap-2">
          <label htmlFor="compare-select" className="text-xs text-slate-500 whitespace-nowrap">
            {strings.reportSelector.compareLabel}
          </label>
          <select
            id="compare-select"
            value={compareReportId ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setCompareReportId(v === '' ? null : Number(v));
            }}
            disabled={loading || !!error}
            className="bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 outline-none min-w-[160px]"
            title={strings.reportSelector.titleCompareBaseline}
          >
            <option value="">{strings.reportSelector.noneOption}</option>
            {reportList
              .filter((r) => r.id !== effectiveId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {formatGeneratedAt(r.generated_at)}
                </option>
              ))}
          </select>
        </div>
      )}
    </div>
  );
}
