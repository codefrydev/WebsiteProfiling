import { useState, useMemo } from 'react';
import { Gauge, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import { SELECT_CLASS, SEO_ISSUE_RECOMMENDATIONS, severityBg } from '../../../utils/linkUtils';
import { formatLhMetric } from '../../../utils/linkUtils';
import { scoreBandColor } from '../../../utils/chartPalette';

export default function IssuesTab({ lhData, inspectorDetails }) {
  const [expandedIssue, setExpandedIssue] = useState(null);
  const [issueFilter, setIssueFilter] = useState('All');

  const allIssues = useMemo(() => {
    if (!inspectorDetails) return [];
    const list = [];
    inspectorDetails.broken.forEach((i) =>
      list.push({ severity: 'Critical', message: `Broken / error response (${i.status})`, type: 'broken' })
    );
    inspectorDetails.redirects.forEach((i) =>
      list.push({ severity: 'High', message: `Redirect ${i.status}${i.final_url ? ` → ${i.final_url}` : ''}`, type: 'redirect' })
    );
    inspectorDetails.seoIssues.forEach((i) =>
      list.push({ severity: 'High', message: i.message, type: 'seo', recommendation: SEO_ISSUE_RECOMMENDATIONS[i.type] })
    );
    inspectorDetails.contentFlags.forEach((i) =>
      list.push({ severity: 'Medium', message: `${i.label}${i.detail ? ` (${i.detail})` : ''}`, type: 'content', recommendation: i.recommendation })
    );
    inspectorDetails.categoryIssues.forEach((i) =>
      list.push({ severity: i.priority || 'Medium', message: i.message, type: 'category', category: i.category, recommendation: i.recommendation })
    );
    inspectorDetails.securityFindings.forEach((i) =>
      list.push({ severity: i.severity || 'Medium', message: i.message, type: 'security', recommendation: i.recommendation })
    );
    return list;
  }, [inspectorDetails]);

  const filteredIssues = useMemo(() => {
    if (issueFilter === 'All') return allIssues;
    return allIssues.filter((i) => (i.severity || '').toLowerCase() === issueFilter.toLowerCase());
  }, [allIssues, issueFilter]);

  return (
    <div className="space-y-6">
      {/* Lighthouse scores if available */}
      {lhData && (() => {
        const cs = lhData.category_scores || {};
        const mm = lhData.median_metrics || {};
        const topFailures = lhData.top_failures || [];
        return (
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5" /> Lighthouse Scores
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {['performance', 'accessibility', 'best-practices', 'seo'].map((cat) => {
                const score = cs[cat] != null ? Number(cs[cat]) : null;
                const color = score != null ? scoreBandColor(score) : 'rgb(71,85,105)';
                return (
                  <div key={cat} className="bg-brand-900 rounded-xl p-3 border border-default text-center">
                    <div className="text-xs text-slate-500 capitalize mb-1">{cat.replace('-', ' ')}</div>
                    <div className="text-xl font-bold" style={{ color }}>{score != null ? score : '—'}</div>
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
                <div className="text-xs text-slate-500 mb-2">Lighthouse failures</div>
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

      {/* Issues list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            All Issues ({allIssues.length})
          </h3>
          <select
            value={issueFilter}
            onChange={(e) => setIssueFilter(e.target.value)}
            className={`${SELECT_CLASS} text-xs py-1.5`}
          >
            <option value="All">All Severities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        {filteredIssues.length === 0 ? (
          <div className="text-slate-500 text-sm py-4 text-center">
            No issues found{issueFilter !== 'All' ? ` at ${issueFilter} severity` : ''}.
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
                  {expandedIssue === i
                    ? <ChevronUp className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    : <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
                </button>
                {expandedIssue === i && issue.recommendation && (
                  <div className="mx-2 border-x border-b border-default rounded-b-xl bg-brand-900 px-4 py-3">
                    <span className="text-xs text-blue-400 font-semibold">Recommendation: </span>
                    <span className="text-xs text-slate-300">{issue.recommendation}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommendations */}
      {inspectorDetails?.recommendations?.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">What to improve</h3>
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
