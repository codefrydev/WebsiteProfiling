import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { formatReportGeneratedAt } from '../lib/reportTimestamps';

export default function ReportSelector() {
  const { reportList, selectedReportId, setSelectedReportId, loading, error } = useReport();

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <label htmlFor="report-select" className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
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
        className="bg-brand-900 border border-default focus:border-[var(--accent)] rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none max-w-[180px] sm:max-w-[220px] truncate transition-colors"
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
