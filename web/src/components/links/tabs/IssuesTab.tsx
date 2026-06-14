import { useState, useMemo } from 'react';
import type { TooltipItem, ChartOptions } from 'chart.js';
import { Gauge, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import type { InspectorDetails, InspectorIssueRow, LinkLighthouseData, LighthouseAuditRef } from '@/types/report';
import { strings, format } from '../../../lib/strings';
import { SELECT_CLASS, SEO_ISSUE_RECOMMENDATIONS, severityBg } from '../../../utils/linkUtils';
import { formatLhMetric } from '../../../utils/linkUtils';
import { palette, scoreBandColor } from '../../../utils/chartPalette';
import { registerChartJsBase, barOptionsHorizontal } from '../../../utils/chartJsDefaults';
import { RankedBarChart } from '../../../components/charts';
import { formatCompositionAria } from '../../../lib/chartDoughnutUtils';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import {
  buildInspectorIssueContext,
  buildLighthouseFailureContext,
  buildRecommendationBulletContext,
} from '@/lib/fixSuggestionContext';

registerChartJsBase();

export interface IssuesTabProps {
  lhData?: LinkLighthouseData | null;
  inspectorDetails: InspectorDetails | null;
  pageUrl?: string;
}

export default function IssuesTab({ lhData, inspectorDetails, pageUrl }: IssuesTabProps) {
  const ci = strings.components.inspectorTabs;
  const it = strings.components.linkTabs.issues;
  const sj = strings.common;
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const [issueFilter, setIssueFilter] = useState('All');

  const allIssues = useMemo((): InspectorIssueRow[] => {
    if (!inspectorDetails) return [];
    const list: InspectorIssueRow[] = [];
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
      list.push({
        severity: 'High',
        message: i.message || '',
        type: 'seo',
        recommendation: i.type ? SEO_ISSUE_RECOMMENDATIONS[i.type as keyof typeof SEO_ISSUE_RECOMMENDATIONS] : undefined,
      })
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
        message: i.message ?? '',
        type: 'category',
        category: i.category,
        recommendation: i.recommendation,
      })
    );
    inspectorDetails.securityFindings.forEach((i) =>
      list.push({
        severity: i.severity || 'Medium',
        message: i.message ?? '',
        type: 'security',
        recommendation: i.recommendation,
      })
    );
    (inspectorDetails.browserIssues || []).forEach((i) =>
      list.push({
        severity: i.severity || 'High',
        message: i.message ?? '',
        type: 'browser',
        detail: i.detail,
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
    const order = ['broken', 'redirect', 'seo', 'content', 'category', 'security', 'browser'] as const;
    const labels = [...it.typeLabels];
    const values = order.map((t) => allIssues.filter((i) => i.type === t).length);
    const filteredLabels: string[] = [];
    const filteredValues: number[] = [];
    labels.forEach((label, i) => {
      if (values[i] > 0) {
        filteredLabels.push(label);
        filteredValues.push(values[i]);
      }
    });
    const aria = formatCompositionAria(filteredLabels, filteredValues, 'issues');
    return { labels: filteredLabels, values: filteredValues, aria };
  }, [allIssues, it.typeLabels]);

  const typeBarOpts = useMemo((): ChartOptions<'bar'> => {
    const base = barOptionsHorizontal(undefined, typeChart.labels);
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<'bar'>) => {
              const n = Number(ctx.raw);
              return ` ${format(it.issueTooltip, { n: n.toLocaleString(), s: n !== 1 ? 's' : '' })}`;
            },
          },
        },
      },
    } as ChartOptions<'bar'>;
  }, [it.issueTooltip, typeChart.labels]);

  return (
    <div className="space-y-6">
      {lhData && (() => {
        const cs = lhData.category_scores || {};
        const mm = lhData.median_metrics || {};
        const topFailures = lhData.top_failures || [];
        return (
          <div>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5" /> {it.lighthouseScores}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {['performance', 'accessibility', 'best-practices', 'seo'].map((cat) => {
                const score = cs[cat] != null ? Number(cs[cat]) : null;
                const color = score != null ? scoreBandColor(score) : 'rgb(71,85,105)';
                return (
                  <div key={cat} className="bg-brand-900 rounded-xl p-3 border border-default text-center">
                    <div className="text-xs text-muted-foreground capitalize mb-1">{cat.replace('-', ' ')}</div>
                    <div className="text-xl font-bold" style={{ color }}>{score != null ? score : sj.emDash}</div>
                  </div>
                );
              })}
            </div>
            <div className="bg-brand-900 border border-default rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-4">
              {[['LCP', 'lcp_ms'], ['FCP', 'fcp_ms'], ['TBT', 'tbt_ms'], ['CLS', 'cls']].map(([label, key]) => (
                <div key={key}>
                  <span className="text-muted-foreground">{label} </span>
                  <span className="text-foreground font-mono">{formatLhMetric(key, mm[key])}</span>
                </div>
              ))}
            </div>
            {topFailures.length > 0 && (
              <>
                <div className="text-xs text-muted-foreground mb-2">{it.lighthouseFailures}</div>
                <div className="space-y-2">
                  {topFailures.map((f: LighthouseAuditRef, i: number) => (
                    <div key={i} className="bg-brand-800 border border-default rounded-lg px-3 py-2 text-xs text-foreground space-y-2">
                      <span>{f.helpText || f.id}</span>
                      <AiSuggestionButton
                        request={buildLighthouseFailureContext(f.helpText || f.id || '', f.id, pageUrl)}
                      />
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
            <div className="text-xs text-muted-foreground mb-2">{it.issuesBySource}</div>
            <div className="h-36">
              <RankedBarChart
                ariaSummary={typeChart.aria}
                heightClass="h-36"
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
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
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
          <div className="text-muted-foreground text-sm py-4 text-center">
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
                  <span className="text-sm text-foreground flex-1 min-w-0 truncate">{issue.message}</span>
                  {expandedIssue === i ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </button>
                {expandedIssue === i && (issue.detail || issue.recommendation) && (
                  <div className="mx-2 border-x border-b border-default rounded-b-xl bg-brand-900 px-4 py-3 space-y-2">
                    {issue.detail ? (
                      <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">{issue.detail}</pre>
                    ) : null}
                    {issue.recommendation ? (
                      <p className="text-xs text-foreground">
                        <span className="text-link font-semibold">{it.recommendation} </span>
                        {issue.recommendation}
                      </p>
                    ) : null}
                    <AiSuggestionButton request={buildInspectorIssueContext(issue, pageUrl)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {inspectorDetails && (inspectorDetails.recommendations?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{it.whatToImprove}</h3>
          <div className="space-y-2">
            {inspectorDetails.recommendations.map((rec: string, i: number) => (
              <div
                key={i}
                className="flex flex-col gap-2 bg-brand-800 border border-default rounded-lg px-4 py-2.5"
              >
                <div className="flex items-start gap-2">
                  <ChevronRight className="h-3.5 w-3.5 text-link shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground flex-1">{rec}</span>
                </div>
                <AiSuggestionButton request={buildRecommendationBulletContext(rec, pageUrl)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
