'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertOctagon,
  ArrowLeftRight,
  ChevronRight,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { ReportPayload } from '@/types';
import { strings, format } from '@/lib/strings';
import { Card, Badge } from '@/components';
import { CategoryScoreGauge } from '@/components/charts/CategoryScoreGauge';

const vo = strings.views.overview;

export interface TopExecutiveIssue {
  message?: string;
  priority?: string;
  gsc_clicks?: number;
  url?: string;
  category?: string;
}

export interface OverviewExecutiveSummaryProps {
  data: ReportPayload;
  currentHealth: number | null;
  topIssues: TopExecutiveIssue[];
  compareHref: string;
  reportCount: number;
  querySuffix: string;
}

function countIssuesByPriority(categories: ReportPayload['categories']) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  for (const cat of categories || []) {
    for (const iss of cat?.issues || []) {
      counts.total += 1;
      const p = String(iss?.priority || '');
      if (p === 'Critical') counts.critical += 1;
      else if (p === 'High') counts.high += 1;
      else if (p === 'Medium') counts.medium += 1;
      else counts.low += 1;
    }
  }
  return counts;
}

function priorityBadgeVariant(priority?: string): string {
  if (priority === 'Critical') return 'critical';
  if (priority === 'High') return 'high';
  if (priority === 'Medium') return 'medium';
  return 'low';
}

function HealthTrendSparkline({ scores }: { scores: number[] }) {
  const fillId = useId();
  if (scores.length < 2) return null;

  const ordered = [...scores].reverse();
  const max = Math.max(...ordered);
  const min = Math.min(...ordered);
  const range = max - min || 1;
  const coords = ordered
    .map((score, i) => {
      const x = (i / (ordered.length - 1)) * 100;
      const y = 100 - ((score - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      viewBox="0 0 100 32"
      className="h-8 w-full max-w-[140px] text-link/80"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
      <polyline fill={`url(#${fillId})`} stroke="none" points={`0,32 ${coords} 100,32`} />
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(59 130 246 / 0.25)" />
          <stop offset="100%" stopColor="rgb(59 130 246 / 0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ExecutiveIssueRow({
  issue,
  issuesHref,
}: {
  issue: TopExecutiveIssue;
  issuesHref: string;
}) {
  const clicks = Number(issue.gsc_clicks || 0);
  const scopeLabel = issue.url
    ? issue.url.replace(/^https?:\/\//, '').slice(0, 72)
    : vo.issueSitewideScope;

  return (
    <Link
      href={issuesHref}
      className="group flex items-center gap-3 rounded-lg border border-default/60 bg-brand-900/30 px-3 py-2.5 transition-colors hover:border-blue-500/30 hover:bg-brand-900/50"
    >
      <Badge variant={priorityBadgeVariant(issue.priority)} label={issue.priority || vo.issueUnknownPriority} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{issue.message || vo.issueUntitled}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {scopeLabel}
          {clicks > 0 ? (
            <>
              {' · '}
              {format(vo.issueClicksImpact, { clicks: clicks.toLocaleString() })}
            </>
          ) : null}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-link" />
    </Link>
  );
}

export function OverviewExecutiveSummary({
  data,
  currentHealth,
  topIssues,
  compareHref,
  reportCount,
  querySuffix,
}: OverviewExecutiveSummaryProps) {
  const [healthDelta, setHealthDelta] = useState<number | null>(null);
  const [healthTrend, setHealthTrend] = useState<number[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const execSummary = data.executive_summary?.summary;
  const execPriorities = (data.executive_summary?.priorities || []).filter(Boolean);
  const execSource = data.executive_summary?.source;
  const isAiSummary = execSource === 'ai_insights' && Boolean(execSummary);

  const issueCounts = useMemo(() => countIssuesByPriority(data.categories), [data.categories]);
  const issuesHref = `/issues${querySuffix}`;
  const showHero = currentHealth != null || topIssues.length > 0 || Boolean(execSummary);

  useEffect(() => {
    const domain = data.site_name || '';
    if (!domain) return;
    setHistoryError(null);
    void fetch(`/api/report/history?domain=${encodeURIComponent(domain)}&limit=8`)
      .then(async (r) => {
        if (!r.ok) {
          setHistoryError(vo.historyTrendUnavailable);
          return;
        }
        const payload = (await r.json()) as { history?: Array<{ healthScore?: number | null }> };
        const hist = payload.history || [];
        const scores = hist
          .map((row) => row.healthScore)
          .filter((score): score is number => score != null && Number.isFinite(score));
        setHealthTrend(scores);
        if (hist.length >= 2 && currentHealth != null && hist[1]?.healthScore != null) {
          setHealthDelta(currentHealth - Number(hist[1].healthScore));
        }
      })
      .catch(() => setHistoryError(vo.historyTrendUnavailable));
  }, [data.site_name, currentHealth]);

  if (!showHero) return null;

  return (
    <div className="space-y-4">
      {(currentHealth != null || topIssues.length > 0) && (
        <Card shadow className="border border-default overflow-hidden">
          {currentHealth != null ? (
            <div className="flex flex-col gap-5 border-b border-muted/60 p-4 sm:p-5 lg:flex-row lg:items-center">
              <CategoryScoreGauge name={vo.auditHealth} score={currentHealth} size="lg" />

              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    {healthDelta != null ? (
                      <div
                        className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                          healthDelta > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : healthDelta < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {healthDelta > 0 ? (
                          <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />
                        ) : healthDelta < 0 ? (
                          <TrendingDown className="h-4 w-4 shrink-0" aria-hidden />
                        ) : null}
                        {healthDelta === 0
                          ? vo.healthDeltaFlat
                          : format(vo.healthDeltaVsPrior, {
                              delta: `${healthDelta > 0 ? '+' : ''}${healthDelta}`,
                            })}
                      </div>
                    ) : null}
                    {historyError ? (
                      <p className="mt-1 text-xs text-muted-foreground">{historyError}</p>
                    ) : null}
                    {issueCounts.total > 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {format(vo.executiveIssueCounts, {
                          total: issueCounts.total.toLocaleString(),
                          critical: issueCounts.critical.toLocaleString(),
                          high: issueCounts.high.toLocaleString(),
                        })}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">{vo.executiveNoIssues}</p>
                    )}
                  </div>
                  {healthTrend.length >= 2 ? (
                    <div className="sm:text-right">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {vo.healthTrendLabel}
                      </p>
                      <HealthTrendSparkline scores={healthTrend} />
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={issuesHref}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                  >
                    <AlertOctagon className="h-4 w-4" />
                    {vo.viewAllIssues}
                  </Link>
                  {reportCount >= 2 ? (
                    <Link
                      href={compareHref}
                      className="inline-flex items-center gap-2 rounded-lg border border-default px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-brand-700/50"
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                      {strings.views.compare.title}
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {topIssues.length > 0 ? (
            <div className="p-4 sm:p-5">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {vo.needsAttention}
              </h3>
              <div className="space-y-2">
                {topIssues.slice(0, 5).map((issue, i) => (
                  <ExecutiveIssueRow key={`${issue.message}-${i}`} issue={issue} issuesHref={issuesHref} />
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      )}

      {isAiSummary || execPriorities.length > 0 ? (
        <Card shadow className="border border-fuchsia-500/20 bg-fuchsia-500/5">
          <div className="p-4 sm:p-5">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-fuchsia-700 dark:text-fuchsia-300" aria-hidden />
              <h3 className="text-sm font-bold text-bright">{vo.executiveAiLabel}</h3>
            </div>
            {isAiSummary ? (
              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{execSummary}</p>
            ) : null}
            {execPriorities.length > 0 ? (
              <div className={`flex flex-wrap gap-2 ${isAiSummary ? 'mt-4' : ''}`}>
                {execPriorities.map((line, i) => (
                  <span
                    key={`${line}-${i}`}
                    className="rounded-full border border-default bg-brand-900/40 px-3 py-1.5 text-xs text-foreground"
                  >
                    {line}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </Card>
      ) : !isAiSummary && execSummary && topIssues.length === 0 ? (
        <Card padding="tight">
          <p className="text-sm text-muted-foreground">{execSummary}</p>
        </Card>
      ) : null}
    </div>
  );
}
