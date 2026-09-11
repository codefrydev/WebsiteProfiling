
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
import DevCopyJsonButton from '../DevCopyJsonButton';
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
  kpiDevData?: unknown;
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
      className={`press group text-left rounded-2xl border p-3 sm:p-4 w-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary active:scale-[0.98] ${
        active
          ? 'border-md-sys-primary/50 bg-md-sys-primary-container/20 shadow-sm'
          : 'border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/60 hover:border-md-sys-primary/35 hover:bg-md-sys-surface-container/80'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${def.accent}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform ${
            active ? 'text-md-sys-primary translate-x-0.5' : 'text-md-sys-on-surface-variant/40 group-hover:text-md-sys-primary group-hover:translate-x-0.5'
          }`}
          aria-hidden
        />
      </div>
      <p className="text-[10px] sm:text-xs text-md-sys-on-surface-variant uppercase tracking-wider font-bold leading-tight">
        <LabelWithHint label={def.label} helpKey={def.helpKey} />
      </p>
      <p className="text-xl sm:text-2xl font-bold text-md-sys-on-surface tabular-nums mt-0.5">{def.value}</p>
      <p className="text-[11px] sm:text-xs text-md-sys-on-surface-variant mt-1 line-clamp-2">{def.sub}</p>
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
  kpiDevData,
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
      accent: 'bg-md-sys-primary-container text-md-sys-on-primary-container',
      helpKey: 'views.keywordsExplorer.totalKeywords',
    },
    {
      key: 'gsc',
      tab: 'all',
      icon: BarChart3,
      label: k.gsc,
      value: kpis.gscCount.toLocaleString(),
      sub: k.gscSub,
      accent: 'bg-md-sys-success-container text-md-sys-on-success-container',
      helpKey: 'views.keywordsExplorer.gscKeywords',
    },
    {
      key: 'quickwins',
      tab: 'quickwins',
      icon: Zap,
      label: k.quickWins,
      value: kpis.quickWins.toLocaleString(),
      sub: k.quickWinsSub,
      accent: 'bg-md-sys-warning-container text-md-sys-on-warning-container',
      helpKey: 'views.keywordsExplorer.quickWins',
    },
    {
      key: 'cannib',
      tab: 'cannib',
      icon: Split,
      label: k.cannib,
      value: kpis.cannib.toLocaleString(),
      sub: k.cannibSub,
      accent: 'bg-md-sys-error-container text-md-sys-on-error-container',
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
      accent: 'bg-md-sys-warning-container text-md-sys-on-warning-container',
      helpKey: 'views.keywordsExplorer.lostClicks',
    },
    {
      key: 'questions',
      tab: 'questions',
      icon: HelpCircle,
      label: k.questions,
      value: kpis.questions.toLocaleString(),
      sub: k.questionsSub,
      accent: 'bg-md-sys-tertiary-container text-md-sys-on-tertiary-container',
      helpKey: 'views.keywordsExplorer.questions',
    },
  ];

  const allKpis = [...kpiDefs, ...secondaryKpis];

  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-md-sys-on-surface mb-1.5 flex items-center gap-2">
            <Key className="h-7 w-7 text-md-sys-primary shrink-0" aria-hidden />
            {title}
          </h1>
          <p className="text-sm text-md-sys-on-surface-variant leading-relaxed">{subtitle}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {enrichedAt && (
              <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container text-md-sys-on-surface-variant tabular-nums">
                {format(ke.header.enrichedBadge, { date: enrichedAt })}
              </span>
            )}
            {siteUrl ? (
              <span
                className="inline-flex max-w-full text-[11px] font-mono px-2 py-0.5 rounded-full border border-md-sys-success/30 bg-md-sys-success-container/30 text-md-sys-on-success-container truncate"
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
              className="press px-4 py-1.5 text-xs font-medium border border-md-sys-primary/40 text-md-sys-primary rounded-full hover:bg-md-sys-primary-container/20 active:scale-[0.98] transition-all inline-flex items-center gap-1.5"
            >
              <Settings2 className="w-3.5 h-3.5" aria-hidden />
              {ke.connectGoogle}
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSeeds}
            aria-pressed={showSeedExpander}
            className={`press px-4 py-1.5 text-xs font-medium border rounded-full inline-flex items-center gap-1.5 transition-all active:scale-[0.98] ${
              showSeedExpander
                ? 'border-md-sys-primary bg-md-sys-primary-container/40 text-md-sys-primary shadow-elevation-1'
                : 'border-md-sys-outline-variant/40 text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:bg-md-sys-surface-container'
            }`}
          >
            <Search className="w-3.5 h-3.5" aria-hidden />
            {ke.expandSeeds}
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="press px-4 py-1.5 text-xs font-medium bg-md-sys-surface-container border border-md-sys-outline-variant/50 rounded-full text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:bg-md-sys-surface-container-high active:scale-[0.98] transition-all inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" aria-hidden />
            {ke.exportCsv}
          </button>
        </div>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div
          className={`flex gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-md-sys-outline-variant/40 ${
            hasGscConnected ? 'bg-md-sys-success-container/20' : 'bg-md-sys-warning-container/20'
          }`}
        >
          {hasGscConnected ? (
            <CheckCircle2 className="h-5 w-5 text-md-sys-success shrink-0 mt-0.5" aria-hidden />
          ) : (
            <Info className="h-5 w-5 text-md-sys-warning shrink-0 mt-0.5" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-md-sys-on-surface">
              {hasGscConnected ? ds.gscTitle : ds.noGscTitle}
            </p>
            <p className="text-xs text-md-sys-on-surface-variant mt-1 leading-relaxed">
              {hasGscConnected ? ds.gscDetail : ds.noGscDetail}
            </p>
            {!hasGscConnected && onOpenIntegrations && (
              <button
                type="button"
                onClick={onOpenIntegrations}
                className="press mt-3 px-4 py-2 bg-md-sys-primary text-md-sys-on-primary text-xs font-medium rounded-full hover:brightness-105 active:scale-[0.98] inline-flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Settings2 className="w-3.5 h-3.5" aria-hidden />
                {ke.connectGoogle}
              </button>
            )}
          </div>
        </div>

        <div className="relative group/dev-card p-3 sm:p-4">
          {kpiDevData != null ? <DevCopyJsonButton data={kpiDevData} /> : null}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-md-sys-on-surface-variant px-0.5 mb-3">
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
