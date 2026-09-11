import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { formatReportGeneratedAt } from '../lib/reportTimestamps';

export default function ReportSelector() {
  const { reportList, selectedReportId, setSelectedReportId, loading, error } = useReport();

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <label htmlFor="report-select" className="text-xs text-md-sys-on-surface-variant whitespace-nowrap hidden sm:inline">
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
        className="bg-md-sys-surface-container-high border border-md-sys-outline-variant/40 focus:ring-2 focus:ring-md-sys-primary rounded-full px-3.5 py-1.5 text-xs text-md-sys-on-surface outline-none max-w-[180px] sm:max-w-[220px] truncate transition-all duration-200"
        title={reportList.length <= 1 ? strings.reportSelector.titleReportHistory : strings.reportSelector.titleLoadReport}
      >
        <option value="">{strings.reportSelector.latestOption}</option>
        {reportList.map((r) => (
          <option key={r.id} value={r.id}>
            {formatReportGeneratedAt(r.generated_at)}
          </option>
        ))}
      </select>
    </div>
  );
}
