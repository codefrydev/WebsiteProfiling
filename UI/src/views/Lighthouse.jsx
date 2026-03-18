import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card, Badge } from '../components';
import { scoreBandColor } from '../utils/chartPalette';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip);

// Lighthouse score color: 0-49 red, 50-89 orange, 90-100 green
function scoreColor(score) {
  return scoreBandColor(score);
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
      <PageLayout>
        <PageHeader
          title="Lighthouse"
          subtitle="Core Web Vitals and audit results from Lighthouse."
        />
        <Card className="p-8 text-center">
          <p className="text-slate-500">
            No Lighthouse data yet. Run <code className="bg-brand-900 px-2 py-1 rounded text-slate-300">python -m src lighthouse</code> and regenerate the report to see results here.
          </p>
        </Card>
      </PageLayout>
    );
  }

  const diagnosticsList = diagnostics.length > 0
    ? diagnostics
    : topFailures.map((f) => ({
        warning: f.helpText || f.id,
        lighthouse_audit_id: f.id,
        primary_impact: f.impact || 'UX',
        severity: 'High',
        one_line_fix: 'See Lighthouse report for fix.',
        evidence: f.evidence || [],
      }));

  return (
    <PageLayout maxWidth>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Lighthouse report</h1>
        {summary.url && (
          <p className="text-slate-400 text-sm mb-1">
            <a href={summary.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all">{summary.url}</a>
          </p>
        )}
        <Card padding="tight" className="mt-4">
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
        </Card>
      </div>

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
        <div className="flex flex-wrap gap-6 mt-4 text-xs text-slate-500">
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />0–49 Poor</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1" />50–89 Needs improvement</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />90–100 Good</span>
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Category scores</h2>
        <p className="text-slate-500 text-sm mb-3">Ranked worst to best (Score 0–100)</p>
        {(() => {
          const withScores = CATEGORIES.map(({ id, label }) => ({
            id,
            label: categoryLabels[id] || label,
            score: cs[id] != null ? Number(cs[id]) : null,
          })).filter((c) => c.score != null);
          const sorted = [...withScores].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
          if (sorted.length === 0) return <Card className="p-4 text-slate-500 text-sm">No category scores</Card>;
          const labels = sorted.map((c) => c.label);
          const values = sorted.map((c) => c.score ?? 0);
          const colors = sorted.map((c) => scoreBandColor(c.score));
          return (
            <Card padding="tight" className="print:break-inside-avoid">
              <div className="h-48" role="img" aria-label={`Category scores: ${labels.map((l, i) => `${l} ${values[i]}`).join(', ')}`}>
                <Bar
                  data={{
                    labels,
                    datasets: [{ data: values, backgroundColor: colors, label: 'Score' }],
                  }}
                  options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: {
                        min: 0,
                        max: 100,
                        grid: { color: 'rgba(71, 85, 105, 0.5)' },
                        title: { display: true, text: 'Score (0–100)' },
                      },
                      y: { grid: { color: 'rgba(71, 85, 105, 0.5)' } },
                    },
                  }}
                />
              </div>
            </Card>
          );
        })()}
      </div>

      <div className="mb-10">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Metrics</h2>
        <p className="text-slate-500 text-sm mb-4">
          Values are estimated and may vary. The performance score is calculated from these metrics. Medians from {iterations || 1} run(s).
        </p>
        <Card overflowHidden padding="none">
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
        </Card>
      </div>

      {humanSummary && (
        <div className="mb-10">
          <Card>
            <h2 className="text-slate-200 text-sm font-bold uppercase tracking-wider mb-3">Summary</h2>
            <pre className="text-slate-400 text-sm whitespace-pre-wrap font-sans">{humanSummary}</pre>
          </Card>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Diagnostics &amp; fixes</h2>
        <p className="text-slate-500 text-sm mb-4">
          Issues and recommendations with one-line fixes and evidence. Address these to improve scores.
        </p>
        {diagnosticsList.length === 0 ? (
          <Card className="p-6 text-center text-slate-500 text-sm">
            No failing audits — all checks passed.
          </Card>
        ) : (
          <div className="space-y-4">
            {diagnosticsList.slice(0, 20).map((d, i) => (
              <Card key={i} className="flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge value={d.severity} label={d.severity || 'Medium'} />
                  <span className="text-xs font-semibold text-blue-400">{d.lighthouse_audit_id || d.id}</span>
                  <span className="text-xs text-slate-500">{d.primary_impact || d.impact}</span>
                </div>
                <p className="text-slate-200 text-sm">{d.warning || d.helpText || '—'}</p>
                <div className="bg-brand-900 rounded p-3 border border-slate-800">
                  <div className="text-xs text-blue-400 font-bold uppercase mb-1">How to fix</div>
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
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
