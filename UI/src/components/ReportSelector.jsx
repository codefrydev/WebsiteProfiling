import { useReport } from '../context/useReport';

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
  const { reportList, selectedReportId, setSelectedReportId, loading, error } = useReport();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="report-select" className="text-xs text-slate-500 whitespace-nowrap">
        Report:
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
        title={reportList.length <= 1 ? 'Run more reports with preserve_crawl_history to see history here' : 'Load a previous report'}
      >
        <option value="">Latest</option>
        {reportList.map((r) => (
          <option key={r.id} value={r.id}>
            {formatGeneratedAt(r.generated_at)}
          </option>
        ))}
      </select>
    </div>
  );
}
