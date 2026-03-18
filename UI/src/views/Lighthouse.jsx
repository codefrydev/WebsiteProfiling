import { useState, useMemo, useRef } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Globe } from 'lucide-react';
import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card } from '../components';
import { scoreBandColor } from '../utils/chartPalette';
import {
  CATEGORIES, CATEGORY_LABELS, METRIC_THRESHOLDS, IMPACT_GROUPS, QUICK_WINS,
} from '../utils/lighthouseUtils';
import {
  ScoreRing, ThresholdBar, DiagnosticGroup, QuickWinCard, MultiPageTable,
} from '../components/lighthouse';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Lighthouse() {
  const { data } = useReport();
  const detailRef = useRef(null);

  const byUrl = useMemo(() => data?.lighthouse_by_url || {}, [data]);
  const urlList = useMemo(() => Object.keys(byUrl), [byUrl]);
  const hasMulti = urlList.length >= 2;

  const [selectedUrl, setSelectedUrl] = useState(null);
  const effectiveUrl = selectedUrl || urlList[0] || null;

  const handleSelectUrl = (url) => {
    setSelectedUrl(url);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  // Active summary: per-URL when available, else global
  const summary = useMemo(() => {
    if (effectiveUrl && byUrl[effectiveUrl]) return byUrl[effectiveUrl];
    return data?.lighthouse_summary || {};
  }, [effectiveUrl, byUrl, data]);

  const diagnostics = useMemo(
    () => data?.lighthouse_diagnostics || data?.lighthouse_summary?.diagnostics || [],
    [data]
  );

  const humanSummary = data?.lighthouse_human_summary || summary?.human_summary || '';
  const mm = summary?.median_metrics || {};
  const cs = summary?.category_scores || {};
  const topFailures = useMemo(() => summary?.top_failures || [], [summary?.top_failures]);
  const strategy = summary?.strategy || 'mobile';
  const device = summary?.device || strategy;
  const mode = summary?.mode || 'navigation';
  const categories = summary?.categories || ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'];
  const runTimestamp = summary?.run_timestamp || '';
  const iterations = summary?.iterations ?? 0;

  const hasData = summary?.url || diagnostics.length > 0 || topFailures.length > 0;

  // Build flat diagnostics list
  const diagnosticsList = useMemo(() => {
    if (diagnostics.length > 0) return diagnostics;
    return topFailures.map((f) => ({
      warning: f.helpText || f.id,
      lighthouse_audit_id: f.id,
      primary_impact: f.impact || 'UX',
      severity: 'High',
      one_line_fix: 'See Lighthouse report for fix.',
      evidence: f.evidence || [],
    }));
  }, [diagnostics, topFailures]);

  // Group diagnostics by primary_impact
  const groupedDiagnostics = useMemo(() => {
    const map = {};
    IMPACT_GROUPS.forEach((g) => { map[g.id] = []; });
    diagnosticsList.forEach((d) => {
      const impact = (d.primary_impact || 'UX').trim();
      const grp = IMPACT_GROUPS.find((g) =>
        g.id === impact ||
        g.label.toLowerCase().includes(impact.toLowerCase()) ||
        impact.toLowerCase().includes(g.id.toLowerCase())
      );
      const key = grp ? grp.id : 'UX';
      if (!map[key]) map[key] = [];
      map[key].push(d);
    });
    return map;
  }, [diagnosticsList]);

  // Default-open: group with most critical/high issues
  const mostCriticalGroup = useMemo(() => {
    let maxId = 'UX'; let maxCount = 0;
    Object.entries(groupedDiagnostics).forEach(([id, items]) => {
      const critCount = items.filter((d) => ['critical', 'high'].includes((d.severity || '').toLowerCase())).length;
      if (critCount > maxCount) { maxCount = critCount; maxId = id; }
    });
    return maxId;
  }, [groupedDiagnostics]);

  // Quick Wins pass/fail from audit IDs
  const quickWinStatus = useMemo(() => {
    const allAuditIds = new Set(diagnosticsList.map((d) => d.lighthouse_audit_id || d.id).filter(Boolean));
    const status = {};
    QUICK_WINS.forEach((w) => {
      status[w.id] = w.auditIds.length === 0 ? false : !w.auditIds.some((aid) => allAuditIds.has(aid));
    });
    return status;
  }, [diagnosticsList]);

  if (!hasData) {
    return (
      <PageLayout>
        <PageHeader title="Page Speed" subtitle="Core Web Vitals and performance audit results." />
        <Card className="p-8 text-center">
          <p className="text-slate-500">
            No Lighthouse data yet. Run{' '}
            <code className="bg-brand-900 px-2 py-1 rounded text-slate-300">python -m src lighthouse</code>{' '}
            and regenerate the report to see results here.
          </p>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-bright mb-2">Page Speed</h1>
        {summary.url && (
          <p className="text-slate-400 text-sm mb-1">
            <a href={summary.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all">
              {summary.url}
            </a>
          </p>
        )}
        <Card padding="tight" className="mt-4">
          <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Analysis settings</h3>
          <div className="flex flex-wrap gap-6 text-sm">
            <div><span className="text-slate-500 block text-xs mb-0.5">Mode</span><span className="text-slate-200 font-medium capitalize">{mode}</span></div>
            <div><span className="text-slate-500 block text-xs mb-0.5">Device</span><span className="text-slate-200 font-medium capitalize">{device}</span></div>
            <div className="min-w-0">
              <span className="text-slate-500 block text-xs mb-0.5">Categories</span>
              <span className="text-slate-200 font-medium">
                {Array.isArray(categories) ? categories.map((c) => CATEGORY_LABELS[c] || c).join(', ') : 'Performance, Accessibility, Best practices, SEO, PWA'}
              </span>
            </div>
          </div>
          {(runTimestamp || iterations) && (
            <p className="text-slate-500 text-xs mt-3 pt-3 border-t border-muted">
              {iterations > 0 && <span>Runs: {iterations} (medians shown)</span>}
              {runTimestamp && <span className="ml-3">Generated: {new Date(runTimestamp).toLocaleString()}</span>}
            </p>
          )}
        </Card>
      </div>

      {/* ── Multi-page comparison ── */}
      {hasMulti && (
        <div className="mb-10">
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Multi-page comparison</h2>
          <p className="text-slate-500 text-sm mb-3">Click any row to view its detailed breakdown below. Sort by any column.</p>
          <Card padding="none" overflowHidden>
            <MultiPageTable byUrl={byUrl} selectedUrl={effectiveUrl} onSelect={handleSelectUrl} />
          </Card>
        </div>
      )}

      {/* ── URL selector ── */}
      {hasMulti && (
        <div className="mb-8" ref={detailRef}>
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Detailed view</h2>
          <div className="flex items-center gap-3">
            <Globe className="h-4 w-4 text-slate-500 shrink-0" />
            <select
              value={effectiveUrl || ''}
              onChange={(e) => setSelectedUrl(e.target.value)}
              className="bg-brand-800 border border-default text-sm rounded-lg px-3 py-2 text-slate-200 outline-none flex-1 max-w-lg"
            >
              {urlList.map((url) => {
                const sc = byUrl[url]?.category_scores?.performance;
                const dot = sc != null ? (sc >= 90 ? '🟢' : sc >= 50 ? '🟡' : '🔴') : '⚪';
                return <option key={url} value={url}>{dot} {url}</option>;
              })}
            </select>
          </div>
        </div>
      )}

      {/* ── Score Rings ── */}
      <div className="mb-10">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">Categories</h2>
        <div className="flex flex-wrap gap-6 justify-start items-center">
          {CATEGORIES.map(({ id, label }) => (
            <ScoreRing key={id} label={label} score={cs[id] != null ? Number(cs[id]) : null} />
          ))}
        </div>
        <div className="flex flex-wrap gap-6 mt-4 text-xs text-slate-500">
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />0–49 Poor</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1" />50–89 Needs improvement</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />90–100 Good</span>
        </div>
      </div>

      {/* ── Category scores bar chart ── */}
      <div className="mb-10">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Category scores</h2>
        <p className="text-slate-500 text-sm mb-3">Ranked worst to best (Score 0–100)</p>
        {(() => {
          const withScores = CATEGORIES
            .map(({ id }) => ({ id, label: CATEGORY_LABELS[id] || id, score: cs[id] != null ? Number(cs[id]) : null }))
            .filter((c) => c.score != null)
            .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
          if (withScores.length === 0) return <Card className="p-4 text-slate-500 text-sm">No category scores</Card>;
          return (
            <Card padding="tight" className="print:break-inside-avoid">
              <div className="h-48" role="img" aria-label={`Category scores: ${withScores.map((c) => `${c.label} ${c.score}`).join(', ')}`}>
                <Bar
                  data={{
                    labels: withScores.map((c) => c.label),
                    datasets: [{ data: withScores.map((c) => c.score ?? 0), backgroundColor: withScores.map((c) => scoreBandColor(c.score)), label: 'Score' }],
                  }}
                  options={{
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { min: 0, max: 100, grid: { color: 'rgba(71, 85, 105, 0.5)' }, title: { display: true, text: 'Score (0–100)' } },
                      y: { grid: { color: 'rgba(71, 85, 105, 0.5)' } },
                    },
                  }}
                />
              </div>
            </Card>
          );
        })()}
      </div>

      {/* ── Metrics with threshold bars ── */}
      <div className="mb-10">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Metrics</h2>
        <p className="text-slate-500 text-sm mb-4">
          Hover any metric for threshold details. Bars fill relative to the good threshold. Medians from {iterations || 1} run(s).
        </p>
        <Card overflowHidden padding="none">
          <div className="divide-y divide-muted">
            {Object.keys(METRIC_THRESHOLDS).map((key) => (
              <ThresholdBar key={key} metricKey={key} value={mm[key]} />
            ))}
          </div>
        </Card>
      </div>

      {/* ── Quick Wins ── */}
      <div className="mb-10">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Quick Wins</h2>
        <p className="text-slate-500 text-sm mb-4">
          Click any card to see why it matters, how to fix it, and the estimated impact.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {QUICK_WINS.map((win) => (
            <QuickWinCard key={win.id} win={win} passed={quickWinStatus[win.id] ?? false} />
          ))}
        </div>
      </div>

      {/* ── Human Summary ── */}
      {humanSummary && (
        <div className="mb-10">
          <Card>
            <h2 className="text-slate-200 text-sm font-bold uppercase tracking-wider mb-3">Summary</h2>
            <pre className="text-slate-400 text-sm whitespace-pre-wrap font-sans">{humanSummary}</pre>
          </Card>
        </div>
      )}

      {/* ── Grouped Diagnostics ── */}
      <div className="mb-8">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Diagnostics & Fixes</h2>
        <p className="text-slate-500 text-sm mb-4">
          Issues grouped by impact area. Click a group to expand. Click any issue for full detail and evidence.
        </p>
        {diagnosticsList.length === 0 ? (
          <Card className="p-6 text-center text-slate-500 text-sm">
            No failing audits — all checks passed.
          </Card>
        ) : (
          <div className="space-y-3">
            {IMPACT_GROUPS.map((group) => {
              const items = groupedDiagnostics[group.id] || [];
              if (items.length === 0) return null;
              return (
                <DiagnosticGroup
                  key={group.id}
                  group={group}
                  items={items}
                  defaultOpen={group.id === mostCriticalGroup}
                />
              );
            })}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
