import { useState, useMemo } from 'react';
import { useUrlTab } from '@/hooks/useUrlTab';
import { Bar, Doughnut } from 'react-chartjs-2';
import type { TooltipItem } from 'chart.js';
import { Shield, Flame, AlertTriangle, AlertCircle, Info, ExternalLink, BarChart3, List } from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings, format } from '../lib/strings';
import { PageLayout, PageHeader, Card, Badge, ViewTabs, ViewTabPanel } from '../components';
import type { ViewTabItem } from '../components';
import { palette } from '../utils/chartPalette';
import { registerChartJsBase, barOptionsHorizontal } from '../utils/chartJsDefaults';
import { doughnutOptionsWithPercentTooltip, formatCompositionAria } from '../lib/chartDoughnutUtils';
import { ChartAccessibleFallback } from '../components/charts';
import type { SecurityFinding, ViewProps } from '@/types';
import { securityFindingLabel } from '@/lib/securityFindingLabels';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import { buildSecurityFindingContext } from '@/lib/fixSuggestionContext';

registerChartJsBase();

type SeverityKey = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

const SEVERITY_CONFIG: Record<SeverityKey, {
  icon: typeof Flame;
  text: string;
  bg: string;
  border: string;
  ring: string;
  rowBorder: string;
  recBg: string;
  order: number;
  chartColor: string;
}> = {
  Critical: {
    icon: Flame,
    text: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/40',
    ring: 'ring-1 ring-red-500/20 border-red-900/30',
    rowBorder: 'border-l-red-500',
    recBg: 'bg-red-500/5 border-red-500/20',
    order: 0,
    chartColor: '#EF4444',
  },
  High: {
    icon: AlertTriangle,
    text: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/40',
    ring: 'ring-1 ring-orange-500/20 border-orange-900/30',
    rowBorder: 'border-l-orange-500',
    recBg: 'bg-orange-500/5 border-orange-500/20',
    order: 1,
    chartColor: '#F97316',
  },
  Medium: {
    icon: AlertCircle,
    text: 'text-yellow-700 dark:text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/40',
    ring: '',
    rowBorder: 'border-l-yellow-500',
    recBg: 'bg-yellow-500/5 border-yellow-500/20',
    order: 2,
    chartColor: '#EAB308',
  },
  Low: {
    icon: Info,
    text: 'text-muted-foreground',
    bg: 'bg-brand-700/10',
    border: 'border-brand-700/40',
    ring: '',
    rowBorder: 'border-l-neutral-500',
    recBg: 'bg-brand-700/30 border-brand-700/30',
    order: 3,
    chartColor: '#64748B',
  },
  Info: {
    icon: Info,
    text: 'text-muted-foreground',
    bg: 'bg-brand-700/10',
    border: 'border-brand-700/30',
    ring: '',
    rowBorder: 'border-l-neutral-600',
    recBg: 'bg-brand-700/20 border-brand-700/30',
    order: 4,
    chartColor: '#475569',
  },
};

const SEVERITY_ORDER: SeverityKey[] = ['Critical', 'High', 'Medium', 'Low', 'Info'];

const SECURITY_TABS = ['charts', 'findings'] as const;
type SecurityTabId = (typeof SECURITY_TABS)[number];

export default function Security({ searchQuery = '' }: ViewProps) {
  const { data } = useReport();
  const [severityFilter, setSeverityFilter] = useState('All');
  const [activeTab, setActiveTab] = useUrlTab(SECURITY_TABS, 'findings');

  const q = (searchQuery || '').toLowerCase().trim();

  const allFindings = useMemo((): SecurityFinding[] => {
    const raw = data?.security_findings;
    return Array.isArray(raw) ? raw : [];
  }, [data?.security_findings]);

  const severityChart = useMemo(() => {
    const items = SEVERITY_ORDER.map((s) => ({
      label: s,
      value: allFindings.filter((f) => (f.severity || 'Info') === s).length,
      color: SEVERITY_CONFIG[s].chartColor,
    })).filter((item) => item.value > 0);
    return {
      labels: items.map((i) => i.label),
      values: items.map((i) => i.value),
      colors: items.map((i) => i.color),
      aria: formatCompositionAria(
        items.map((i) => i.label),
        items.map((i) => i.value),
        'findings',
      ),
      rows: items.map((i) => [i.label, i.value] as [string, string | number]),
    };
  }, [allFindings]);

  const { typeLabels, typeValues } = useMemo(() => {
    const m = new Map();
    allFindings.forEach((f) => {
      const t = securityFindingLabel(f.finding_type) || strings.common.unknown;
      m.set(t, (m.get(t) || 0) + 1);
    });
    const pairs = [...m.entries()].sort((a, b) => b[1] - a[1]);
    return { typeLabels: pairs.map((p) => p[0]), typeValues: pairs.map((p) => p[1]) };
  }, [allFindings]);

  const typeBarOpts = useMemo(() => {
    const base = barOptionsHorizontal();
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<'bar'>) => {
              const n = Number(ctx.raw);
              const vs = strings.views.security;
              return ` ${format(vs.findingTooltip, { n: n.toLocaleString(), s: n !== 1 ? 's' : '' })}`;
            },
          },
        },
      },
    };
  }, []);

  const vs = strings.views.security;

  const tabItems = useMemo((): ViewTabItem[] => {
    const chartCount = allFindings.length > 0 ? (typeLabels.length > 0 ? 2 : 1) : 0;
    return [
      {
        id: 'findings',
        label: vs.tabs.findings,
        icon: <List className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        badge: allFindings.length > 0 ? allFindings.length : null,
      },
      {
        id: 'charts',
        label: vs.tabs.charts,
        icon: <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        badge: chartCount > 0 ? chartCount : null,
      },
    ];
  }, [vs.tabs, allFindings.length, typeLabels.length]);

  if (!data) return null;

  const severityCounts = SEVERITY_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = allFindings.filter((f) => (f.severity || 'Info') === s).length;
    return acc;
  }, {});

  let findings: SecurityFinding[] = allFindings;
  if (severityFilter !== 'All') {
    findings = findings.filter((f) => (f.severity || 'Info') === severityFilter);
  }
  if (q) {
    findings = findings.filter((f) => {
      const url = (f.url || '').toLowerCase();
      const msg = (f.message || '').toLowerCase();
      const rec = (f.recommendation || '').toLowerCase();
      const typ = securityFindingLabel(f.finding_type).toLowerCase();
      return url.includes(q) || msg.includes(q) || rec.includes(q) || typ.includes(q);
    });
  }

  findings = [...findings].sort((a, b) => {
    const ao = (SEVERITY_CONFIG[(a.severity || 'Info') as SeverityKey] ?? SEVERITY_CONFIG.Info).order;
    const bo = (SEVERITY_CONFIG[(b.severity || 'Info') as SeverityKey] ?? SEVERITY_CONFIG.Info).order;
    return ao - bo;
  });

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title={vs.title}
        subtitle={`${vs.subtitlePrefix} ${format(vs.subtitleCount, { count: allFindings.length, s: allFindings.length !== 1 ? 's' : '' })}`}
      />

      <ViewTabs
        tabs={tabItems}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as SecurityTabId)}
        ariaLabel={vs.title}
        idPrefix="security"
      />

      {activeTab === 'charts' && allFindings.length > 0 && (
        <ViewTabPanel idPrefix="security" tabId="charts" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card padding="tight" shadow>
              <h2 className="text-sm font-bold text-foreground mb-1">{vs.findingsBySeverity}</h2>
              <p className="text-xs text-muted-foreground mb-3">{vs.findingsBySeverityHint}</p>
              <div className="h-56 flex items-center justify-center">
                <div className="w-full max-w-[260px] h-48">
                  <ChartAccessibleFallback summary={severityChart.aria} rows={severityChart.rows}>
                    <Doughnut
                      data={{
                        labels: severityChart.labels,
                        datasets: [
                          {
                            data: severityChart.values,
                            backgroundColor: severityChart.colors,
                            borderColor: 'rgba(15,23,42,0.8)',
                            borderWidth: 2,
                          },
                        ],
                      }}
                      options={doughnutOptionsWithPercentTooltip()}
                    />
                  </ChartAccessibleFallback>
                </div>
              </div>
            </Card>
            {typeLabels.length > 0 && (
              <Card padding="tight" shadow>
                <h2 className="text-sm font-bold text-foreground mb-1">{vs.findingsByType}</h2>
                <p className="text-xs text-muted-foreground mb-3">{vs.findingsByTypeHint}</p>
                <div className="h-56">
                  <Bar
                    data={{
                      labels: typeLabels,
                      datasets: [{ data: typeValues, backgroundColor: palette(typeLabels.length) }],
                    }}
                    options={typeBarOpts}
                  />
                </div>
              </Card>
            )}
          </div>
        </ViewTabPanel>
      )}

      {activeTab === 'charts' && allFindings.length === 0 && (
        <ViewTabPanel idPrefix="security" tabId="charts">
          <Card className="p-8 text-center text-muted-foreground text-sm">{vs.emptyNoScan}</Card>
        </ViewTabPanel>
      )}

      {activeTab === 'findings' && (
        <ViewTabPanel idPrefix="security" tabId="findings" className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {SEVERITY_ORDER.map((sev) => {
              const cfg = SEVERITY_CONFIG[sev];
              const Icon = cfg.icon;
              const count = severityCounts[sev] || 0;
              const isActive = severityFilter === sev;
              return (
                <Card
                  key={sev}
                  shadow
                  className={`cursor-pointer transition-all select-none ${
                    isActive
                      ? `${cfg.ring || `ring-1 ring-neutral-500/20`} ${cfg.border}`
                      : 'hover:border-brand-700/80'
                  }`}
                  onClick={() => setSeverityFilter((prev) => (prev === sev ? 'All' : sev))}
                >
                  <div className={`text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${cfg.text}`}>
                    <Icon className="h-4 w-4" /> {sev}
                  </div>
                  <div className={`text-3xl font-bold ${count > 0 ? cfg.text : 'text-muted-foreground'}`}>{count}</div>
                </Card>
              );
            })}
          </div>

          {severityFilter !== 'All' && (
            <div>
              <button
                type="button"
                onClick={() => setSeverityFilter('All')}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors border border-default rounded-full px-3 py-1"
              >
                {vs.showAllSeverities}
              </button>
            </div>
          )}

          {findings.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-20 gap-4">
              <Shield className="h-14 w-14 text-green-600/60" />
              <div className="text-center">
                <p className="text-foreground font-semibold text-base">{vs.emptyTitle}</p>
                <p className="text-muted-foreground text-sm mt-1">
                  {allFindings.length > 0 ? vs.emptyFiltered : vs.emptyNoScan}
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {findings.map((f, i) => {
                const sev = (f.severity || 'Info') as SeverityKey;
                const cfg = SEVERITY_CONFIG[sev] ?? SEVERITY_CONFIG.Info;
                const Icon = cfg.icon;
                return (
                  <div
                    key={i}
                    className={`bg-brand-800 border border-default rounded-xl border-l-4 ${cfg.rowBorder} p-5 flex flex-col gap-3 hover:border-brand-700/80 transition-colors`}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Icon className={`h-4 w-4 ${cfg.text}`} />
                        <Badge value={sev} label={sev} />
                      </div>
                      <span className={`font-mono text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.text} border ${cfg.border} select-all`}>
                        {securityFindingLabel(f.finding_type)}
                      </span>
                      {f.url && (
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 font-mono text-link text-xs hover:underline break-all min-w-0"
                        >
                          <span className="line-clamp-1">{f.url}</span>
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      )}
                    </div>
                    <p className="text-foreground text-sm leading-snug">{f.message || strings.common.emDash}</p>
                    {f.recommendation && (
                      <div className={`rounded-lg px-3 py-2.5 border text-sm text-muted-foreground leading-relaxed ${cfg.recBg}`}>
                        <span className="text-xs font-bold uppercase tracking-wide text-link block mb-1">
                          {vs.recommendation}
                        </span>
                        {f.recommendation}
                      </div>
                    )}
                    <AiSuggestionButton request={buildSecurityFindingContext(f)} />
                  </div>
                );
              })}
            </div>
          )}
        </ViewTabPanel>
      )}
    </PageLayout>
  );
}
