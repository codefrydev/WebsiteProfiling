import { useState, useMemo, useRef } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Globe } from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings, format } from '../lib/strings';
import { PageLayout, PageHeader, Card } from '../components';
import BrowserMlPanel from '../components/ml/BrowserMlPanel';
import { scoreBandColor } from '../utils/chartPalette';
import {
  CATEGORIES, CATEGORY_LABELS, METRIC_THRESHOLDS, IMPACT_GROUPS, QUICK_WINS,
} from '../utils/lighthouseUtils';
import {
  ScoreRing,
  ThresholdBar,
  DiagnosticGroup,
  QuickWinCard,
  MultiPageTable,
  LhAuditExpandable,
} from '../components/lighthouse';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Lighthouse({ searchQuery = '' }) {
  const { data } = useReport();
  const detailRef = useRef(null);

  const byUrl = useMemo(() => data?.lighthouse_by_url || {}, [data]);
  const urlList = useMemo(() => Object.keys(byUrl), [byUrl]);
  const hasMulti = urlList.length >= 2;
  const q = (searchQuery || '').toLowerCase().trim();
  const urlPool = useMemo(() => {
    if (!q) return urlList;
    return urlList.filter((u) => u.toLowerCase().includes(q));
  }, [urlList, q]);
  const byUrlForTable = useMemo(() => {
    const o = {};
    urlPool.forEach((u) => {
      if (byUrl[u]) o[u] = byUrl[u];
    });
    return o;
  }, [urlPool, byUrl]);

  const [selectedUrl, setSelectedUrl] = useState(null);
  const displayUrl = useMemo(() => {
    if (urlPool.length === 0) return q ? null : (urlList[0] || null);
    if (selectedUrl && urlPool.includes(selectedUrl)) return selectedUrl;
    return urlPool[0];
  }, [urlPool, q, urlList, selectedUrl]);

  const handleSelectUrl = (url) => {
    setSelectedUrl(url);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  // Active summary: per-URL when available, else global
  const summary = useMemo(() => {
    if (displayUrl && byUrl[displayUrl]) return byUrl[displayUrl];
    return data?.lighthouse_summary || {};
  }, [displayUrl, byUrl, data]);

  const diagnostics = useMemo(() => {
    const perUrl = displayUrl && byUrl[displayUrl]?.diagnostics;
    if (Array.isArray(perUrl) && perUrl.length > 0) return perUrl;
    return data?.lighthouse_diagnostics || data?.lighthouse_summary?.diagnostics || [];
  }, [data, displayUrl, byUrl]);

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

  const failingAuditsDetailed = useMemo(() => {
    const audits = summary?.audits;
    if (!Array.isArray(audits)) return [];
    return audits.filter((a) => a?.score != null && a.score < 1);
  }, [summary?.audits]);

  const failingAuditsForDisplay = useMemo(() => {
    if (!q) return failingAuditsDetailed;
    return failingAuditsDetailed.filter((a) => {
      const title = (a.title || '').toLowerCase();
      const id = String(a.id || '').toLowerCase();
      const desc = (a.description || '').toLowerCase();
      return title.includes(q) || id.includes(q) || desc.includes(q);
    });
  }, [failingAuditsDetailed, q]);

  const hasData =
    summary?.url ||
    diagnostics.length > 0 ||
    topFailures.length > 0 ||
    failingAuditsDetailed.length > 0;

  // Build flat diagnostics list
  const diagnosticsList = useMemo(() => {
    if (diagnostics.length > 0) return diagnostics;
    return topFailures.map((f) => ({
      warning: f.helpText || f.id,
      lighthouse_audit_id: f.id,
      primary_impact: f.impact || 'UX',
      severity: 'High',
      one_line_fix: strings.views.lighthouse.defaultFix,
      evidence: f.evidence || [],
    }));
  }, [diagnostics, topFailures]);

  const diagnosticsForGroups = useMemo(() => {
    if (!q) return diagnosticsList;
    return diagnosticsList.filter((d) => {
      const w = (d.warning || '').toLowerCase();
      const id = String(d.lighthouse_audit_id || d.id || '').toLowerCase();
      const fix = (d.one_line_fix || '').toLowerCase();
      return w.includes(q) || id.includes(q) || fix.includes(q);
    });
  }, [diagnosticsList, q]);

  // Group diagnostics by primary_impact
  const groupedDiagnostics = useMemo(() => {
    const map = {};
    IMPACT_GROUPS.forEach((g) => { map[g.id] = []; });
    diagnosticsForGroups.forEach((d) => {
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
  }, [diagnosticsForGroups]);

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

  const vlh = strings.views.lighthouse;

  if (!hasData) {
    return (
      <PageLayout>
        <PageHeader title={vlh.emptyTitle} subtitle={vlh.emptySubtitle} />
        <Card className="p-8 text-center">
          <p className="text-slate-500">
            {vlh.emptyBodyBefore}{' '}
            <code className="bg-brand-900 px-2 py-1 rounded text-slate-300">{vlh.cmdSnippet}</code>{' '}
            {vlh.emptyBodyAfter}
          </p>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-bright mb-2">{vlh.pageSpeedTitle}</h1>
        {summary.url && (
          <p className="text-slate-400 text-sm mb-1">
            <a href={summary.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all">
              {summary.url}
            </a>
          </p>
        )}
        <Card padding="tight" className="mt-4">
          <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">{vlh.analysisSettings}</h3>
          <div className="flex flex-wrap gap-6 text-sm">
            <div><span className="text-slate-500 block text-xs mb-0.5">{vlh.mode}</span><span className="text-slate-200 font-medium capitalize">{mode}</span></div>
            <div><span className="text-slate-500 block text-xs mb-0.5">{vlh.device}</span><span className="text-slate-200 font-medium capitalize">{device}</span></div>
            <div className="min-w-0">
              <span className="text-slate-500 block text-xs mb-0.5">{vlh.categories}</span>
              <span className="text-slate-200 font-medium">
                {Array.isArray(categories) ? categories.map((c) => CATEGORY_LABELS[c] || c).join(', ') : vlh.categoriesFallback}
              </span>
            </div>
          </div>
          {(runTimestamp || iterations) && (
            <p className="text-slate-500 text-xs mt-3 pt-3 border-t border-muted">
              {iterations > 0 && <span>{format(vlh.runsMediansFull, { n: iterations })}</span>}
              {runTimestamp && <span className="ml-3">{vlh.generated} {new Date(runTimestamp).toLocaleString()}</span>}
            </p>
          )}
        </Card>
      </div>

      {Array.isArray(data?.links) && data.links.length > 0 && (
        <Card shadow className="mb-8">
          <BrowserMlPanel links={data.links} compact />
        </Card>
      )}

      {/* ── Multi-page comparison ── */}
      {hasMulti && (
        <div className="mb-10">
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{vlh.multiCompare}</h2>
          <p className="text-slate-500 text-sm mb-3">{vlh.multiCompareHint}</p>
          <Card padding="none" overflowHidden>
            <MultiPageTable byUrl={byUrlForTable} selectedUrl={displayUrl} onSelect={handleSelectUrl} />
          </Card>
        </div>
      )}

      {/* ── URL selector ── */}
      {hasMulti && (
        <div className="mb-8" ref={detailRef}>
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{vlh.detailedView}</h2>
          <div className="flex items-center gap-3">
            <Globe className="h-4 w-4 text-slate-500 shrink-0" />
            {urlPool.length === 0 ? (
              <p className="text-sm text-slate-500">{vlh.noUrlMatch}</p>
            ) : (
              <select
                value={displayUrl || ''}
                onChange={(e) => setSelectedUrl(e.target.value)}
                className="bg-brand-800 border border-default text-sm rounded-lg px-3 py-2 text-slate-200 outline-none flex-1 max-w-lg"
              >
                {urlPool.map((url) => {
                  const sc = byUrl[url]?.category_scores?.performance;
                  const dot = sc != null ? (sc >= 90 ? '🟢' : sc >= 50 ? '🟡' : '🔴') : '⚪';
                  return <option key={url} value={url}>{dot} {url}</option>;
                })}
              </select>
            )}
          </div>
        </div>
      )}

      {/* ── Score Rings ── */}
      <div className="mb-10">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">{vlh.categoriesSection}</h2>
        <div className="flex flex-wrap gap-6 justify-start items-center">
          {CATEGORIES.map(({ id, label }) => (
            <ScoreRing key={id} label={label} score={cs[id] != null ? Number(cs[id]) : null} />
          ))}
        </div>
        <div className="flex flex-wrap gap-6 mt-4 text-xs text-slate-500">
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />{vlh.scorePoor}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1" />{vlh.scoreNeeds}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />{vlh.scoreGood}</span>
        </div>
      </div>

      {/* ── Category scores bar chart ── */}
      <div className="mb-10">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{vlh.categoryScores}</h2>
        <p className="text-slate-500 text-sm mb-3">{vlh.categoryScoresHint}</p>
        {(() => {
          const withScores = CATEGORIES
            .map(({ id }) => ({ id, label: CATEGORY_LABELS[id] || id, score: cs[id] != null ? Number(cs[id]) : null }))
            .filter((c) => c.score != null)
            .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
          if (withScores.length === 0) return <Card className="p-4 text-slate-500 text-sm">{vlh.noCategoryScores}</Card>;
          return (
            <Card padding="tight" className="print:break-inside-avoid">
              <div className="h-48" role="img" aria-label={`${vlh.categoryScoresAriaPrefix} ${withScores.map((c) => `${c.label} ${c.score}`).join(', ')}`}>
                <Bar
                  data={{
                    labels: withScores.map((c) => c.label),
                    datasets: [{ data: withScores.map((c) => c.score ?? 0), backgroundColor: withScores.map((c) => scoreBandColor(c.score)), label: vlh.datasetScore }],
                  }}
                  options={{
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { min: 0, max: 100, grid: { color: 'rgba(71, 85, 105, 0.5)' }, title: { display: true, text: vlh.scoreAxisTitle } },
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
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{vlh.metrics}</h2>
        <p className="text-slate-500 text-sm mb-4">
          {format(vlh.metricsHint, { runs: iterations || 1 })}
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
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{vlh.quickWins}</h2>
        <p className="text-slate-500 text-sm mb-4">
          {vlh.quickWinsHint}
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
            <h2 className="text-slate-200 text-sm font-bold uppercase tracking-wider mb-3">{vlh.summary}</h2>
            <pre className="text-slate-400 text-sm whitespace-pre-wrap font-sans">{humanSummary}</pre>
          </Card>
        </div>
      )}

      {/* ── Failing audits with Lighthouse detail tables ── */}
      {failingAuditsDetailed.length > 0 && (
        <div className="mb-10">
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{vlh.auditTables}</h2>
          <p className="text-slate-500 text-sm mb-3">
            {vlh.auditTablesHint}
          </p>
          {failingAuditsForDisplay.length > 0 ? (
            <ul className="space-y-2">
              {failingAuditsForDisplay.map((a) => (
                <LhAuditExpandable key={a.id} audit={a} />
              ))}
            </ul>
          ) : (
            <Card className="p-4 text-slate-500 text-sm">{vlh.noAuditsSearch}</Card>
          )}
        </div>
      )}

      {/* ── Grouped Diagnostics ── */}
      <div className="mb-8">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{vlh.diagnostics}</h2>
        <p className="text-slate-500 text-sm mb-4">
          {vlh.diagnosticsHint}
        </p>
        {diagnosticsList.length === 0 ? (
          <Card className="p-6 text-center text-slate-500 text-sm">
            {vlh.allChecksPassed}
          </Card>
        ) : diagnosticsForGroups.length === 0 ? (
          <Card className="p-6 text-center text-slate-500 text-sm">
            {vlh.noDiagnosticsSearch}
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
