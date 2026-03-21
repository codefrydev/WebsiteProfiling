import { useState, useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight, ExternalLink, Flame, BarChart2 } from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings, format } from '../lib/strings';
import { PageLayout, PageHeader, Card, Badge } from '../components';
import { palette } from '../utils/chartPalette';
import { registerChartJsBase, barOptionsHorizontal, doughnutOptionsBottomLegend } from '../utils/chartJsDefaults';

registerChartJsBase();

const MAX_CATEGORY_CHART = 12;

const PRIORITY_CONFIG = {
  Critical: {
    border: 'border-l-red-500',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    ring: 'ring-1 ring-red-500/20 border-red-900/30',
    icon: Flame,
    order: 0,
    chartColor: '#EF4444',
  },
  High: {
    border: 'border-l-orange-500',
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    ring: 'ring-1 ring-orange-500/20 border-orange-900/30',
    icon: AlertTriangle,
    order: 1,
    chartColor: '#F97316',
  },
  Medium: {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    ring: '',
    icon: AlertCircle,
    order: 2,
    chartColor: '#EAB308',
  },
  Low: {
    border: 'border-l-neutral-500',
    bg: 'bg-brand-700/10',
    text: 'text-muted-foreground',
    ring: '',
    icon: Info,
    order: 3,
    chartColor: '#64748B',
  },
};

function CategorySection({ category, items, defaultOpen = false, vi, emDash }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 py-3 px-4 bg-brand-800 border border-default rounded-xl hover:border-brand-700/80 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <span className="font-semibold text-foreground flex-1">{category}</span>
        <span className="text-xs font-bold text-muted-foreground bg-brand-700/60 rounded-full px-2.5 py-0.5">
          {items.length} {items.length === 1 ? vi.issueWord : vi.issuesWord}
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-3 pl-4">
          {items.map((item, i) => {
            const iss = item.issue;
            const p = iss.priority || 'Medium';
            const cfg = PRIORITY_CONFIG[p] || PRIORITY_CONFIG.Medium;
            const Icon = cfg.icon;
            return (
              <div
                key={i}
                className={`bg-brand-800 border border-default rounded-xl border-l-4 ${cfg.border} flex flex-col md:flex-row gap-4 p-5 hover:border-brand-700/80 transition-colors`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-4 w-4 flex-shrink-0 ${cfg.text}`} />
                    <Badge value={p} />
                    <span className="text-xs text-muted-foreground font-medium">{item.category}</span>
                  </div>
                  <h3 className="text-foreground font-medium text-sm leading-snug">{iss.message || emDash}</h3>
                  {iss.url && (
                    <a
                      href={iss.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 font-mono text-blue-400 text-xs hover:underline break-all"
                    >
                      {iss.url}
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  )}
                </div>
                <div className="flex-1 min-w-0 bg-brand-900 rounded-lg p-3 border border-muted">
                  <div className="text-xs text-blue-400 font-bold uppercase mb-1 tracking-wide">{vi.fixRecommendation}</div>
                  <p className="text-muted-foreground text-sm leading-relaxed">{iss.recommendation || emDash}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Issues({ searchQuery = '' }) {
  const { data } = useReport();
  const vi = strings.views.issues;
  const sj = strings.common;
  const PRIORITY_ORDER = vi.priorityOrder;
  const [priorityFilter, setPriorityFilter] = useState(sj.all);
  const [categoryFilter, setCategoryFilter] = useState(sj.all);

  const q = (searchQuery || '').toLowerCase().trim();

  const list = useMemo(() => {
    const acc = [];
    (data?.categories || []).forEach((cat) => {
      (cat.issues || []).forEach((iss) => {
        acc.push({ category: cat.name || cat.id || '', issue: iss });
      });
    });
    if (!q) return acc;
    return acc.filter((item) => {
      const msg = (item.issue.message || '').toLowerCase();
      const url = (item.issue.url || '').toLowerCase();
      const cat = (item.category || '').toLowerCase();
      const rec = (item.issue.recommendation || '').toLowerCase();
      return msg.includes(q) || url.includes(q) || cat.includes(q) || rec.includes(q);
    });
  }, [data, q]);

  const forCharts = useMemo(() => {
    if (categoryFilter === sj.all) return list;
    return list.filter((item) => item.category === categoryFilter);
  }, [list, categoryFilter, sj.all]);

  const { categoryChartLabels, categoryChartValues } = useMemo(() => {
    const m = new Map();
    forCharts.forEach((item) => {
      const c = item.category || sj.uncategorized;
      m.set(c, (m.get(c) || 0) + 1);
    });
    const pairs = [...m.entries()].sort((a, b) => b[1] - a[1]);
    if (pairs.length <= MAX_CATEGORY_CHART) {
      return {
        categoryChartLabels: pairs.map((p) => p[0]),
        categoryChartValues: pairs.map((p) => p[1]),
      };
    }
    const top = pairs.slice(0, MAX_CATEGORY_CHART - 1);
    const rest = pairs.slice(MAX_CATEGORY_CHART - 1).reduce((s, [, n]) => s + n, 0);
    return {
      categoryChartLabels: [...top.map((p) => p[0]), sj.other],
      categoryChartValues: [...top.map((p) => p[1]), rest],
    };
  }, [forCharts, sj]);

  const priorityChart = useMemo(() => {
    const values = PRIORITY_ORDER.map((p) => forCharts.filter((item) => (item.issue.priority || 'Medium') === p).length);
    const colors = PRIORITY_ORDER.map((p) => PRIORITY_CONFIG[p].chartColor);
    return { values, colors };
  }, [forCharts, PRIORITY_ORDER]);

  const priorityCounts = PRIORITY_ORDER.reduce((acc, p) => {
    acc[p] = list.filter((item) => (item.issue.priority || 'Medium') === p).length;
    return acc;
  }, {});

  const categories = [...new Set(list.map((item) => item.category))].filter(Boolean).sort();

  let filtered = list;
  if (priorityFilter !== sj.all) {
    filtered = filtered.filter((item) => (item.issue.priority || 'Medium') === priorityFilter);
  }
  if (categoryFilter !== sj.all) {
    filtered = filtered.filter((item) => item.category === categoryFilter);
  }

  filtered.sort((a, b) => {
    const ao = (PRIORITY_CONFIG[a.issue.priority] || PRIORITY_CONFIG.Medium).order;
    const bo = (PRIORITY_CONFIG[b.issue.priority] || PRIORITY_CONFIG.Medium).order;
    return ao - bo;
  });

  const grouped = filtered.reduce((acc, item) => {
    const cat = item.category || sj.uncategorized;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const categoryBarOpts = useMemo(() => {
    const base = barOptionsHorizontal();
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const n = Number(ctx.raw);
              return ` ${n.toLocaleString()} ${n !== 1 ? vi.issuesWord : vi.issueWord}`;
            },
          },
        },
      },
    };
  }, [vi]);

  if (!data) return null;

  const showCharts = list.length > 0 && forCharts.length > 0;
  const subtitle = `${vi.subtitlePrefix} ${format(vi.subtitleTotal, {
    count: list.length,
    issuesWord: list.length === 1 ? vi.issueWord : vi.issuesWord,
  })}`;

  return (
    <PageLayout className="space-y-6">
      <PageHeader title={vi.title} subtitle={subtitle} />

      {showCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="tight" shadow>
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-bold text-foreground">{vi.issuesByCategory}</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{vi.issuesByCategoryHint}</p>
            <div className="h-64">
              <Bar
                data={{
                  labels: categoryChartLabels,
                  datasets: [{ data: categoryChartValues, backgroundColor: palette(categoryChartLabels.length) }],
                }}
                options={categoryBarOpts}
              />
            </div>
          </Card>
          <Card padding="tight" shadow>
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-bold text-foreground">{vi.issuesByPriority}</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{vi.issuesByPriorityHint}</p>
            <div className="h-64 flex items-center justify-center">
              <div className="w-full max-w-[280px] h-52">
                <Doughnut
                  data={{
                    labels: PRIORITY_ORDER,
                    datasets: [
                      {
                        data: priorityChart.values,
                        backgroundColor: priorityChart.colors,
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
                            return ` ${ctx.label}: ${n.toLocaleString()} ${n !== 1 ? vi.issuesWord : vi.issueWord}`;
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {PRIORITY_ORDER.map((p) => {
          const cfg = PRIORITY_CONFIG[p];
          const Icon = cfg.icon;
          const count = priorityCounts[p] || 0;
          return (
            <Card
              key={p}
              shadow
              className={`cursor-pointer transition-all ${
                priorityFilter === p ? `${cfg.ring || 'ring-1 ring-brand-700/30'} border-brand-700` : 'hover:border-brand-700'
              }`}
              onClick={() => setPriorityFilter((prev) => (prev === p ? sj.all : p))}
            >
              <div className={`text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${cfg.text}`}>
                <Icon className="h-4 w-4" /> {p}
              </div>
              <div className={`text-3xl font-bold ${count > 0 ? cfg.text : 'text-muted-foreground'}`}>{count}</div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPriorityFilter(sj.all)}
          className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors ${
            priorityFilter === sj.all
              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
              : 'border-default bg-brand-800 text-muted-foreground hover:border-brand-700/80'
          }`}
        >
          {vi.allPriorities}
        </button>
        {PRIORITY_ORDER.map((p) => {
          const cfg = PRIORITY_CONFIG[p];
          const active = priorityFilter === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPriorityFilter((prev) => (prev === p ? sj.all : p))}
              className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors ${
                active
                  ? `${cfg.bg} ${cfg.text} border-current/30`
                  : 'border-default bg-brand-800 text-muted-foreground hover:border-brand-700/80'
              }`}
            >
              {p}
            </button>
          );
        })}

        {categories.length > 1 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="ml-auto bg-brand-800 border border-default text-sm rounded-lg px-3 py-2 text-foreground outline-none hover:border-brand-700/80 transition-colors"
          >
            <option value={sj.all}>{vi.allCategories}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 gap-3">
          <Info className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">{vi.noMatches}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([cat, items], idx) => (
            <CategorySection
              key={cat}
              category={cat}
              items={items}
              defaultOpen={idx === 0}
              vi={vi}
              emDash={sj.emDash}
            />
          ))}
        </div>
      )}
    </PageLayout>
  );
}
