import { useState, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { Gauge, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import { strings, format } from '../../../lib/strings';
import { SELECT_CLASS, SEO_ISSUE_RECOMMENDATIONS, severityBg } from '../../../utils/linkUtils';
import { formatLhMetric } from '../../../utils/linkUtils';
import { palette, scoreBandColor } from '../../../utils/chartPalette';
import { registerChartJsBase, barOptionsHorizontal } from '../../../utils/chartJsDefaults';

registerChartJsBase();

export default function IssuesTab({ lhData, inspectorDetails }) {
  const ci = strings.components.inspectorTabs;
  const it = strings.components.linkTabs.issues;
  const sj = strings.common;
  const [expandedIssue, setExpandedIssue] = useState(null);
  const [issueFilter, setIssueFilter] = useState('All');

  const allIssues = useMemo(() => {
    if (!inspectorDetails) return [];
    const list = [];
    inspectorDetails.broken.forEach((i) =>
      list.push({ severity: 'Critical', message: format(ci.brokenMessage, { status: i.status }), type: 'broken' })
    );
    inspectorDetails.redirects.forEach((i) =>
      list.push({
        severity: 'High',
        message: i.final_url
          ? format(it.redirectWithFinal, { status: i.status, finalUrl: i.final_url })
          : format(ci.redirectMessage, { status: i.status }),
        type: 'redirect',
      })
    );
    inspectorDetails.seoIssues.forEach((i) =>
      list.push({ severity: 'High', message: i.message, type: 'seo', recommendation: SEO_ISSUE_RECOMMENDATIONS[i.type] })
    );
    inspectorDetails.contentFlags.forEach((i) =>
      list.push({
        severity: 'Medium',
        message: `${i.label}${i.detail ? ` (${i.detail})` : ''}`,
        type: 'content',
        recommendation: i.recommendation,
      })
    );
    inspectorDetails.categoryIssues.forEach((i) =>
      list.push({
        severity: i.priority || 'Medium',
        message: i.message,
        type: 'category',
        category: i.category,
        recommendation: i.recommendation,
      })
    );
    inspectorDetails.securityFindings.forEach((i) =>
      list.push({
        severity: i.severity || 'Medium',
        message: i.message,
        type: 'security',
        recommendation: i.recommendation,
      })
    );
    return list;
  }, [inspectorDetails, ci, it]);

  const filteredIssues = useMemo(() => {
    if (issueFilter === 'All') return allIssues;
    return allIssues.filter((i) => (i.severity || '').toLowerCase() === issueFilter.toLowerCase());
  }, [allIssues, issueFilter]);

  const typeChart = useMemo(() => {
    const order = ['broken', 'redirect', 'seo', 'content', 'category', 'security'];
    const labels = [...it.typeLabels];
    const values = order.map((t) => allIssues.filter((i) => i.type === t).length);
    return { labels, values };
  }, [allIssues, it.typeLabels]);

  const typeBarOpts = useMemo(() => {
    const base = barOptionsHorizontal();
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const n = Number(ctx.raw);
              return ` ${format(it.issueTooltip, { n: n.toLocaleString(), s: n !== 1 ? 's' : '' })}`;
            },
          },
        },
      },
    };
  }, [it.issueTooltip]);

  return (
    <div className="space-y-6">
      {lhData && (() => {
        const cs = lhData.category_scores || {};
        const mm = lhData.median_metrics || {};
        const topFailures = lhData.top_failures || [];
        return (
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5" /> {it.lighthouseScores}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {['performance', 'accessibility', 'best-practices', 'seo'].map((cat) => {
                const score = cs[cat] != null ? Number(cs[cat]) : null;
                const color = score != null ? scoreBandColor(score) : 'rgb(71,85,105)';
                return (
                  <div key={cat} className="bg-brand-900 rounded-xl p-3 border border-default text-center">
                    <div className="text-xs text-slate-500 capitalize mb-1">{cat.replace('-', ' ')}</div>
                    <div className="text-xl font-bold" style={{ color }}>{score != null ? score : sj.emDash}</div>
                  </div>
                );
              })}
            </div>
            <div className="bg-brand-900 border border-default rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-4">
              {[['LCP', 'lcp_ms'], ['FCP', 'fcp_ms'], ['TBT', 'tbt_ms'], ['CLS', 'cls']].map(([label, key]) => (
                <div key={key}>
                  <span className="text-slate-500">{label} </span>
                  <span className="text-slate-200 font-mono">{formatLhMetric(key, mm[key])}</span>
                </div>
              ))}
            </div>
            {topFailures.length > 0 && (
              <>
                <div className="text-xs text-slate-500 mb-2">{it.lighthouseFailures}</div>
                <div className="space-y-2">
                  {topFailures.map((f, i) => (
                    <div key={i} className="bg-brand-800 border border-default rounded-lg px-3 py-2 text-xs text-slate-300">
                      {f.helpText || f.id}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })()}

      <div>
        {allIssues.length > 0 && (
          <div className="bg-brand-900 border border-default rounded-xl p-3 mb-4">
            <div className="text-xs text-slate-500 mb-2">{it.issuesBySource}</div>
            <div className="h-36">
              <Bar
                data={{
                  labels: typeChart.labels,
                  datasets: [{ data: typeChart.values, backgroundColor: palette(typeChart.labels.length) }],
                }}
                options={typeBarOpts}
              />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {format(it.allIssues, { count: allIssues.length })}
          </h3>
          <select
            value={issueFilter}
            onChange={(e) => setIssueFilter(e.target.value)}
            className={`${SELECT_CLASS} text-xs py-1.5`}
          >
            <option value="All">{it.filterAllSeverities}</option>
            <option value="Critical">{it.filterCritical}</option>
            <option value="High">{it.filterHigh}</option>
            <option value="Medium">{it.filterMedium}</option>
            <option value="Low">{it.filterLow}</option>
          </select>
        </div>

        {filteredIssues.length === 0 ? (
          <div className="text-slate-500 text-sm py-4 text-center">
            {it.noIssues}
            {issueFilter !== 'All' ? format(it.noIssuesAtSeverity, { severity: issueFilter }) : '.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredIssues.map((issue, i) => (
              <div key={i}>
                <button
                  type="button"
                  onClick={() => setExpandedIssue(expandedIssue === i ? null : i)}
                  className="w-full flex items-center gap-3 bg-brand-800 border border-default hover:bg-brand-700 rounded-xl px-4 py-3 text-left transition-colors"
                >
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold shrink-0 ${severityBg(issue.severity)}`}>
                    {issue.severity}
                  </span>
                  <span className="text-sm text-slate-200 flex-1 min-w-0 truncate">{issue.message}</span>
                  {expandedIssue === i ? (
                    <ChevronUp className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  )}
                </button>
                {expandedIssue === i && issue.recommendation && (
                  <div className="mx-2 border-x border-b border-default rounded-b-xl bg-brand-900 px-4 py-3">
                    <span className="text-xs text-blue-400 font-semibold">{it.recommendation}</span>
                    <span className="text-xs text-slate-300">{issue.recommendation}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {inspectorDetails?.recommendations?.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{it.whatToImprove}</h3>
          <div className="space-y-2">
            {inspectorDetails.recommendations.map((rec, i) => (
              <div
                key={i}
                className="flex items-start gap-2 bg-brand-800 border border-default rounded-lg px-4 py-2.5"
              >
                <ChevronRight className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                <span className="text-sm text-slate-300">{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
