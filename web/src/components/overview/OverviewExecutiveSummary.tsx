
import { useEffect, useMemo, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { Link } from 'react-router-dom';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeftRight,
  ChevronRight,
  Info,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { ReportPayload } from '@/types';
import { strings, format } from '@/lib/strings';
import { Card, Badge, StatCard } from '@/components';
import { Skeleton } from '@/components/Skeleton';
import { CompactAreaSparkline } from '@/components/charts/compact';
import { useInView } from '@/lib/useInView';
import { CategoryScoreGauge } from '@/components/charts/CategoryScoreGauge';
import { countIssuesByPriority } from './overviewAtAGlanceMetrics';
import { PRIORITY_CONFIG, PRIORITY_ORDER, normalizePriority } from '@/lib/issuePriority';

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

function priorityBadgeVariant(priority?: string): string {
  if (priority === 'Critical') return 'critical';
  if (priority === 'High') return 'high';
  if (priority === 'Medium') return 'medium';
  return 'low';
}

function priorityIconFor(priority?: string) {
  const p = normalizePriority(priority);
  if (p === 'Critical') return AlertOctagon;
  if (p === 'Low') return Info;
  return AlertTriangle;
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
  const priorityCfg = PRIORITY_CONFIG[normalizePriority(issue.priority)];
  const PriorityIcon = priorityIconFor(issue.priority);

  return (
    <Link
      to={issuesHref}
      className="group flex items-center gap-3 rounded-lg border border-default/60 bg-brand-900/30 px-3 py-2.5 transition-colors hover:border-blue-500/30 hover:bg-brand-900/50"
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${priorityCfg.bg} ${priorityCfg.text}`}
      >
        <PriorityIcon className="h-4 w-4" aria-hidden />
      </div>
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
  const { ref: historyRef, inView: historyInView } = useInView<HTMLDivElement>({
    once: true,
    rootMargin: '200px',
  });
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

  const healthHeroDevData = useMemo(
    () => ({
      widget: 'overview.executiveSummary.healthHero',
      currentHealth,
      healthDelta,
      healthTrend,
      historyError,
      issueCounts,
      topIssues: topIssues.slice(0, 5),
      links: {
        issuesHref,
        compareHref: reportCount >= 2 ? compareHref : null,
      },
      raw: {
        executive_summary: data.executive_summary,
        site_health_score: data.site_health_score,
        summary_site_health: data.summary?.site_health_score,
      },
    }),
    [
      compareHref,
      currentHealth,
      data.executive_summary,
      data.site_health_score,
      data.summary?.site_health_score,
      healthDelta,
      healthTrend,
      historyError,
      issueCounts,
      issuesHref,
      reportCount,
      topIssues,
    ],
  );

  const executiveAiDevData = useMemo(
    () => ({
      widget: 'overview.executiveSummary.aiSummary',
      source: execSource,
      summary: execSummary,
      priorities: execPriorities,
      executive_summary: data.executive_summary,
    }),
    [data.executive_summary, execPriorities, execSource, execSummary],
  );

  const executiveTextDevData = useMemo(
    () => ({
      widget: 'overview.executiveSummary.textSummary',
      summary: execSummary,
      executive_summary: data.executive_summary,
    }),
    [data.executive_summary, execSummary],
  );

  useEffect(() => {
    const domain = data.site_name || '';
    setHealthDelta(null);
    setHealthTrend([]);
    setHistoryError(null);
    if (!domain || !historyInView) return;
    void apiFetch(apiUrl(`/report/history?domain=${encodeURIComponent(domain)}&limit=8`))
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
  }, [data.site_name, currentHealth, historyInView]);

  if (!showHero) return null;

  return (
    <div className="space-y-4">
      {(currentHealth != null || topIssues.length > 0) && (
        <Card shadow padding="none" devData={healthHeroDevData} className="border border-default overflow-hidden">
          {currentHealth != null ? (
            <>
              <div
                className="grid grid-cols-1 gap-4 border-b border-muted/60 p-4 sm:p-5 lg:grid-cols-12"
                ref={historyRef}
              >
                <div className="flex flex-col items-center gap-3 rounded-xl border border-default/60 bg-brand-900/30 p-4 lg:col-span-5">
                  <CategoryScoreGauge name={vo.auditHealth} score={currentHealth} size="lg" />
                  {healthDelta != null ? (
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                        healthDelta > 0
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : healthDelta < 0
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            : 'bg-brand-700/30 text-muted-foreground'
                      }`}
                    >
                      {healthDelta > 0 ? (
                        <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      ) : healthDelta < 0 ? (
                        <TrendingDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      ) : null}
                      {healthDelta === 0
                        ? vo.healthDeltaFlat
                        : format(vo.healthDeltaVsPrior, {
                            delta: `${healthDelta > 0 ? '+' : ''}${healthDelta}`,
                          })}
                    </div>
                  ) : null}
                  {historyError ? <p className="text-xs text-muted-foreground">{historyError}</p> : null}
                </div>

                <div className="flex flex-col rounded-xl border border-default/60 bg-brand-900/30 p-4 lg:col-span-7">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {vo.healthTrendLabel}
                  </p>
                  <div className="mt-3 flex flex-1 items-center">
                    {historyInView && healthTrend.length < 2 && !historyError ? (
                      <Skeleton className="h-16 w-full" />
                    ) : null}
                    {healthTrend.length >= 2 ? (
                      <CompactAreaSparkline
                        points={[...healthTrend].reverse()}
                        className="w-full"
                        heightClass="h-20"
                        strokeClassName="text-link/80"
                      />
                    ) : null}
                  </div>
                </div>
              </div>

              {issueCounts.total > 0 ? (
                <div className="grid grid-cols-2 gap-3 border-b border-muted/60 px-4 py-4 sm:grid-cols-4 sm:px-5">
                  {PRIORITY_ORDER.map((priority) => {
                    const cfg = PRIORITY_CONFIG[priority];
                    const Icon = priorityIconFor(priority);
                    const key = priority.toLowerCase() as 'critical' | 'high' | 'medium' | 'low';
                    return (
                      <StatCard
                        key={priority}
                        label={priority}
                        value={issueCounts[key].toLocaleString()}
                        icon={<Icon className={`h-3.5 w-3.5 ${cfg.text}`} aria-hidden />}
                        valueClassName={cfg.text}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="border-b border-muted/60 px-4 py-4 text-sm text-muted-foreground sm:px-5">
                  {vo.executiveNoIssues}
                </p>
              )}

              <div className="flex flex-wrap gap-2 p-4 sm:p-5">
                <Link
                  to={issuesHref}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                >
                  <AlertOctagon className="h-4 w-4" />
                  {vo.viewAllIssues}
                </Link>
                {reportCount >= 2 ? (
                  <Link
                    to={compareHref}
                    className="inline-flex items-center gap-2 rounded-lg border border-default px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-brand-700/50"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                    {strings.views.compare.title}
                  </Link>
                ) : null}
              </div>
            </>
          ) : null}

          {topIssues.length > 0 ? (
            <div className={`p-4 sm:p-5 ${currentHealth != null ? 'border-t border-muted/60' : ''}`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {vo.needsAttention}
                </h3>
                <span className="shrink-0 rounded-full border border-default bg-brand-900/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {format(vo.needsAttentionTotal, { total: issueCounts.total.toLocaleString() })}
                </span>
              </div>
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
        <Card shadow devData={executiveAiDevData} className="border border-fuchsia-500/20 bg-fuchsia-500/5">
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
        <Card padding="tight" devData={executiveTextDevData}>
          <p className="text-sm text-muted-foreground">{execSummary}</p>
        </Card>
      ) : null}
    </div>
  );
}
