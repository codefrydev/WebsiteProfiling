'use client';

import { useMemo, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

const CompareGoogleCharts = dynamic(
  () => import('./CompareCharts').then((m) => m.CompareGoogleCharts),
  { ssr: false, loading: () => <div className="h-56 rounded-xl bg-brand-800/40 animate-pulse mb-4" /> },
);
const ComparePerformanceCharts = dynamic(
  () => import('./CompareCharts').then((m) => m.ComparePerformanceCharts),
  { ssr: false },
);
import type { IssueDeltaRow } from '@/lib/reportCompareExtras';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { CompareMetricRow, ReportCompareSummary } from '@/lib/reportCompare';
import { Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, Badge } from '@/components';
import { CompareMetricCard } from './CompareDeltaBadge';

function ScoreDelta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs">
        <Minus className="h-3 w-3" /> 0
      </span>
    );
  }
  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = up ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${color}`}>
      <Icon className="h-3 w-3" />
      {up ? '+' : ''}
      {delta}
    </span>
  );
}

function matchesQuery(text: string, q: string): boolean {
  return text.toLowerCase().includes(q);
}

type CompareStrings = (typeof import('@/lib/strings').strings)['views']['compare'];

interface PanelProps {
  compare: ReportCompareSummary;
  searchQuery: string;
  vc: CompareStrings;
  emptyLabel: string;
  siteMetrics?: CompareMetricRow[];
}

export function CompareIssuesPanel({ compare, searchQuery, vc, emptyLabel }: PanelProps) {
  const q = searchQuery.trim().toLowerCase();
  const { extras } = compare;
  const newIssues = useMemo(() => {
    if (!q) return extras.issueDeltas.filter((r) => r.kind === 'new');
    return extras.issueDeltas.filter(
      (r) =>
        r.kind === 'new' &&
        (matchesQuery(r.url, q) ||
          matchesQuery(r.category, q) ||
          matchesQuery(r.message, q) ||
          matchesQuery(r.priority, q)),
    );
  }, [extras.issueDeltas, q]);
  const resolvedIssues = useMemo(() => {
    if (!q) return extras.issueDeltas.filter((r) => r.kind === 'resolved');
    return extras.issueDeltas.filter(
      (r) =>
        r.kind === 'resolved' &&
        (matchesQuery(r.url, q) ||
          matchesQuery(r.category, q) ||
          matchesQuery(r.message, q) ||
          matchesQuery(r.priority, q)),
    );
  }, [extras.issueDeltas, q]);

  const security = useMemo(() => {
    if (!q) return extras.securityDeltas;
    return extras.securityDeltas.filter(
      (r) =>
        matchesQuery(r.url, q) ||
        matchesQuery(r.message, q) ||
        matchesQuery(r.findingType, q) ||
        matchesQuery(r.severity, q),
    );
  }, [extras.securityDeltas, q]);

  const redirects = useMemo(() => {
    if (!q) return extras.redirectDeltas;
    return extras.redirectDeltas.filter(
      (r) => matchesQuery(r.url, q) || matchesQuery(r.finalUrl, q) || matchesQuery(r.status, q),
    );
  }, [extras.redirectDeltas, q]);

  const hasAny =
    newIssues.length > 0 ||
    resolvedIssues.length > 0 ||
    security.length > 0 ||
    redirects.length > 0 ||
    extras.priorityCounts.some((p) => p.delta !== 0);

  if (!hasAny) {
    return (
      <Card shadow>
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {extras.priorityCounts.some((p) => p.current > 0 || p.baseline > 0) ? (
        <Card shadow>
          <h3 className="text-sm font-bold text-foreground mb-3">{vc.priorityMix}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {extras.priorityCounts.map((row) => (
              <div key={row.priority} className="bg-brand-900/50 border border-default rounded-lg p-3">
                <div className="text-xs text-muted-foreground uppercase">{row.priority}</div>
                <div className="text-lg font-bold text-bright tabular-nums">{row.current}</div>
                <div className="text-[11px] text-muted-foreground">
                  was {row.baseline} · <ScoreDelta delta={row.delta} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {newIssues.length > 0 ? (
        <IssueTable title={vc.newIssues} rows={newIssues} vc={vc} kind="new" />
      ) : null}
      {resolvedIssues.length > 0 ? (
        <IssueTable title={vc.resolvedIssues} rows={resolvedIssues} vc={vc} kind="resolved" />
      ) : null}

      {security.length > 0 ? (
        <Card shadow>
          <h3 className="text-sm font-bold text-foreground mb-3">{vc.securityChanges}</h3>
          <ScrollTable>
            <TableHead sticky>
              <TableRow>
                <TableHeadCell>{vc.colKind}</TableHeadCell>
                <TableHeadCell>{vc.colMessage}</TableHeadCell>
                <TableHeadCell>URL</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody striped>
              {security.map((row) => (
                <TableRow key={`${row.kind}-${row.url}-${row.message}`}>
                  <TableCell>
                    <KindBadge kind={row.kind} vc={vc} />
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="font-medium">{row.findingType}</span>
                    <span className="text-muted-foreground"> · {row.severity}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{row.message}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs break-all">{row.url}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ScrollTable>
        </Card>
      ) : null}

      {redirects.length > 0 ? (
        <Card shadow>
          <h3 className="text-sm font-bold text-foreground mb-3">{vc.redirectChanges}</h3>
          <ScrollTable>
            <TableHead sticky>
              <TableRow>
                <TableHeadCell>{vc.colKind}</TableHeadCell>
                <TableHeadCell>URL</TableHeadCell>
                <TableHeadCell>Status</TableHeadCell>
                <TableHeadCell>Final URL</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody striped>
              {redirects.map((row) => (
                <TableRow key={`${row.kind}-${row.url}`}>
                  <TableCell>
                    <KindBadge kind={row.kind === 'new' ? 'new' : 'removed'} vc={vc} />
                  </TableCell>
                  <TableCell className="font-mono text-xs break-all">{row.url}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell className="font-mono text-xs break-all text-muted-foreground">{row.finalUrl || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ScrollTable>
        </Card>
      ) : null}
    </div>
  );
}

function IssueTable({
  title,
  rows,
  vc,
  kind,
}: {
  title: string;
  rows: IssueDeltaRow[];
  vc: CompareStrings;
  kind: 'new' | 'resolved';
}) {
  return (
    <Card shadow>
      <h3 className="text-sm font-bold text-foreground mb-3">{title}</h3>
      <ScrollTable>
        <TableHead sticky>
          <TableRow>
            <TableHeadCell>{vc.colPriority}</TableHeadCell>
            <TableHeadCell>{vc.colCategory}</TableHeadCell>
            <TableHeadCell>{vc.colMessage}</TableHeadCell>
            <TableHeadCell>URL</TableHeadCell>
          </TableRow>
        </TableHead>
        <TableBody striped>
          {rows.map((row) => (
            <TableRow key={`${kind}-${row.url}-${row.message}`}>
              <TableCell>
                <Badge variant={row.priority === 'Critical' || row.priority === 'High' ? 'high' : 'medium'} label={row.priority} />
              </TableCell>
              <TableCell className="text-sm">{row.category}</TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-md">{row.message}</TableCell>
              <TableCell className="font-mono text-xs break-all">{row.url}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </ScrollTable>
    </Card>
  );
}

function KindBadge({ kind, vc }: { kind: string; vc: CompareStrings }) {
  const label =
    kind === 'new' || kind === 'added'
      ? vc.kindNew
      : kind === 'resolved'
        ? vc.kindResolved
        : kind === 'removed'
          ? vc.kindRemoved
          : vc.kindChanged;
  const variant = kind === 'new' || kind === 'added' ? 'high' : kind === 'resolved' ? 'success' : 'medium';
  return <Badge variant={variant} label={label} />;
}

function ScrollTable({ children }: { children: ReactNode }) {
  return (
    <div className="max-h-[min(420px,50vh)] overflow-y-auto">
      <Table>{children}</Table>
    </div>
  );
}

export function ComparePerformancePanel({
  compare,
  searchQuery,
  vc,
  emptyLabel,
  siteMetrics = [],
}: PanelProps) {
  const q = searchQuery.trim().toLowerCase();
  const lh = useMemo(() => {
    if (!q) return compare.extras.lighthouseUrls;
    return compare.extras.lighthouseUrls.filter((r) => matchesQuery(r.url, q));
  }, [compare.extras.lighthouseUrls, q]);

  const hasPerfChart = siteMetrics.some((m) =>
    ['lh_perf', 'lh_seo', 'resp_p50', 'resp_p95', 'crawl_time'].includes(m.id),
  );

  if (lh.length === 0 && !hasPerfChart) {
    return (
      <Card shadow>
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ComparePerformanceCharts
        siteMetrics={siteMetrics}
        contentMetrics={compare.extras.contentMetrics}
        vc={vc}
      />
      {lh.length > 0 ? (
        <Card shadow>
          <h3 className="text-sm font-bold text-foreground mb-3">{vc.lighthouseByUrl}</h3>
          <ScrollTable>
            <TableHead sticky>
              <TableRow>
                <TableHeadCell>URL</TableHeadCell>
                <TableHeadCell>Perf Δ</TableHeadCell>
                <TableHeadCell>SEO Δ</TableHeadCell>
                <TableHeadCell>{vc.colCurrent}</TableHeadCell>
                <TableHeadCell>{vc.colBaseline}</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody striped>
              {lh.map((row) => (
                <TableRow key={row.url}>
                  <TableCell className="font-mono text-xs break-all max-w-[35%]">{row.url}</TableCell>
                  <TableCell>
                    <LhDelta delta={row.performanceDelta} />
                  </TableCell>
                  <TableCell>
                    <LhDelta delta={row.seoDelta} />
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    {row.performanceCurrent ?? '—'} / {row.seoCurrent ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    {row.performanceBaseline ?? '—'} / {row.seoBaseline ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ScrollTable>
        </Card>
      ) : null}
    </div>
  );
}

function LhDelta({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-muted-foreground text-xs">—</span>;
  const improved = delta > 0;
  const color = improved ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
  return (
    <span className={`text-xs font-bold tabular-nums ${color}`}>
      {delta > 0 ? '+' : ''}
      {delta}
    </span>
  );
}

const CompareContentCharts = dynamic(
  () => import('./CompareCharts').then((m) => m.CompareContentCharts),
  { ssr: false },
);

export function CompareContentPanel({ compare, searchQuery, vc, emptyLabel }: PanelProps) {
  const q = searchQuery.trim().toLowerCase();
  const dups = useMemo(() => {
    if (!q) return compare.extras.duplicateDeltas;
    return compare.extras.duplicateDeltas.filter(
      (r) => matchesQuery(r.representativeUrl, q) || matchesQuery(r.clusterId, q),
    );
  }, [compare.extras.duplicateDeltas, q]);
  const tech = compare.extras.techDeltas;
  const metrics = compare.extras.contentMetrics.filter(
    (m) => !['resp_p50', 'resp_p95', 'crawl_time'].includes(m.id),
  );

  if (metrics.length === 0 && dups.length === 0 && tech.length === 0) {
    return (
      <Card shadow>
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <CompareContentCharts contentMetrics={metrics} vc={vc} />
      {metrics.length > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {metrics.map((row) => (
            <CompareMetricCard key={row.id} row={row} />
          ))}
        </div>
      ) : null}

      {dups.length > 0 ? (
        <Card shadow>
          <h3 className="text-sm font-bold text-foreground mb-3">{vc.duplicateClusters}</h3>
          <ScrollTable>
            <TableHead sticky>
              <TableRow>
                <TableHeadCell>{vc.colKind}</TableHeadCell>
                <TableHeadCell>Representative URL</TableHeadCell>
                <TableHeadCell>{vc.colCurrent}</TableHeadCell>
                <TableHeadCell>{vc.colBaseline}</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody striped>
              {dups.map((row) => (
                <TableRow key={row.clusterId}>
                  <TableCell>
                    <KindBadge
                      kind={row.kind === 'new' ? 'new' : row.kind === 'removed' ? 'removed' : 'changed'}
                      vc={vc}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs break-all">{row.representativeUrl}</TableCell>
                  <TableCell className="tabular-nums">{row.currentMembers}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{row.baselineMembers}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ScrollTable>
        </Card>
      ) : null}

      {tech.length > 0 ? (
        <Card shadow>
          <h3 className="text-sm font-bold text-foreground mb-3">{vc.techStackChanges}</h3>
          <div className="flex flex-wrap gap-2">
            {tech.map((row) => (
              <span
                key={`${row.kind}-${row.name}`}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                  row.kind === 'added'
                    ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                    : 'border-rose-500/35 bg-rose-500/10 text-rose-800 dark:text-rose-300'
                }`}
              >
                {row.kind === 'added' ? '+' : '−'} {row.name}
              </span>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export function CompareLinksPanel({ compare, searchQuery, vc, emptyLabel }: PanelProps) {
  const q = searchQuery.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q) return compare.extras.linkMetrics;
    return compare.extras.linkMetrics.filter(
      (r) => matchesQuery(r.url, q) || matchesQuery(r.label, q) || matchesQuery(r.metric, q),
    );
  }, [compare.extras.linkMetrics, q]);

  if (rows.length === 0) {
    return (
      <Card shadow>
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </Card>
    );
  }

  return (
    <Card shadow>
      <ScrollTable>
        <TableHead sticky>
          <TableRow>
            <TableHeadCell>URL</TableHeadCell>
            <TableHeadCell>{vc.colMetric}</TableHeadCell>
            <TableHeadCell>{vc.colBaseline}</TableHeadCell>
            <TableHeadCell>{vc.colCurrent}</TableHeadCell>
            <TableHeadCell>Δ</TableHeadCell>
          </TableRow>
        </TableHead>
        <TableBody striped>
          {rows.map((row) => (
            <TableRow key={`${row.url}-${row.metric}`}>
              <TableCell className="font-mono text-xs break-all max-w-[40%]">{row.url}</TableCell>
              <TableCell className="text-sm">{row.label}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">{row.baseline}</TableCell>
              <TableCell className="tabular-nums">{row.current}</TableCell>
              <TableCell>
                <ScoreDelta delta={row.delta} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </ScrollTable>
    </Card>
  );
}

export function CompareGooglePanel({ compare, vc, emptyLabel }: PanelProps) {
  const { extras } = compare;
  if (!extras.googleAvailable) {
    return (
      <Card shadow>
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        <p className="text-xs text-muted-foreground mt-2">
          {vc.googleConnectHint}
        </p>
      </Card>
    );
  }
  const changed = extras.googleMetrics.filter((m) => m.delta != null && m.delta !== 0);
  const stable = extras.googleMetrics.filter((m) => m.delta == null || m.delta === 0);

  return (
    <div className="space-y-4">
      <CompareGoogleCharts vc={vc} />
      <p className="text-xs text-muted-foreground">{vc.googleDateNote}</p>
      {changed.length > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {changed.map((row) => (
            <CompareMetricCard key={row.id} row={row} />
          ))}
        </div>
      ) : null}
      {stable.length > 0 ? (
        <Card shadow>
          <h3 className="text-sm font-bold text-foreground mb-3">Unchanged</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stable.map((row) => (
              <CompareMetricCard key={row.id} row={row} />
            ))}
          </div>
        </Card>
      ) : null}
      {changed.length === 0 && stable.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : null}
    </div>
  );
}
