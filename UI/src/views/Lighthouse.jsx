import { useReport } from '../context/useReport';

// Lighthouse score color: 0-49 red, 50-89 orange, 90-100 green
function scoreColor(score) {
  if (score == null) return 'rgb(71, 85, 105)'; // slate-500
  const s = Number(score);
  if (s >= 90) return 'rgb(34, 197, 94)';   // green-500
  if (s >= 50) return 'rgb(234, 179, 8)';   // yellow-500
  return 'rgb(239, 68, 68)';                 // red-500
}

function scoreRingColor(score) {
  if (score == null) return 'rgb(51, 65, 85)'; // slate-700
  return scoreColor(score);
}

// Format metric for display: ms -> "0.3 s" or "120 ms", CLS -> "0" or "0.05"
function formatMetric(key, value) {
  if (value == null || value === '') return '—';
  const v = Number(value);
  if (key === 'cls') return v === 0 ? '0' : v.toFixed(2);
  if (key === 'lcp_ms' || key === 'fcp_ms' || key === 'speed_index_ms') {
    if (v >= 1000) return `${(v / 1000).toFixed(1)} s`;
    return `${Math.round(v)} ms`;
  }
  if (key === 'tbt_ms') return `${Math.round(v)} ms`;
  return String(value);
}

// Metric good/warning/poor for coloring (Lighthouse style)
function metricStatus(key, value) {
  if (value == null) return 'neutral';
  const v = Number(value);
  if (key === 'lcp_ms') return v <= 2500 ? 'good' : v <= 4000 ? 'warn' : 'poor';
  if (key === 'fcp_ms') return v <= 1800 ? 'good' : v <= 3000 ? 'warn' : 'poor';
  if (key === 'tbt_ms') return v <= 200 ? 'good' : v <= 600 ? 'warn' : 'poor';
  if (key === 'cls') return v <= 0.1 ? 'good' : v <= 0.25 ? 'warn' : 'poor';
  if (key === 'speed_index_ms') return v <= 3400 ? 'good' : v <= 5800 ? 'warn' : 'poor';
  return 'neutral';
}

function metricTextClass(status) {
  if (status === 'good') return 'text-green-400';
  if (status === 'warn') return 'text-yellow-400';
  if (status === 'poor') return 'text-red-400';
  return 'text-slate-400';
}

function severityClass(s) {
  if (s === 'High') return 'bg-red-500/20 text-red-400 border border-red-500/30';
  if (s === 'Medium') return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
  return 'bg-slate-500/20 text-slate-400 border border-slate-500/30';
}

const CATEGORIES = [
  { id: 'performance', label: 'Performance' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'best-practices', label: 'Best Practices' },
  { id: 'seo', label: 'SEO' },
  { id: 'pwa', label: 'PWA' },
];

const METRICS = [
  { key: 'fcp_ms', label: 'First Contentful Paint' },
  { key: 'lcp_ms', label: 'Largest Contentful Paint' },
  { key: 'tbt_ms', label: 'Total Blocking Time' },
  { key: 'cls', label: 'Cumulative Layout Shift' },
  { key: 'speed_index_ms', label: 'Speed Index' },
];

export default function Lighthouse() {
  const { data } = useReport();
  if (!data) return null;

  const summary = data.lighthouse_summary || {};
  const diagnostics = data.lighthouse_diagnostics || data.lighthouse_summary?.diagnostics || [];
  const humanSummary = data.lighthouse_human_summary || summary.human_summary || '';
  const mm = summary.median_metrics || {};
  const cs = summary.category_scores || {};
  const topFailures = summary.top_failures || [];
  const strategy = summary.strategy || 'mobile';
  const device = summary.device || strategy;
  const mode = summary.mode || 'navigation';
  const categories = summary.categories || ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'];
  const runTimestamp = summary.run_timestamp || '';
  const iterations = summary.iterations ?? 0;

  const categoryLabels = {
    performance: 'Performance',
    accessibility: 'Accessibility',
    'best-practices': 'Best practices',
    seo: 'SEO',
    pwa: 'PWA',
  };

  const hasData = summary.url || diagnostics.length > 0 || topFailures.length > 0;

  if (!hasData) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Lighthouse</h1>
          <p className="text-slate-400">
            Core Web Vitals and audit results from Lighthouse.
          </p>
        </div>
        <div className="bg-brand-800 border border-slate-700 rounded-xl p-8 text-center">
          <p className="text-slate-500">
            No Lighthouse data yet. Run <code className="bg-brand-900 px-2 py-1 rounded text-slate-300">python -m src lighthouse</code> and regenerate the report to see results here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header: URL + run info */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Lighthouse report</h1>
        {summary.url && (
          <p className="text-slate-400 text-sm mb-1">
            <a href={summary.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all">{summary.url}</a>
          </p>
        )}
        {/* Analysis settings: Mode, Device, Categories */}
        <div className="mt-4 p-4 bg-brand-800 border border-slate-700 rounded-xl">
          <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Analysis settings</h3>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-slate-500 block text-xs mb-0.5">Mode</span>
              <span className="text-slate-200 font-medium capitalize">{mode}</span>
              <span className="text-slate-500 text-xs ml-1">(default: Navigation)</span>
            </div>
            <div>
              <span className="text-slate-500 block text-xs mb-0.5">Device</span>
              <span className="text-slate-200 font-medium capitalize">{device}</span>
              <span className="text-slate-500 text-xs ml-1">(Mobile / Desktop)</span>
            </div>
            <div className="min-w-0">
              <span className="text-slate-500 block text-xs mb-0.5">Categories</span>
              <span className="text-slate-200 font-medium">
                {Array.isArray(categories)
                  ? categories.map((c) => categoryLabels[c] || c).join(', ')
                  : 'Performance, Accessibility, Best practices, SEO, PWA'}
              </span>
            </div>
          </div>
          {(runTimestamp || iterations) && (
            <p className="text-slate-500 text-xs mt-3 pt-3 border-t border-slate-700">
              {iterations > 0 && <span>Runs: {iterations} (medians shown)</span>}
              {runTimestamp && <span className="ml-3">Generated: {new Date(runTimestamp).toLocaleString()}</span>}
            </p>
          )}
        </div>
      </div>

      {/* Category score circles - like official Lighthouse */}
      <div className="mb-10">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">Categories</h2>
        <div className="flex flex-wrap gap-6 justify-start items-center">
          {CATEGORIES.map(({ id, label }) => {
            const score = cs[id] != null ? Number(cs[id]) : null;
            const color = scoreRingColor(score);
            const displayScore = score != null ? score : '—';
            return (
              <div key={id} className="flex flex-col items-center">
                <div className="relative w-24 h-24">
                  <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="rgb(51, 65, 85)"
                      strokeWidth="3"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={color}
                      strokeWidth="3"
                      strokeDasharray={score != null ? `${score}, 100` : '0, 100'}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-bold text-white">{displayScore}</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs font-medium mt-2 text-center">{label}</span>
              </div>
            );
          })}
        </div>
        {/* Score legend */}
        <div className="flex flex-wrap gap-6 mt-4 text-xs text-slate-500">
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />0–49 Poor</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1" />50–89 Needs improvement</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />90–100 Good</span>
        </div>
      </div>

      {/* Metrics section - like official Lighthouse */}
      <div className="mb-10">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Metrics</h2>
        <p className="text-slate-500 text-sm mb-4">
          Values are estimated and may vary. The performance score is calculated from these metrics. Medians from {iterations || 1} run(s).
        </p>
        <div className="bg-brand-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="divide-y divide-slate-700">
            {METRICS.map(({ key, label }) => {
              const value = mm[key];
              const status = metricStatus(key, value);
              const textClass = metricTextClass(status);
              return (
                <div key={key} className="flex items-center justify-between px-5 py-4">
                  <span className="text-slate-300 text-sm">{label}</span>
                  <span className={`font-semibold text-sm ${textClass}`}>{formatMetric(key, value)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Human summary */}
      {humanSummary && (
        <div className="mb-10 bg-brand-800 border border-slate-700 rounded-xl p-5">
          <h2 className="text-slate-200 text-sm font-bold uppercase tracking-wider mb-3">Summary</h2>
          <pre className="text-slate-400 text-sm whitespace-pre-wrap font-sans">{humanSummary}</pre>
        </div>
      )}

      {/* Opportunities / Diagnostics - like Lighthouse's actionable section */}
      <div className="mb-8">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Diagnostics &amp; fixes</h2>
        <p className="text-slate-500 text-sm mb-4">
          Issues and recommendations with one-line fixes and evidence. Address these to improve scores.
        </p>
        {(diagnostics.length > 0 ? diagnostics : topFailures.map((f) => ({
          warning: f.helpText || f.id,
          lighthouse_audit_id: f.id,
          primary_impact: f.impact || 'UX',
          severity: 'High',
          one_line_fix: 'See Lighthouse report for fix.',
          evidence: f.evidence || [],
        }))).length === 0 ? (
          <div className="bg-brand-800 border border-slate-700 rounded-xl p-6 text-center text-slate-500 text-sm">
            No failing audits — all checks passed.
          </div>
        ) : (
          <div className="space-y-4">
            {(diagnostics.length > 0 ? diagnostics : topFailures.map((f) => ({
              warning: f.helpText || f.id,
              lighthouse_audit_id: f.id,
              primary_impact: f.impact || 'UX',
              severity: 'High',
              one_line_fix: 'See Lighthouse report for fix.',
              evidence: f.evidence || [],
            }))).slice(0, 20).map((d, i) => (
              <div
                key={i}
                className="bg-brand-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-3"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${severityClass(d.severity)}`}>
                    {d.severity || 'Medium'}
                  </span>
                  <span className="text-xs font-semibold text-blue-400">{d.lighthouse_audit_id || d.id}</span>
                  <span className="text-xs text-slate-500">{d.primary_impact || d.impact}</span>
                </div>
                <p className="text-slate-200 text-sm">{d.warning || d.helpText || '—'}</p>
                <div className="bg-brand-900 rounded p-3 border border-slate-800">
                  <div className="text-[10px] text-blue-400 font-bold uppercase mb-1">How to fix</div>
                  <p className="text-slate-300 text-sm">{d.one_line_fix || '—'}</p>
                  {d.detailed_fix && (
                    <p className="text-slate-500 text-xs mt-2">{d.detailed_fix}</p>
                  )}
                </div>
                {Array.isArray(d.evidence) && d.evidence.length > 0 && (
                  <div className="text-xs">
                    <span className="text-slate-500 font-semibold">Evidence: </span>
                    <ul className="list-disc list-inside text-slate-400 mt-1">
                      {d.evidence.slice(0, 5).map((ev, j) => (
                        <li key={j} className="truncate max-w-full" title={ev}>{ev}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {d.estimated_impact && (
                  <p className="text-slate-500 text-xs">Estimated impact: {d.estimated_impact}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
