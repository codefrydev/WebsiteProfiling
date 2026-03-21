import { useState, useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Shield, Flame, AlertTriangle, AlertCircle, Info, ExternalLink } from 'lucide-react';
import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card, Badge } from '../components';
import { palette } from '../utils/chartPalette';
import { registerChartJsBase, barOptionsHorizontal, doughnutOptionsBottomLegend } from '../utils/chartJsDefaults';

registerChartJsBase();

const SEVERITY_CONFIG = {
  Critical: {
    icon: Flame,
    text: 'text-red-400',
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
    text: 'text-orange-400',
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
    text: 'text-yellow-400',
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
    text: 'text-slate-400',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/40',
    ring: '',
    rowBorder: 'border-l-slate-500',
    recBg: 'bg-slate-700/30 border-slate-600/30',
    order: 3,
    chartColor: '#64748B',
  },
  Info: {
    icon: Info,
    text: 'text-slate-500',
    bg: 'bg-slate-600/10',
    border: 'border-slate-600/30',
    ring: '',
    rowBorder: 'border-l-slate-600',
    recBg: 'bg-slate-700/20 border-slate-700/30',
    order: 4,
    chartColor: '#475569',
  },
};

const SEVERITY_ORDER = ['Critical', 'High', 'Medium', 'Low', 'Info'];

function toTitleCase(str) {
  return (str || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Security({ searchQuery = '' }) {
  const { data } = useReport();
  const [severityFilter, setSeverityFilter] = useState('All');

  const q = (searchQuery || '').toLowerCase().trim();

  const allFindings = useMemo(() => {
    const raw = data?.security_findings;
    return Array.isArray(raw) ? raw : [];
  }, [data?.security_findings]);

  const severityChart = useMemo(() => {
    const counts = SEVERITY_ORDER.reduce((acc, s) => {
      acc[s] = allFindings.filter((f) => (f.severity || 'Info') === s).length;
      return acc;
    }, {});
    return {
      values: SEVERITY_ORDER.map((s) => counts[s] || 0),
      colors: SEVERITY_ORDER.map((s) => SEVERITY_CONFIG[s].chartColor),
    };
  }, [allFindings]);

  const { typeLabels, typeValues } = useMemo(() => {
    const m = new Map();
    allFindings.forEach((f) => {
      const t = toTitleCase(f.finding_type) || 'Unknown';
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
            label: (ctx) => {
              const n = Number(ctx.raw);
              return ` ${n.toLocaleString()} finding${n !== 1 ? 's' : ''}`;
            },
          },
        },
      },
    };
  }, []);

  if (!data) return null;

  const severityCounts = SEVERITY_ORDER.reduce((acc, s) => {
    acc[s] = allFindings.filter((f) => (f.severity || 'Info') === s).length;
    return acc;
  }, {});

  let findings = allFindings;
  if (severityFilter !== 'All') {
    findings = findings.filter((f) => (f.severity || 'Info') === severityFilter);
  }
  if (q) {
    findings = findings.filter((f) => {
      const url = (f.url || '').toLowerCase();
      const msg = (f.message || '').toLowerCase();
      const rec = (f.recommendation || '').toLowerCase();
      const typ = toTitleCase(f.finding_type).toLowerCase();
      return url.includes(q) || msg.includes(q) || rec.includes(q) || typ.includes(q);
    });
  }

  findings = [...findings].sort((a, b) => {
    const ao = (SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.Info).order;
    const bo = (SEVERITY_CONFIG[b.severity] || SEVERITY_CONFIG.Info).order;
    return ao - bo;
  });

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title="Security & Headers"
        subtitle={`HTTP security headers, injection risk, open redirect, and vulnerability findings. ${allFindings.length} finding${allFindings.length !== 1 ? 's' : ''} total.`}
      />

      {allFindings.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="tight" shadow>
            <h2 className="text-sm font-bold text-slate-200 mb-1">Findings by severity</h2>
            <p className="text-xs text-slate-500 mb-3">All findings in this report</p>
            <div className="h-56 flex items-center justify-center">
              <div className="w-full max-w-[260px] h-48">
                <Doughnut
                  data={{
                    labels: SEVERITY_ORDER,
                    datasets: [
                      {
                        data: severityChart.values,
                        backgroundColor: severityChart.colors,
                        borderColor: 'rgba(15,23,42,0.8)',
                        borderWidth: 2,
                      },
                    ],
                  }}
                  options={{
                    ...doughnutOptionsBottomLegend(),
                    plugins: {
                      ...doughnutOptionsBottomLegend().plugins,
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const n = Number(ctx.raw);
                            if (n === 0) return ` ${ctx.label}: 0`;
                            return ` ${ctx.label}: ${n.toLocaleString()}`;
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
            </div>
          </Card>
          {typeLabels.length > 0 && (
            <Card padding="tight" shadow>
              <h2 className="text-sm font-bold text-slate-200 mb-1">Findings by type</h2>
              <p className="text-xs text-slate-500 mb-3">Grouped by finding_type from the scanner</p>
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
      )}

      {/* Severity summary cards — act as filters */}
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
                  ? `${cfg.ring || `ring-1 ring-slate-500/20`} ${cfg.border}`
                  : 'hover:border-slate-600/60'
              }`}
              onClick={() => setSeverityFilter((prev) => (prev === sev ? 'All' : sev))}
            >
              <div className={`text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${cfg.text}`}>
                <Icon className="h-4 w-4" /> {sev}
              </div>
              <div className={`text-3xl font-bold ${count > 0 ? cfg.text : 'text-slate-600'}`}>{count}</div>
            </Card>
          );
        })}
      </div>

      {/* "All" pill to reset filter */}
      {severityFilter !== 'All' && (
        <div>
          <button
            type="button"
            onClick={() => setSeverityFilter('All')}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors border border-default rounded-full px-3 py-1"
          >
            ← Show all severities
          </button>
        </div>
      )}

      {/* Findings list */}
      {findings.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 gap-4">
          <Shield className="h-14 w-14 text-green-600/60" />
          <div className="text-center">
            <p className="text-slate-300 font-semibold text-base">No security findings detected</p>
            <p className="text-slate-500 text-sm mt-1">
              {allFindings.length > 0
                ? 'No findings match the current filters or search.'
                : 'Run a crawl with security scanning enabled to see results here.'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {findings.map((f, i) => {
            const sev = f.severity || 'Info';
            const cfg = SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.Info;
            const Icon = cfg.icon;
            return (
              <div
                key={i}
                className={`bg-brand-800 border border-default rounded-xl border-l-4 ${cfg.rowBorder} p-5 flex flex-col gap-3 hover:border-slate-600/60 transition-colors`}
              >
                {/* Row header */}
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Icon className={`h-4 w-4 ${cfg.text}`} />
                    <Badge value={sev} label={sev} />
                  </div>
                  <span className={`font-mono text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.text} border ${cfg.border} select-all`}>
                    {toTitleCase(f.finding_type)}
                  </span>
                  {f.url && (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 font-mono text-blue-400 text-xs hover:underline break-all min-w-0"
                    >
                      <span className="line-clamp-1">{f.url}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  )}
                </div>

                {/* Message */}
                <p className="text-slate-200 text-sm leading-snug">{f.message || '—'}</p>

                {/* Recommendation */}
                {f.recommendation && (
                  <div className={`rounded-lg px-3 py-2.5 border text-sm text-slate-400 leading-relaxed ${cfg.recBg}`}>
                    <span className="text-xs font-bold uppercase tracking-wide text-blue-400 block mb-1">
                      Recommendation
                    </span>
                    {f.recommendation}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}
