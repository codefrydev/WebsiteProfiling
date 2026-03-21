import { useState, useEffect } from 'react';
import {
  BarChart2, RefreshCw, AlertTriangle, Download, Plus, X,
  TrendingUp, TrendingDown, MousePointerClick, Eye, Star, Search,
  Lightbulb, AlertCircle,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { gscApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';
import { PALETTE_CATEGORICAL } from '../utils/chartPalette';

const DATE_RANGES = [
  { label: '7 days', value: '7d' },
  { label: '28 days', value: '28d' },
  { label: '90 days', value: '90d' },
  { label: '6 months', value: '6m' },
  { label: '1 year', value: '1y' },
];
const TABS = ['Queries', 'Pages', 'Devices', 'Countries', 'Opportunities'];
const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b'];

function MetricCard({ icon: Icon, label, value, change, color = 'text-bright' }) {
  return (
    <Card shadow>
      <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className={`text-3xl font-bold ${color}`}>{value ?? '—'}</div>
      {change != null && (
        <div className={`text-xs mt-1 flex items-center gap-1 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(change)}% vs prev. period
        </div>
      )}
    </Card>
  );
}

export default function GscInsights() {
  const { apiOnline, currentProject } = useApi();
  const [properties, setProperties] = useState([]);
  const [selectedProp, setSelectedProp] = useState('');
  const [dateRange, setDateRange] = useState('28d');
  const [activeTab, setActiveTab] = useState(0);
  const [overview, setOverview] = useState(null);
  const [queries, setQueries] = useState([]);
  const [pages, setPages] = useState([]);
  const [devices, setDevices] = useState([]);
  const [countries, setCountries] = useState([]);
  const [lowHangingFruit, setLowHangingFruit] = useState([]);
  const [decay, setDecay] = useState([]);
  const [cannibalization, setCannibalization] = useState([]);
  const [loading, setLoading] = useState(false);
  const [propsLoading, setPropsLoading] = useState(false);
  const [showAddProp, setShowAddProp] = useState(false);
  const [newPropUrl, setNewPropUrl] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (apiOnline && currentProject?.id) loadProperties();
  }, [apiOnline, currentProject?.id]);

  useEffect(() => {
    if (selectedProp) loadOverview();
  }, [selectedProp, dateRange]);

  async function loadProperties() {
    if (!currentProject?.id) return;
    setPropsLoading(true);
    try {
      const props = await gscApi.getProperties(currentProject.id);
      const list = Array.isArray(props) ? props : [];
      setProperties(list);
      if (list.length > 0) setSelectedProp(String(list[0].id));
    } catch { /* ignore */ } finally {
      setPropsLoading(false);
    }
  }

  async function loadOverview() {
    setLoading(true);
    try {
      const ov = await gscApi.getOverview(selectedProp, { range: dateRange });
      setOverview(ov);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadTab(tabIdx) {
    if (!selectedProp) return;
    setLoading(true);
    try {
      if (tabIdx === 0) {
        const q = await gscApi.getQueries(selectedProp, { range: dateRange });
        setQueries(q?.queries || q || []);
      } else if (tabIdx === 1) {
        const p = await gscApi.getPages(selectedProp, { range: dateRange });
        setPages(p?.pages || p || []);
      } else if (tabIdx === 2) {
        // devices fetched via overview
      } else if (tabIdx === 3) {
        // countries via overview
      } else if (tabIdx === 4) {
        const [lhf, d, c] = await Promise.all([
          gscApi.getLowHangingFruit(selectedProp),
          gscApi.getDecay(selectedProp),
          gscApi.getCannibalization(selectedProp),
        ]);
        setLowHangingFruit(lhf?.queries || lhf || []);
        setDecay(d?.queries || d || []);
        setCannibalization(c?.groups || c || []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  function selectTab(idx) {
    setActiveTab(idx);
    loadTab(idx);
  }

  async function handleSync() {
    if (!selectedProp) return;
    setSyncing(true);
    try {
      await gscApi.sync(selectedProp);
      loadOverview();
    } catch (e) {
      alert(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleAddProperty() {
    if (!currentProject?.id || !newPropUrl.trim()) return;
    try {
      await gscApi.addProperty({ project_id: currentProject.id, site_url: newPropUrl });
      setNewPropUrl('');
      setShowAddProp(false);
      loadProperties();
    } catch (e) {
      alert(e.message);
    }
  }

  function exportCsv(data, filename) {
    if (!data.length) return;
    const keys = Object.keys(data[0]);
    const rows = [keys.join(','), ...data.map((d) => keys.map((k) => `"${d[k] ?? ''}"`).join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    a.download = filename;
    a.click();
  }

  const chartData = overview?.chart_data || [];
  const deviceData = overview?.devices || devices;

  if (!apiOnline) return (
    <PageLayout>
      <PageHeader title="GSC Insights" subtitle="Google Search Console data and opportunity analysis." />
      <ApiConnectPrompt feature="GSC Insights" />
    </PageLayout>
  );

  if (!currentProject?.id) return (
    <PageLayout>
      <PageHeader title="GSC Insights" subtitle="Google Search Console data and opportunity analysis." />
      <Card className="text-center py-12 text-slate-400">Select a project to load GSC properties.</Card>
    </PageLayout>
  );

  return (
    <PageLayout>
      <PageHeader title="GSC Insights" subtitle="Analyze Search Console data and find ranking opportunities." />

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        {propsLoading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm"><RefreshCw className="h-4 w-4 animate-spin" /> Loading properties…</div>
        ) : (
          <select value={selectedProp} onChange={(e) => setSelectedProp(e.target.value)}
            className="bg-brand-800 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none min-w-48">
            {properties.length === 0 && <option value="">No properties connected</option>}
            {properties.map((p) => <option key={p.id} value={p.id}>{p.site_url || p.url || p.property}</option>)}
          </select>
        )}
        <div className="flex gap-1 bg-brand-800 border border-default rounded-lg p-1">
          {DATE_RANGES.map((r) => (
            <button key={r.value} onClick={() => setDateRange(r.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${dateRange === r.value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={handleSync} disabled={!selectedProp || syncing}>
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync'}
        </Button>
        <Button variant="secondary" onClick={() => setShowAddProp(true)}>
          <Plus className="h-4 w-4" /> Add Property
        </Button>
        <Button variant="secondary" className="ml-auto" onClick={() => exportCsv(queries, 'gsc-queries.csv')}>
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {!selectedProp && !propsLoading ? (
        <Card className="text-center py-12">
          <Search className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-bright font-medium">No GSC Properties Connected</p>
          <p className="text-slate-400 text-sm mt-1">Add your Google Search Console property to get started.</p>
          <Button className="mt-4" onClick={() => setShowAddProp(true)}>
            <Plus className="h-4 w-4" /> Add Property
          </Button>
        </Card>
      ) : (
        <>
          {/* Summary metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard icon={MousePointerClick} label="Total Clicks" value={overview?.clicks?.toLocaleString()} change={overview?.clicks_change} color="text-blue-400" />
            <MetricCard icon={Eye} label="Impressions" value={overview?.impressions?.toLocaleString()} change={overview?.impressions_change} />
            <MetricCard icon={BarChart2} label="Avg CTR" value={overview?.ctr != null ? `${overview.ctr}%` : '—'} change={overview?.ctr_change} color="text-green-400" />
            <MetricCard icon={TrendingUp} label="Avg Position" value={overview?.avg_position?.toFixed(1)} change={overview?.position_change} color="text-purple-400" />
          </div>

          {/* Traffic chart */}
          <Card className="mb-6">
            <p className="text-sm font-medium text-bright mb-4">Clicks & Impressions Over Time</p>
            {loading && !chartData.length ? (
              <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>
            ) : chartData.length === 0 ? (
              <div className="text-center py-8 text-slate-500">No chart data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="clicks" stroke="#3b82f6" dot={false} strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="impressions" stroke="#22c55e" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

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

          {/* Queries tab */}
          {!loading && activeTab === 0 && (
            <Card padding="none" overflowHidden>
              {queries.length === 0 ? (
                <div className="text-center py-12 text-slate-500">No query data. Select a property and sync first.</div>
              ) : (
                <Table>
                  <TableHead sticky>
                    <tr>
                      <TableHeadCell>Query</TableHeadCell>
                      <TableHeadCell>Clicks</TableHeadCell>
                      <TableHeadCell>Impressions</TableHeadCell>
                      <TableHeadCell>CTR</TableHeadCell>
                      <TableHeadCell>Position</TableHeadCell>
                      <TableHeadCell>Change</TableHeadCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {queries.map((q, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-bright font-medium">{q.query}</TableCell>
                        <TableCell className="text-blue-400 font-mono">{q.clicks?.toLocaleString()}</TableCell>
                        <TableCell className="text-slate-200 font-mono">{q.impressions?.toLocaleString()}</TableCell>
                        <TableCell className="text-green-400">{q.ctr}%</TableCell>
                        <TableCell className="font-mono text-slate-200">{q.position?.toFixed(1)}</TableCell>
                        <TableCell>
                          {q.position_change != null && (
                            <span className={`flex items-center gap-1 text-xs ${q.position_change < 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {q.position_change < 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {Math.abs(q.position_change).toFixed(1)}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
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
                      <TableHeadCell>Clicks</TableHeadCell>
                      <TableHeadCell>Impressions</TableHeadCell>
                      <TableHeadCell>CTR</TableHeadCell>
                      <TableHeadCell>Position</TableHeadCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {pages.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <a href={p.page} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-xs max-w-sm truncate block">{p.page}</a>
                        </TableCell>
                        <TableCell className="text-blue-400 font-mono">{p.clicks?.toLocaleString()}</TableCell>
                        <TableCell className="text-slate-200 font-mono">{p.impressions?.toLocaleString()}</TableCell>
                        <TableCell className="text-green-400">{p.ctr}%</TableCell>
                        <TableCell className="font-mono text-slate-200">{p.position?.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {/* Devices tab */}
          {!loading && activeTab === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <p className="text-sm font-medium text-bright mb-4">Device Breakdown</p>
                {!deviceData?.length ? (
                  <div className="text-center py-8 text-slate-500">No device data.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={deviceData} dataKey="clicks" nameKey="device" cx="50%" cy="50%" outerRadius={90} label={({ device, percent }) => `${device} ${(percent * 100).toFixed(0)}%`}>
                        {deviceData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>
              <Card padding="none" overflowHidden>
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeadCell>Device</TableHeadCell>
                      <TableHeadCell>Clicks</TableHeadCell>
                      <TableHeadCell>Impressions</TableHeadCell>
                      <TableHeadCell>CTR</TableHeadCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {(deviceData || []).map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="capitalize text-bright">{d.device}</TableCell>
                        <TableCell className="font-mono text-blue-400">{d.clicks?.toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-slate-200">{d.impressions?.toLocaleString()}</TableCell>
                        <TableCell className="text-green-400">{d.ctr}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {/* Countries tab */}
          {!loading && activeTab === 3 && (
            <Card padding="none" overflowHidden>
              {!(overview?.countries || countries).length ? (
                <div className="text-center py-12 text-slate-500">No country data.</div>
              ) : (
                <Table>
                  <TableHead sticky>
                    <tr>
                      <TableHeadCell>Country</TableHeadCell>
                      <TableHeadCell>Clicks</TableHeadCell>
                      <TableHeadCell>Impressions</TableHeadCell>
                      <TableHeadCell>CTR</TableHeadCell>
                      <TableHeadCell>Position</TableHeadCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {(overview?.countries || countries).map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-bright">{c.country}</TableCell>
                        <TableCell className="font-mono text-blue-400">{c.clicks?.toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-slate-200">{c.impressions?.toLocaleString()}</TableCell>
                        <TableCell className="text-green-400">{c.ctr}%</TableCell>
                        <TableCell className="font-mono text-slate-200">{c.position?.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {/* Opportunities tab */}
          {!loading && activeTab === 4 && (
            <div className="space-y-6">
              {/* Low-hanging fruit */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-bright font-medium">Low-Hanging Fruit</span>
                  <span className="text-xs text-slate-500">Position 5-20, high impressions, low CTR</span>
                </div>
                {lowHangingFruit.length === 0 ? (
                  <Card className="text-center py-6 text-slate-500">No opportunities found.</Card>
                ) : (
                  <Card padding="none" overflowHidden>
                    <Table>
                      <TableHead>
                        <tr>
                          <TableHeadCell>Query</TableHeadCell>
                          <TableHeadCell>Position</TableHeadCell>
                          <TableHeadCell>Impressions</TableHeadCell>
                          <TableHeadCell>CTR</TableHeadCell>
                          <TableHeadCell>Potential</TableHeadCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {lowHangingFruit.map((q, i) => (
                          <TableRow key={i} className="bg-green-500/3">
                            <TableCell className="text-bright font-medium">{q.query}</TableCell>
                            <TableCell className="font-mono text-yellow-400">{q.position?.toFixed(1)}</TableCell>
                            <TableCell className="font-mono">{q.impressions?.toLocaleString()}</TableCell>
                            <TableCell className="text-red-400">{q.ctr}%</TableCell>
                            <TableCell><Badge variant="success" label="Opportunity" /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </div>

              {/* Content decay */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <span className="text-bright font-medium">Content Decay</span>
                  <span className="text-xs text-slate-500">Losing impressions week-over-week</span>
                </div>
                {decay.length === 0 ? (
                  <Card className="text-center py-6 text-slate-500">No decaying content detected.</Card>
                ) : (
                  <Card padding="none" overflowHidden>
                    <Table>
                      <TableHead>
                        <tr>
                          <TableHeadCell>Query</TableHeadCell>
                          <TableHeadCell>Impressions (cur)</TableHeadCell>
                          <TableHeadCell>Impressions (prev)</TableHeadCell>
                          <TableHeadCell>Change</TableHeadCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {decay.map((q, i) => (
                          <TableRow key={i} className="bg-red-500/3">
                            <TableCell className="text-bright font-medium">{q.query}</TableCell>
                            <TableCell className="font-mono">{q.impressions?.toLocaleString()}</TableCell>
                            <TableCell className="font-mono text-slate-400">{q.prev_impressions?.toLocaleString()}</TableCell>
                            <TableCell className="text-red-400 flex items-center gap-1"><TrendingDown className="h-3 w-3" />{q.change}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </div>

              {/* Cannibalization */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                  <span className="text-bright font-medium">Keyword Cannibalization</span>
                  <span className="text-xs text-slate-500">Multiple pages ranking for same query</span>
                </div>
                {cannibalization.length === 0 ? (
                  <Card className="text-center py-6 text-slate-500">No cannibalization detected.</Card>
                ) : (
                  <div className="space-y-2">
                    {cannibalization.map((group, i) => (
                      <Card key={i} className="border-yellow-500/20">
                        <p className="text-bright font-medium mb-2">{group.query}</p>
                        <div className="space-y-1">
                          {(group.pages || []).map((p, j) => (
                            <div key={j} className="flex items-center justify-between text-xs">
                              <a href={p.page} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline truncate max-w-sm">{p.page}</a>
                              <span className="text-slate-400 ml-4">Pos: {p.position?.toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Property Modal */}
      {showAddProp && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-bright font-bold">Add GSC Property</h3>
              <button onClick={() => setShowAddProp(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <p className="text-slate-400 text-sm mb-4">Enter your Google Search Console property URL.</p>
            <input value={newPropUrl} onChange={(e) => setNewPropUrl(e.target.value)}
              placeholder="https://www.example.com"
              className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 mb-4" />
            <div className="flex gap-3">
              <Button className="flex-1" onClick={handleAddProperty}>Connect Property</Button>
              <Button variant="secondary" onClick={() => setShowAddProp(false)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
