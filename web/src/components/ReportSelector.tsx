import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { formatReportGeneratedAt } from '../lib/reportTimestamps';

export default function ReportSelector() {
  const { reportList, selectedReportId, setSelectedReportId, loading, error } = useReport();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="report-select" className="text-xs text-muted-foreground whitespace-nowrap">
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
        className="bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-foreground focus:border-blue-500 outline-none min-w-[180px]"
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
