import { useState, useEffect } from 'react';
import {
  BarChart2, RefreshCw, Eye, Users, Clock, TrendingDown, Globe,
  Monitor, Smartphone, Tablet, Bot, Code, Copy, Check,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { analyticsApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';

const TABS = ['Overview', 'Pages', 'Sources', 'Devices', 'Geo', 'AI Traffic', 'Bots', 'Funnels'];
const DATE_RANGES = ['7d', '30d', '90d', '6m', '1y'];
const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function MetricCard({ icon: Icon, label, value, sub, color = 'text-bright' }) {
  return (
    <Card shadow>
      <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </Card>
  );
}

const TRACKING_SCRIPT = `<!-- WebsiteProfiling Analytics -->
<script>
  (function(w,d,s,l,i){
    w[l]=w[l]||[];
    var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s);
    j.async=true;
    j.src='http://localhost:8000/analytics/script.js?id='+i;
    f.parentNode.insertBefore(j,f);
  })(window,document,'script','wpa','YOUR_SITE_ID');
</script>`;

export default function WebAnalytics() {
  const { isConnected, currentProject } = useApi();
  const [activeTab, setActiveTab] = useState(0);
  const [dateRange, setDateRange] = useState('30d');
  const [overview, setOverview] = useState(null);
  const [pages, setPages] = useState([]);
  const [sources, setSources] = useState([]);
  const [devices, setDevices] = useState([]);
  const [geo, setGeo] = useState([]);
  const [aiTraffic, setAiTraffic] = useState([]);
  const [bots, setBots] = useState([]);
  const [funnels, setFunnels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isConnected && currentProject?.id) loadOverview();
  }, [isConnected, currentProject?.id, dateRange]);

  async function loadOverview() {
    if (!currentProject?.id) return;
    const pid = currentProject.id;
    setLoading(true);
    try {
      const ov = await analyticsApi.getOverview(pid, { range: dateRange });
      setOverview(ov);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  async function loadTab(idx) {
    if (!currentProject?.id) return;
    const pid = currentProject.id;
    setLoading(true);
    try {
      if (idx === 1) {
        const r = await analyticsApi.getPages(pid, { range: dateRange });
        setPages(Array.isArray(r) ? r.map((row) => ({ page: row.page, views: row.views })) : r?.pages || []);
      } else if (idx === 2) {
        const r = await analyticsApi.getSources(pid, { range: dateRange });
        setSources(Array.isArray(r) ? r : r?.sources || []);
      } else if (idx === 3) {
        const r = await analyticsApi.getDevices(pid, { range: dateRange });
        setDevices(Array.isArray(r) ? r : r?.devices || []);
      } else if (idx === 4) {
        const r = await analyticsApi.getGeo(pid, { range: dateRange });
        setGeo(Array.isArray(r) ? r : r?.countries || []);
      } else if (idx === 5) {
        const r = await analyticsApi.getAiTraffic(pid, { range: dateRange });
        const src = r?.by_platform || r?.sources || [];
        setAiTraffic(Array.isArray(src) ? src : []);
      } else if (idx === 6) {
        const r = await analyticsApi.getBots(pid, { range: dateRange });
        setBots(Array.isArray(r) ? r : r?.bots || []);
      } else if (idx === 7) {
        const r = await analyticsApi.getFunnels(pid);
        setFunnels(Array.isArray(r) ? r : r?.funnels || []);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  function selectTab(idx) {
    setActiveTab(idx);
    if (idx === 0) loadOverview();
    else loadTab(idx);
  }

  function copyScript() {
    navigator.clipboard.writeText(TRACKING_SCRIPT).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const chartData = overview?.chart_data || [];
  const deviceData = overview?.devices || devices;
  const sourceData = overview?.sources || sources;

  if (!isConnected) return (
    <PageLayout>
      <PageHeader title="Web Analytics" subtitle="Privacy-first traffic analytics for your website." />
      <ApiConnectPrompt feature="Web Analytics" />
    </PageLayout>
  );

  if (!currentProject?.id) return (
    <PageLayout>
      <PageHeader title="Web Analytics" subtitle="Privacy-first traffic analytics for your website." />
      <Card className="text-center py-12 text-slate-400">Select a project to view analytics (events are keyed by project id).</Card>
    </PageLayout>
  );

  return (
    <PageLayout>
      <PageHeader title="Web Analytics" subtitle="Privacy-first traffic analytics — no cookies, GDPR compliant." />

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <div className="flex gap-1 bg-brand-800 border border-default rounded-lg p-1">
          {DATE_RANGES.map((r) => (
            <button key={r} onClick={() => setDateRange(r)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${dateRange === r ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {r}
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => selectTab(activeTab)}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <Button variant="secondary" className="ml-auto" onClick={copyScript}>
          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Code className="h-4 w-4" />}
          {copied ? 'Copied!' : 'Get Tracking Script'}
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <MetricCard icon={Eye} label="Pageviews" value={overview?.pageviews?.toLocaleString()} color="text-blue-400" />
        <MetricCard icon={Users} label="Sessions" value={overview?.sessions?.toLocaleString()} color="text-green-400" />
        <MetricCard icon={Users} label="Unique Visitors" value={overview?.visitors?.toLocaleString()} color="text-purple-400" />
        <MetricCard icon={Clock} label="Avg Duration" value={overview?.avg_duration} />
        <MetricCard icon={TrendingDown} label="Bounce Rate" value={overview?.bounce_rate != null ? `${overview.bounce_rate}%` : null} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-default mb-6 overflow-x-auto">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => selectTab(i)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === i ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading…</div>}

      {/* Overview tab */}
      {!loading && activeTab === 0 && (
        <div className="space-y-6">
          <Card>
            <p className="text-sm font-medium text-bright mb-4">Traffic Over Time</p>
            {chartData.length === 0 ? (
              <div className="text-center py-8 text-slate-500">No data available yet. Install the tracking script on your site.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                  <Legend />
                  <Line type="monotone" dataKey="pageviews" stroke="#3b82f6" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="sessions" stroke="#22c55e" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="visitors" stroke="#8b5cf6" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <p className="text-sm font-medium text-bright mb-4">Traffic Sources</p>
              {sourceData.length === 0 ? <div className="text-center py-6 text-slate-500">No data.</div> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={sourceData} dataKey="sessions" nameKey="source" cx="50%" cy="50%" outerRadius={80}
                      label={({ source, percent }) => `${source} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {sourceData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card>
              <p className="text-sm font-medium text-bright mb-4">Devices</p>
              {deviceData.length === 0 ? <div className="text-center py-6 text-slate-500">No data.</div> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={deviceData} dataKey="sessions" nameKey="device" cx="50%" cy="50%" outerRadius={80}
                      label={({ device, percent }) => `${device} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {deviceData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Pages tab */}
      {!loading && activeTab === 1 && (
        <Card padding="none" overflowHidden>
          {pages.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No page data.</div>
          ) : (
            <Table>
              <TableHead sticky>
                <tr>
                  <TableHeadCell>Page</TableHeadCell>
                  <TableHeadCell>Pageviews</TableHeadCell>
                  <TableHeadCell>Unique</TableHeadCell>
                  <TableHeadCell>Avg Time</TableHeadCell>
                  <TableHeadCell>Bounce Rate</TableHeadCell>
                </tr>
              </TableHead>
              <TableBody>
                {pages.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-blue-400 text-sm font-mono truncate max-w-sm">{p.page || p.path}</TableCell>
                    <TableCell className="font-mono text-bright">{p.pageviews?.toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-slate-300">{p.unique?.toLocaleString()}</TableCell>
                    <TableCell className="text-slate-300">{p.avg_time || '—'}</TableCell>
                    <TableCell className={p.bounce_rate > 70 ? 'text-red-400' : 'text-green-400'}>{p.bounce_rate != null ? `${p.bounce_rate}%` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {/* Sources tab */}
      {!loading && activeTab === 2 && (
        <Card padding="none" overflowHidden>
          {sources.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No source data.</div>
          ) : (
            <Table>
              <TableHead sticky>
                <tr>
                  <TableHeadCell>Source</TableHeadCell>
                  <TableHeadCell>Medium</TableHeadCell>
                  <TableHeadCell>Sessions</TableHeadCell>
                  <TableHeadCell>Pageviews</TableHeadCell>
                  <TableHeadCell>Bounce Rate</TableHeadCell>
                </tr>
              </TableHead>
              <TableBody>
                {sources.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-bright font-medium">{s.source}</TableCell>
                    <TableCell className="text-slate-400">{s.medium || '—'}</TableCell>
                    <TableCell className="font-mono text-blue-400">{s.sessions?.toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-slate-300">{s.pageviews?.toLocaleString()}</TableCell>
                    <TableCell className={s.bounce_rate > 70 ? 'text-red-400' : 'text-green-400'}>{s.bounce_rate != null ? `${s.bounce_rate}%` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {/* Devices tab */}
      {!loading && activeTab === 3 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <p className="text-sm font-medium text-bright mb-4">Device Breakdown</p>
            {deviceData.length === 0 ? <div className="text-center py-8 text-slate-500">No data.</div> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={deviceData} dataKey="sessions" nameKey="device" cx="50%" cy="50%" outerRadius={90}
                    label={({ device, percent }) => `${device} ${(percent * 100).toFixed(0)}%`}>
                    {deviceData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
          <Card padding="none" overflowHidden>
            <Table>
              <TableHead><tr><TableHeadCell>Device</TableHeadCell><TableHeadCell>Sessions</TableHeadCell><TableHeadCell>%</TableHeadCell></tr></TableHead>
              <TableBody>
                {(deviceData || []).map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="capitalize text-bright flex items-center gap-2">
                      {d.device === 'mobile' ? <Smartphone className="h-4 w-4" /> : d.device === 'tablet' ? <Tablet className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                      {d.device}
                    </TableCell>
                    <TableCell className="font-mono text-blue-400">{d.sessions?.toLocaleString()}</TableCell>
                    <TableCell className="text-slate-400">{d.percent != null ? `${d.percent}%` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Geo tab */}
      {!loading && activeTab === 4 && (
        <Card padding="none" overflowHidden>
          {geo.length === 0 ? <div className="text-center py-12 text-slate-500">No geo data.</div> : (
            <Table>
              <TableHead sticky><tr>
                <TableHeadCell>Country</TableHeadCell>
                <TableHeadCell>Sessions</TableHeadCell>
                <TableHeadCell>Pageviews</TableHeadCell>
                <TableHeadCell>Bounce Rate</TableHeadCell>
              </tr></TableHead>
              <TableBody>
                {geo.map((g, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-bright font-medium">{g.country}</TableCell>
                    <TableCell className="font-mono text-blue-400">{g.sessions?.toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-slate-300">{g.pageviews?.toLocaleString()}</TableCell>
                    <TableCell className={g.bounce_rate > 70 ? 'text-red-400' : 'text-green-400'}>{g.bounce_rate != null ? `${g.bounce_rate}%` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {/* AI Traffic tab */}
      {!loading && activeTab === 5 && (
        <div className="space-y-6">
          <Card>
            <p className="text-sm font-medium text-bright mb-2">Traffic from AI Assistants</p>
            <p className="text-xs text-slate-500 mb-4">Sessions referred from ChatGPT, Perplexity, Claude, Gemini, and other AI tools.</p>
            {aiTraffic.length === 0 ? (
              <div className="text-center py-8 text-slate-500">No AI traffic detected yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={aiTraffic} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis dataKey="source" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} width={120} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                  <Bar dataKey="sessions" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
          {aiTraffic.length > 0 && (
            <Card padding="none" overflowHidden>
              <Table>
                <TableHead><tr><TableHeadCell>AI Source</TableHeadCell><TableHeadCell>Sessions</TableHeadCell><TableHeadCell>Pageviews</TableHeadCell><TableHeadCell>Avg Duration</TableHeadCell></tr></TableHead>
                <TableBody>
                  {aiTraffic.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-bright font-medium flex items-center gap-2"><Bot className="h-4 w-4 text-purple-400" />{s.source}</TableCell>
                      <TableCell className="font-mono text-blue-400">{s.sessions?.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-slate-300">{s.pageviews?.toLocaleString()}</TableCell>
                      <TableCell className="text-slate-400">{s.avg_duration || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Bots tab */}
      {!loading && activeTab === 6 && (
        <Card padding="none" overflowHidden>
          {bots.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No bot traffic detected.</div>
          ) : (
            <Table>
              <TableHead sticky><tr>
                <TableHeadCell>Bot / Crawler</TableHeadCell>
                <TableHeadCell>Requests</TableHeadCell>
                <TableHeadCell>Pages Crawled</TableHeadCell>
                <TableHeadCell>Last Seen</TableHeadCell>
              </tr></TableHead>
              <TableBody>
                {bots.map((b, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-bright font-medium">{b.bot || b.user_agent}</TableCell>
                    <TableCell className="font-mono text-slate-300">{b.requests?.toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-slate-300">{b.pages_crawled?.toLocaleString()}</TableCell>
                    <TableCell className="text-slate-500 text-xs">{b.last_seen}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {/* Funnels tab */}
      {!loading && activeTab === 7 && (
        <div className="space-y-4">
          {funnels.length === 0 ? (
            <Card className="text-center py-12">
              <BarChart2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">No Funnels Configured</p>
              <p className="text-slate-400 text-sm mt-1">Create funnels to track conversion paths through your site.</p>
            </Card>
          ) : (
            funnels.map((f, i) => (
              <Card key={i}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-bright font-medium">{f.name}</h3>
                  <Badge variant="info" label={`${f.conversion_rate || 0}% conversion`} />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {(f.steps || []).map((step, j) => (
                    <div key={j} className="flex items-center gap-2 shrink-0">
                      <div className="bg-brand-900 border border-default rounded-lg p-3 text-center min-w-24">
                        <div className="text-xl font-bold text-blue-400">{step.visitors?.toLocaleString()}</div>
                        <div className="text-xs text-slate-500 mt-1 truncate max-w-xs">{step.label || step.page}</div>
                      </div>
                      {j < (f.steps?.length || 0) - 1 && <span className="text-slate-600 text-lg">→</span>}
                    </div>
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </PageLayout>
  );
}
