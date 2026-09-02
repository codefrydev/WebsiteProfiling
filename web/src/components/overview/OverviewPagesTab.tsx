
import { useMemo } from 'react';
import { ExternalLink, Medal, TrendingUp } from 'lucide-react';
import type { ReportTopPage } from '@/types';
import { strings, format } from '@/lib/strings';
import { metricHelpHint } from '@/lib/metricHelp';
import { formatPageHrefLines } from '@/utils/linkUtils';
import {
  Card,
  Table,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableCell,
  EmptyState,
} from '@/components';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import UrlInspectorButton from '@/components/UrlInspectorButton';
import { InlinksMetricCell, RelativeMetricBar } from '@/components/links';
import { OverviewTabPanel } from './OverviewTabPanel';

export interface OverviewPagesTabProps {
  topPages: ReportTopPage[];
  hasTopPages: boolean;
}

export function OverviewPagesTab({ topPages, hasTopPages }: OverviewPagesTabProps) {
  const vo = strings.views.overview;

  const pagesTabDevData = useMemo(
    () => ({
      widget: 'overview.pages',
      title: vo.topPagesTitle,
      hint: vo.topPagesHint,
      hasTopPages,
      pageCount: topPages.length,
      pages: topPages,
    }),
    [hasTopPages, topPages, vo.topPagesHint, vo.topPagesTitle],
  );

  return (
    <OverviewTabPanel tabId="pages">
      <div className="relative group/dev-card">
        <DevCopyJsonButton data={pagesTabDevData} />
        <h2 className="text-xl font-bold text-bright mb-2 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-link shrink-0" /> {vo.topPagesTitle}
        </h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-3xl leading-relaxed">{vo.topPagesHint}</p>
        {hasTopPages ? (
          topPages.length === 0 ? (
            <EmptyState icon={TrendingUp} title={vo.topPagesTitle} description={vo.noTopSearch} />
          ) : (
            <TopPagesTable pages={topPages} />
          )
        ) : (
          <EmptyState icon={TrendingUp} title={vo.topPagesTitle} description={vo.noTopPagesData} />
        )}
      </div>
    </OverviewTabPanel>
  );
}

function TopPagesTable({ pages }: { pages: ReportTopPage[] }) {
  const vo = strings.views.overview;
  const sj = strings.common;
  const maxPR = Math.max(...pages.map((p) => (p.pagerank != null ? Number(p.pagerank) : 0)), 0.0001);
  const maxDeg = Math.max(...pages.map((p) => p.degree ?? p.outlinks ?? 0), 1);

  const tableDevData = useMemo(
    () => ({
      widget: 'overview.pages.table',
      title: vo.topPagesTitle,
      pageCount: pages.length,
      maxPagerank: maxPR,
      maxConnections: maxDeg,
      rows: pages.map((p, i) => {
        const pr = p.pagerank != null ? Number(p.pagerank) : null;
        const deg = p.degree ?? p.outlinks ?? null;
        const prPct = pr != null ? Math.round((pr / maxPR) * 100) : null;
        return {
          rank: i + 1,
          url: p.url,
          title: p.title,
          status: p.status,
          pagerank: pr,
          importancePct: prPct,
          connections: deg,
          inlinks: p.inlinks,
          outlinks: p.outlinks,
          degree: p.degree,
          raw: p,
        };
      }),
    }),
    [maxDeg, maxPR, pages, vo.topPagesTitle],
  );

  return (
    <Card overflowHidden padding="none" devData={tableDevData}>
      <p className="sm:hidden text-xs text-muted-foreground px-4 py-2 border-b border-muted bg-brand-900/40">
        {sj.tableSwipeHint}
      </p>
      <Table className="min-w-[420px]">
        <TableHead sticky>
          <tr>
            <TableHeadCell className="text-center sticky left-0 top-0 z-30 w-14 min-w-[3.5rem] bg-brand-900 border-r border-default shadow-[4px_0_12px_-4px_rgba(0,0,0,0.45)]">
              {vo.thRank}
            </TableHeadCell>
            <TableHeadCell className="text-left sticky left-14 top-0 z-30 min-w-[min(200px,55vw)] max-w-[min(280px,78vw)] bg-brand-900 border-r border-default shadow-[4px_0_12px_-4px_rgba(0,0,0,0.45)]">
              {vo.thPage}
            </TableHeadCell>
            <TableHeadCell className="text-right min-w-0" hint={metricHelpHint('views.overview.linkScore')}>
              {vo.thImportance}
            </TableHeadCell>
            <TableHeadCell className="text-right min-w-0" hint={metricHelpHint('views.overview.connections')}>
              {vo.thConnections}
            </TableHeadCell>
          </tr>
        </TableHead>
        <TableBody striped>
          {pages.map((p, i) => {
            const pr = p.pagerank != null ? Number(p.pagerank) : null;
            const deg = p.degree ?? p.outlinks ?? null;
            const prPct = pr != null ? (pr / maxPR) * 100 : 0;
            const rankMedal =
              i === 0
                ? 'text-amber-700 dark:text-amber-400'
                : i === 1
                  ? 'text-foreground'
                  : i === 2
                    ? 'text-orange-700 dark:text-orange-400/90'
                    : null;
            const hrefLines = formatPageHrefLines(p.url);
            return (
              <TableRow key={i}>
                <TableCell className="text-center align-middle sticky left-0 z-20 w-14 min-w-[3.5rem] bg-inherit border-r border-default shadow-[4px_0_12px_-4px_rgba(0,0,0,0.35)]">
                  <div className="inline-flex items-center justify-center gap-1">
                    {rankMedal != null && <Medal className={`h-4 w-4 shrink-0 ${rankMedal}`} aria-hidden />}
                    <span
                      className={`font-semibold tabular-nums ${rankMedal != null ? rankMedal : 'text-muted-foreground'}`}
                    >
                      {i + 1}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="min-w-0 sticky left-14 z-20 max-w-[min(280px,78vw)] bg-inherit border-r border-default shadow-[4px_0_12px_-4px_rgba(0,0,0,0.35)]">
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <div
                      className="text-bright font-medium text-sm leading-snug line-clamp-2"
                      title={typeof p.title === 'string' ? p.title : undefined}
                    >
                      {p.title || <span className="text-muted-foreground italic font-normal">{vo.noTitle}</span>}
                    </div>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-link group min-w-0"
                      title={p.url}
                    >
                      <span className="truncate font-mono">{hrefLines.label}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </a>
                    <UrlInspectorButton url={p.url} label={strings.views.links.inspect} className="self-start" />
                  </div>
                </TableCell>
                <TableCell className="text-right align-middle min-w-0">
                  <RelativeMetricBar
                    pct={prPct}
                    value={pr != null ? `${Math.round(prPct)}%` : sj.emDash}
                    valueClassName="text-sm font-semibold text-foreground tabular-nums"
                    barClassName="bg-slate-500/75 dark:bg-slate-400/75"
                    title={
                      pr != null
                        ? format(vo.importanceTooltip, {
                            label: vo.thImportance,
                            pct: String(Math.round(prPct)),
                            score: String(pr),
                          })
                        : undefined
                    }
                  />
                </TableCell>
                <TableCell className="text-right align-middle min-w-0">
                  <InlinksMetricCell count={deg ?? 0} maxInSection={maxDeg} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
