'use client';

import { useMemo } from 'react';
import {
  BarChart3,
  FileText,
  HelpCircle,
  Lightbulb,
  List,
  MousePointerClick,
  Split,
  Zap,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { KeywordRow } from '@/types/components';
import { strings } from '../../lib/strings';
import { Card } from '../index';
import { IntentMixChart, SourceMixChart } from './KeywordCharts';
import type { KeywordTabId } from './keywordTabMeta';

interface NavChip {
  id: KeywordTabId;
  label: string;
  count: number;
  icon: LucideIcon;
}

export interface KeywordOverviewPanelProps {
  rows: KeywordRow[];
  insights: string[];
  pageCount: number;
  counts: {
    total: number;
    quickwins: number;
    lostclicks: number;
    questions: number;
    opportunities: number;
    cannib: number;
  };
  onNavigate: (tab: KeywordTabId) => void;
}

function MiniKeywordRow({
  row,
  metric,
}: {
  row: KeywordRow;
  metric: 'position' | 'opportunity' | 'impressions';
}) {
  let suffix = '';
  if (metric === 'position' && row.gsc_position != null) {
    suffix = `pos ${Number(row.gsc_position).toFixed(1)}`;
  } else if (metric === 'opportunity') {
    suffix = `+${(row.opportunity_clicks || 0).toLocaleString()} est. clicks`;
  } else if (metric === 'impressions') {
    suffix = `${(row.gsc_impressions || 0).toLocaleString()} impr.`;
  }
  return (
    <li className="flex items-center justify-between gap-2 py-2 border-b border-default/60 last:border-0 text-sm">
      <span className="font-medium text-foreground truncate min-w-0" title={row.keyword}>
        {row.keyword}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">{suffix}</span>
    </li>
  );
}

export default function KeywordOverviewPanel({
  rows,
  insights,
  pageCount,
  counts,
  onNavigate,
}: KeywordOverviewPanelProps) {
  const o = strings.views.keywordsExplorer.overview;
  const tabs = strings.views.keywordsExplorer.tabs as Record<KeywordTabId, string>;

  const chips: NavChip[] = useMemo(
    () =>
      [
        { id: 'all' as const, label: tabs.all, count: counts.total, icon: List },
        { id: 'quickwins' as const, label: tabs.quickwins, count: counts.quickwins, icon: Zap },
        { id: 'lostclicks' as const, label: tabs.lostclicks, count: counts.lostclicks, icon: MousePointerClick },
        { id: 'questions' as const, label: tabs.questions, count: counts.questions, icon: HelpCircle },
        { id: 'opportunities' as const, label: tabs.opportunities, count: counts.opportunities, icon: Lightbulb },
        { id: 'cannib' as const, label: tabs.cannib, count: counts.cannib, icon: Split },
        { id: 'bypage' as const, label: tabs.bypage, count: pageCount, icon: FileText },
      ].filter((c) => c.count > 0),
    [counts, pageCount, tabs],
  );

  const topQuickWins = useMemo(
    () =>
      [...rows]
        .filter((r) => {
          const pos = parseFloat(String(r.gsc_position ?? 0));
          return pos >= 4 && pos <= 20 && (r.opportunity_clicks || 0) > 5;
        })
        .sort((a, b) => (b.opportunity_clicks || 0) - (a.opportunity_clicks || 0))
        .slice(0, 5),
    [rows],
  );

  const topOpportunities = useMemo(
    () =>
      [...rows]
        .filter((r) => !r.gsc_position && (r.sources || []).length > 0)
        .sort((a, b) => (b.traffic_potential || 0) - (a.traffic_potential || 0))
        .slice(0, 5),
    [rows],
  );

  return (
    <div id="kw-tab-overview" role="tabpanel" className="space-y-6 mb-6">
      <Card padding="default" className="!bg-brand-900/40">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {o.exploreTitle}
        </h3>
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const Icon = chip.icon;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => onNavigate(chip.id)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-default bg-brand-800 hover:border-accent/40 hover:bg-brand-700/80 text-sm text-foreground transition-all group"
              >
                <Icon className="w-4 h-4 text-link shrink-0" aria-hidden />
                <span className="font-medium">{chip.label}</span>
                <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-brand-900 text-muted-foreground group-hover:text-accent">
                  {chip.count}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-accent" aria-hidden />
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <IntentMixChart rows={rows} />
        <SourceMixChart rows={rows} />
      </div>

      {(topQuickWins.length > 0 || topOpportunities.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {topQuickWins.length > 0 && (
            <Card>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" aria-hidden />
                  {o.topQuickWins}
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigate('quickwins')}
                  className="text-xs text-link hover:underline"
                >
                  {o.viewAll}
                </button>
              </div>
              <ul>
                {topQuickWins.map((r) => (
                  <MiniKeywordRow key={r.keyword} row={r} metric="opportunity" />
                ))}
              </ul>
            </Card>
          )}
          {topOpportunities.length > 0 && (
            <Card>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-violet-400" aria-hidden />
                  {o.topOpportunities}
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigate('opportunities')}
                  className="text-xs text-link hover:underline"
                >
                  {o.viewAll}
                </button>
              </div>
              <ul>
                {topOpportunities.map((r) => (
                  <MiniKeywordRow key={r.keyword} row={r} metric="impressions" />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {insights.length > 0 && (
        <Card>
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-link" aria-hidden />
            {strings.views.keywordsExplorer.insights.title}
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {insights.map((line, i) => (
              <li key={i} className="flex gap-2 leading-relaxed">
                <span className="text-link shrink-0 mt-0.5">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
