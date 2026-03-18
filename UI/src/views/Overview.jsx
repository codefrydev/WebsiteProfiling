import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Globe, CheckCircle, AlertTriangle, FileCode, BookOpen, Share, Cpu, Timer, ExternalLink, TrendingUp, Link2, ChevronRight, Lightbulb } from 'lucide-react';
import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { palette, scoreBandColor, sortByValue } from '../utils/chartPalette';

const REC_COLORS = [
  { border: 'border-l-blue-500',   bg: 'bg-blue-500/10',   text: 'text-blue-400',   dot: 'bg-blue-500'   },
  { border: 'border-l-amber-500',  bg: 'bg-amber-500/10',  text: 'text-amber-400',  dot: 'bg-amber-500'  },
  { border: 'border-l-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-500' },
  { border: 'border-l-green-500',  bg: 'bg-green-500/10',  text: 'text-green-400',  dot: 'bg-green-500'  },
  { border: 'border-l-rose-500',   bg: 'bg-rose-500/10',   text: 'text-rose-400',   dot: 'bg-rose-500'   },
  { border: 'border-l-cyan-500',   bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   dot: 'bg-cyan-500'   },
];

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip);

export default function Overview() {
  const { data } = useReport();
  if (!data) return null;

  const s = data.summary || {};
  const siteName = data.site_name || 'Site';
  const h1Zero = (data.seo_health && data.seo_health.h1_zero) || 0;
  const brokenCount = (s.count_4xx || 0) + (s.count_5xx || 0);

  return (
    <PageLayout className="space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle={
          <>
            Site health summary for <span className="text-blue-400">{siteName}</span>.{' '}
            {s.crawl_time_s != null ? `Crawl completed in ${s.crawl_time_s}s.` : 'Crawl completed.'}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4" /> Total URLs
          </div>
          <div className="text-3xl font-bold text-bright">{(s.total_urls || 0).toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-2">{s.avg_outlinks ?? 0} Avg Outlinks / Page</div>
        </Card>
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" /> Success Rate (2xx)
          </div>
          <div className="text-3xl font-bold text-green-400">{s.success_rate ?? 0}%</div>
        </Card>
        <Card shadow className="border-red-900/30 ring-1 ring-red-500/20">
          <div className="text-red-400/80 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Broken (4xx/5xx)
          </div>
          <div className="text-3xl font-bold text-red-500">{brokenCount}</div>
          <div className="text-xs text-slate-400 mt-2">{s.count_4xx ?? 0} 4xx, {s.count_5xx ?? 0} 5xx</div>
        </Card>
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <FileCode className="h-4 w-4" /> Missing H1s
          </div>
          <div className="text-3xl font-bold text-yellow-500">{h1Zero}</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Median Word Count
          </div>
          <div className="text-3xl font-bold text-bright">
            {data.content_analytics?.word_count_stats?.median != null
              ? Math.round(data.content_analytics.word_count_stats.median).toLocaleString()
              : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-2">per page (2xx HTML)</div>
        </Card>
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Share className="h-4 w-4 text-blue-400" /> OG Tag Coverage
          </div>
          <div className="text-3xl font-bold text-blue-400">
            {data.social_coverage?.og_coverage_pct != null ? `${data.social_coverage.og_coverage_pct}%` : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-2">pages with og:title</div>
        </Card>
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-purple-400" /> Technologies
          </div>
          <div className="text-3xl font-bold text-purple-400">
            {data.tech_stack_summary?.technologies?.length ?? '—'}
          </div>
          <div className="text-xs text-slate-400 mt-2">detected across site</div>
        </Card>
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Timer className="h-4 w-4 text-amber-400" /> Response Time p50
          </div>
          <div className="text-3xl font-bold text-amber-400">
            {data.response_time_stats?.p50 != null ? `${Math.round(data.response_time_stats.p50)}ms` : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            p95: {data.response_time_stats?.p95 != null ? `${Math.round(data.response_time_stats.p95)}ms` : '—'}
          </div>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-bold text-bright mb-4">Health by Category</h2>
        {data.categories && data.categories.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {data.categories.map((cat, i) => {
              const score = cat.score != null ? Math.min(100, Math.max(0, cat.score)) : 0;
              const label = score >= 80 ? 'Good' : score >= 50 ? 'Needs Improvement' : 'Critical';
              const labelCls = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-500';
              const color = scoreBandColor(cat.score);
              const isCritical = score < 50;
              return (
                <Card key={i} className="flex items-center gap-6">
                  <div className="w-20 h-20 relative shrink-0" aria-label={`${cat.name || cat.id}: ${label}, score ${cat.score != null ? cat.score : 'N/A'}`}>
                    <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#1F2937"
                        strokeWidth="3"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke={color}
                        strokeWidth="3"
                        strokeDasharray={`${score}, 100`}
                        strokeLinecap="round"
                      />
                      {isCritical && (
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke={color}
                          strokeWidth="1.5"
                          strokeDasharray="3 3"
                          opacity="0.8"
                        />
                      )}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-bright">
                      {cat.score != null ? cat.score : 'N/A'}
                    </div>
                  </div>
                  <div className="min-w-0 break-words pr-1">
                    <h3 className="text-lg font-bold text-slate-200">{cat.name || cat.id || ''}</h3>
                    <p className={`text-sm mt-1 ${labelCls}`}>{label}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-slate-500">No category data.</p>
        )}
      </div>

      {(data.status_counts && Object.keys(data.status_counts).length > 0) && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-3">Status breakdown</h2>
          <Card padding="tight" className="max-w-md">
            {(() => {
              const labels = Object.keys(data.status_counts);
              const values = Object.values(data.status_counts).map(Number);
              const { labels: sortedLabels, values: sortedValues } = sortByValue(labels, values, 'desc');
              return (
                <div className="h-40" role="img" aria-label={`Status: ${sortedLabels.map((l, i) => `${sortedValues[i]} ${l}`).join(', ')}`}>
                  <Bar
                    data={{
                      labels: sortedLabels,
                      datasets: [{ data: sortedValues, backgroundColor: palette(sortedLabels.length), label: 'URLs' }],
                    }}
                    options={{
                      indexAxis: 'y',
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { grid: { color: 'rgba(71, 85, 105, 0.5)' }, beginAtZero: true },
                        y: { grid: { color: 'rgba(71, 85, 105, 0.5)' } },
                      },
                    }}
                  />
                </div>
              );
            })()}
          </Card>
        </div>
      )}

      {data.site_level && (data.site_level.robots_present != null || data.site_level.sitemap_present != null) && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-3">Site Configuration</h2>
          <Card padding="tight" className="flex gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">robots.txt:</span>
              <span className="font-semibold text-slate-200">{data.site_level.robots_present ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">sitemap.xml:</span>
              <span className="font-semibold text-slate-200">
                {data.site_level.sitemap_present ? 'Yes' : 'No'}
                {data.site_level.sitemap_valid === true ? ' (valid)' : data.site_level.sitemap_present ? ' (invalid or unparsed)' : ''}
              </span>
            </div>
          </Card>
        </div>
      )}

      {(data.recommendations || []).length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-4 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-400" /> Recommendations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.recommendations.map((r, i) => {
              const c = REC_COLORS[i % REC_COLORS.length];
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 border-l-4 ${c.border} ${c.bg} rounded-r-xl px-4 py-3`}
                >
                  <ChevronRight className={`h-4 w-4 shrink-0 mt-0.5 ${c.text}`} />
                  <span className="text-sm text-slate-200 leading-relaxed">{r}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-bold text-bright mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-400" /> Top Pages by Importance
        </h2>
        {(data.top_pages || []).length > 0 ? (() => {
          const pages = data.top_pages;
          const maxPR = Math.max(...pages.map((p) => p.pagerank != null ? Number(p.pagerank) : 0), 0.0001);
          const maxDeg = Math.max(...pages.map((p) => p.degree ?? p.outlinks ?? 0), 1);
          return (
            <Card overflowHidden padding="none">
              <Table>
                <TableHead>
                  <tr>
                    <TableHeadCell className="text-center w-10">#</TableHeadCell>
                    <TableHeadCell className="text-left">Page Title</TableHeadCell>
                    <TableHeadCell className="text-left">URL</TableHeadCell>
                    <TableHeadCell className="text-right">PageRank</TableHeadCell>
                    <TableHeadCell className="text-right">Inbound Links</TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {pages.map((p, i) => {
                    const pr = p.pagerank != null ? Number(p.pagerank) : null;
                    const deg = p.degree ?? p.outlinks ?? null;
                    const prPct = pr != null ? (pr / maxPR) * 100 : 0;
                    const degPct = deg != null ? (deg / maxDeg) * 100 : 0;
                    const rankColor = i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-400' : 'text-slate-500';
                    return (
                      <TableRow key={i}>
                        <TableCell className={`text-center font-bold text-sm ${rankColor}`}>{i + 1}</TableCell>
                        <TableCell className="max-w-[180px]">
                          <div className="text-slate-200 font-medium text-sm truncate" title={p.title || p.url}>
                            {p.title || <span className="text-slate-500 italic">No title</span>}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 font-mono text-blue-400 text-xs hover:text-blue-300 hover:underline group truncate"
                            title={p.url}
                          >
                            <span className="truncate">{p.url}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-track rounded-full h-1.5 hidden sm:block">
                              <div
                                className="h-1.5 rounded-full bg-blue-500 transition-all"
                                style={{ width: `${prPct}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-slate-300 tabular-nums">
                              {pr != null ? pr.toFixed(5) : '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-track rounded-full h-1.5 hidden sm:block">
                              <div
                                className="h-1.5 rounded-full bg-purple-500 transition-all"
                                style={{ width: `${degPct}%` }}
                              />
                            </div>
                            <span className="flex items-center gap-1 font-mono text-xs text-slate-300 tabular-nums">
                              <Link2 className="h-3 w-3 text-slate-500 hidden sm:block" />
                              {deg ?? '—'}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          );
        })() : (
          <p className="text-slate-500">No top pages data (crawl had no edges or outlinks).</p>
        )}
      </div>

    </PageLayout>
  );
}
