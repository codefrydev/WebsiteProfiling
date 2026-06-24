
import type { ReactNode } from 'react';
import {
  Key,
  Search,
  Download,
  Settings2,
  ChevronRight,
  List,
  BarChart3,
  Zap,
  Split,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { strings, format } from '../../lib/strings';
import { Card, LabelWithHint } from '../index';
import type { KeywordTabId } from './keywordTabMeta';

interface KeywordExplorerChromeProps {
  title: string;
  subtitle: ReactNode;
  enrichedAt?: string | null;
  siteUrl?: string;
  hasGscConnected: boolean;
  showSeedExpander: boolean;
  onToggleSeeds: () => void;
  onExportCsv: () => void;
  onOpenIntegrations?: () => void;
  activeTab: KeywordTabId;
  onNavigateTab: (tab: KeywordTabId) => void;
  kpis: {
    total: number;
    totalDisplay: string;
    sourceCount: number;
    gscCount: number;
    quickWins: number;
    cannib: number;
    lostClicks: number;
    questions: number;
  };
}

type KpiKey = 'all' | 'gsc' | 'quickwins' | 'cannib' | 'lostclicks' | 'questions';

interface KpiDef {
  key: KpiKey;
  tab: KeywordTabId;
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  accent: string;
  helpKey: string;
}

function KeywordKpiTile({
  def,
  active,
  onClick,
}: {
  def: KpiDef;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = def.icon;
  const hint = strings.views.keywordsExplorer.kpi.viewHint;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={`group text-left rounded-xl border p-3 sm:p-4 w-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active
          ? 'border-accent/50 bg-accent/10 shadow-sm'
          : 'border-default bg-brand-900/60 hover:border-accent/35 hover:bg-brand-800/80'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${def.accent}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform ${
            active ? 'text-accent translate-x-0.5' : 'text-muted-foreground/40 group-hover:text-accent group-hover:translate-x-0.5'
          }`}
          aria-hidden
        />
      </div>
      <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-bold leading-tight">
        <LabelWithHint label={def.label} helpKey={def.helpKey} />
      </p>
      <p className="text-xl sm:text-2xl font-bold text-bright tabular-nums mt-0.5">{def.value}</p>
      <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 line-clamp-2">{def.sub}</p>
      <span className="sr-only">{hint}</span>
    </button>
  );
}

export default function KeywordExplorerChrome({
  title,
  subtitle,
  enrichedAt,
  siteUrl,
  hasGscConnected,
  showSeedExpander,
  onToggleSeeds,
  onExportCsv,
  onOpenIntegrations,
  activeTab,
  onNavigateTab,
  kpis,
}: KeywordExplorerChromeProps) {
  const ke = strings.views.keywordsExplorer;
  const ds = ke.dataStatus;
  const k = ke.kpi;

  const kpiDefs: KpiDef[] = [
    {
      key: 'all',
      tab: 'all',
      icon: List,
      label: k.total,
      value: kpis.totalDisplay,
      sub: format(k.totalSub, { n: kpis.sourceCount }),
      accent: 'bg-blue-500/15 text-blue-400',
      helpKey: 'views.keywordsExplorer.totalKeywords',
    },
    {
      key: 'gsc',
      tab: 'all',
      icon: BarChart3,
      label: k.gsc,
      value: kpis.gscCount.toLocaleString(),
      sub: k.gscSub,
      accent: 'bg-emerald-500/15 text-emerald-400',
      helpKey: 'views.keywordsExplorer.gscKeywords',
    },
    {
      key: 'quickwins',
      tab: 'quickwins',
      icon: Zap,
      label: k.quickWins,
      value: kpis.quickWins.toLocaleString(),
      sub: k.quickWinsSub,
      accent: 'bg-amber-500/15 text-amber-400',
      helpKey: 'views.keywordsExplorer.quickWins',
    },
    {
      key: 'cannib',
      tab: 'cannib',
      icon: Split,
      label: k.cannib,
      value: kpis.cannib.toLocaleString(),
      sub: k.cannibSub,
      accent: 'bg-red-500/15 text-red-400',
      helpKey: 'views.keywordsExplorer.cannibalisation',
    },
  ];

  const secondaryKpis: KpiDef[] = [
    {
      key: 'lostclicks',
      tab: 'lostclicks',
      icon: AlertTriangle,
      label: k.lostClicks,
      value: kpis.lostClicks.toLocaleString(),
      sub: k.lostClicksSub,
      accent: 'bg-orange-500/15 text-orange-400',
      helpKey: 'views.keywordsExplorer.lostClicks',
    },
    {
      key: 'questions',
      tab: 'questions',
      icon: HelpCircle,
      label: k.questions,
      value: kpis.questions.toLocaleString(),
      sub: k.questionsSub,
      accent: 'bg-violet-500/15 text-violet-400',
      helpKey: 'views.keywordsExplorer.questions',
    },
  ];

  const allKpis = [...kpiDefs, ...secondaryKpis];

  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-bright mb-1.5 flex items-center gap-2">
            <Key className="h-7 w-7 text-link shrink-0" aria-hidden />
            {title}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {enrichedAt && (
              <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border border-default bg-brand-800 text-muted-foreground tabular-nums">
                {format(ke.header.enrichedBadge, { date: enrichedAt })}
              </span>
            )}
            {siteUrl ? (
              <span
                className="inline-flex max-w-full text-[11px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 truncate"
                title={siteUrl}
              >
                {siteUrl}
              </span>
            ) : null}
          </div>
        </div>
        <div
          className="flex flex-wrap items-center gap-2 shrink-0"
          role="toolbar"
          aria-label={ke.header.actionsLabel}
        >
          {!hasGscConnected && onOpenIntegrations && (
            <button
              type="button"
              onClick={onOpenIntegrations}
              className="px-3 py-2 text-xs font-medium border border-blue-500/50 text-link rounded-lg hover:bg-blue-500/10 inline-flex items-center gap-1.5"
            >
              <Settings2 className="w-3.5 h-3.5" aria-hidden />
              {ke.connectGoogle}
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSeeds}
            aria-pressed={showSeedExpander}
            className={`px-3 py-2 text-xs font-medium border rounded-lg inline-flex items-center gap-1.5 transition-colors ${
              showSeedExpander
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-default text-muted-foreground hover:text-foreground hover:bg-brand-800'
            }`}
          >
            <Search className="w-3.5 h-3.5" aria-hidden />
            {ke.expandSeeds}
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="px-3 py-2 text-xs font-medium bg-brand-800 border border-default rounded-lg text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" aria-hidden />
            {ke.exportCsv}
          </button>
        </div>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div
          className={`flex gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-default ${
            hasGscConnected ? 'bg-emerald-500/[0.06]' : 'bg-amber-500/[0.08]'
          }`}
        >
          {hasGscConnected ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" aria-hidden />
          ) : (
            <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {hasGscConnected ? ds.gscTitle : ds.noGscTitle}
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {hasGscConnected ? ds.gscDetail : ds.noGscDetail}
            </p>
            {!hasGscConnected && onOpenIntegrations && (
              <button
                type="button"
                onClick={onOpenIntegrations}
                className="mt-3 px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent/90 inline-flex items-center gap-1.5"
              >
                <Settings2 className="w-3.5 h-3.5" aria-hidden />
                {ke.connectGoogle}
              </button>
            )}
          </div>
        </div>

        <div className="p-3 sm:p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5 mb-3">
            {k.sectionTitle}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
            {allKpis.map((def) => (
              <KeywordKpiTile
                key={def.key}
                def={def}
                active={activeTab === def.tab}
                onClick={() => onNavigateTab(def.tab)}
              />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
