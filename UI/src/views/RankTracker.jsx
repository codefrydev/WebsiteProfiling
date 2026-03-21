import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Plus, RefreshCw, Download,
  Search, MapPin, Monitor, Smartphone, ChevronUp, ChevronDown,
  Eye, AlertTriangle, X, Target,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { rankTrackerApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';
import { PALETTE_CATEGORICAL } from '../utils/chartPalette';

const DEVICES = ['desktop', 'mobile'];
const LOCATIONS = ['United States', 'United Kingdom', 'Canada', 'Australia', 'Global'];

function StatCard({ icon: Icon, label, value, sub, color = 'text-bright' }) {
  return (
    <Card shadow>
      <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </Card>
  );
}

function PositionChange({ current, previous }) {
  if (previous == null || current == null) return <span className="text-slate-500">—</span>;
  const diff = previous - current;
  if (diff > 0) return <span className="text-green-400 flex items-center gap-1"><ChevronUp className="h-3 w-3" />{diff}</span>;
  if (diff < 0) return <span className="text-red-400 flex items-center gap-1"><ChevronDown className="h-3 w-3" />{Math.abs(diff)}</span>;
  return <span className="text-slate-500 flex items-center gap-1"><Minus className="h-3 w-3" />0</span>;
}

function KdBadge({ value }) {
  if (value == null) return <span className="text-slate-500">—</span>;
  const color = value >= 70 ? 'bg-red-500/20 text-red-400' : value >= 40 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${color}`}>{value}</span>;
}

export default function RankTracker() {
  const { apiOnline, currentProject } = useApi();
  const [tab, setTab] = useState('keywords');
  const [keywords, setKeywords] = useState([]);
  const [history, setHistory] = useState([]);
  const [visibility, setVisibility] = useState([]);
  const [cannibalization, setCannibalization] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [addDevice, setAddDevice] = useState('desktop');
  const [addLocation, setAddLocation] = useState('United States');
  const [filterDevice, setFilterDevice] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterTag, setFilterTag] = useState('');
  const [selectedKeyword, setSelectedKeyword] = useState(null);
  const [serpModal, setSerpModal] = useState(null);
  const [serpData, setSerpData] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!apiOnline || !currentProject?.id) return;
    loadData();
  }, [apiOnline, currentProject?.id]);

  async function loadData() {
    if (!currentProject?.id) return;
    const pid = currentProject.id;
    setLoading(true);
    setError(null);
    try {
      const [kw, vis] = await Promise.all([
        rankTrackerApi.getKeywords(pid),
        rankTrackerApi.getVisibility(pid),
      ]);
      setKeywords(kw?.keywords || kw || []);
      setVisibility(vis?.data || vis || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    if (!apiOnline || !currentProject?.id) return;
    try {
      const h = await rankTrackerApi.getHistory(currentProject.id);
      setHistory(h?.data || h || []);
    } catch { /* ignore */ }
  }

  async function loadCannibalization() {
    if (!apiOnline || !currentProject?.id) return;
    try {
      const c = await rankTrackerApi.getCannibalization(currentProject.id);
      setCannibalization(c?.data || c || []);
    } catch { /* ignore */ }
  }

  async function handleAddKeywords() {
    if (!bulkInput.trim() || !currentProject?.id) return;
    const kwList = bulkInput.split('\n').map((k) => k.trim()).filter(Boolean);
    try {
      await rankTrackerApi.addKeywords(currentProject.id, {
        keywords: kwList.map((keyword) => ({
          keyword,
          device: addDevice,
          location: addLocation,
        })),
      });
      setBulkInput('');
      setShowAddForm(false);
      loadData();
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleCheckNow() {
    if (!currentProject?.id) return;
    setChecking(true);
    try {
      await rankTrackerApi.checkNow(currentProject.id);
      loadData();
    } catch (e) {
      alert(e.message);
    } finally {
      setChecking(false);
    }
  }

  async function openSerpModal(kw) {
    setSerpModal(kw);
    setSerpData(null);
    try {
      const snap = await rankTrackerApi.getSerpSnapshot(kw.id);
      setSerpData(snap);
    } catch { /* ignore */ }
  }

  function handleExportCsv() {
    const rows = [['Keyword', 'Position', 'Previous', 'Change', 'URL', 'Device', 'Location', 'Tags']];
    keywords.forEach((k) => {
      rows.push([k.keyword, k.current_position, k.previous_position,
        (k.previous_position - k.current_position) || 0, k.url, k.device, k.location, (k.tags || []).join(';')]);
    });
    const csv = rows.map((r) => r.map((v) => `"${v ?? ''}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'rank-tracker.csv';
    a.click();
  }

  const filteredKeywords = keywords.filter((k) => {
    if (filterDevice !== 'all' && k.device !== filterDevice) return false;
    if (filterLocation !== 'all' && k.location !== filterLocation) return false;
    if (filterTag && !(k.tags || []).includes(filterTag)) return false;
    return true;
  });

  const top10Count = keywords.filter((k) => k.current_position && k.current_position <= 10).length;
  const avgPos = keywords.length ? Math.round(keywords.reduce((s, k) => s + (k.current_position || 0), 0) / keywords.length) : 0;

  if (!apiOnline) return (
    <PageLayout>
      <PageHeader title="Rank Tracker" subtitle="Track keyword positions across search engines." />
      <ApiConnectPrompt feature="Rank Tracker" />
    </PageLayout>
  );

  if (!currentProject?.id) return (
    <PageLayout>
      <PageHeader title="Rank Tracker" subtitle="Monitor keyword rankings and visibility trends." />
      <Card className="text-center py-12 text-slate-400">
        Select a project from the header to use Rank Tracker.
      </Card>
    </PageLayout>
  );

  return (
    <PageLayout>
      <PageHeader title="Rank Tracker" subtitle="Monitor keyword rankings and visibility trends." />

      {/* Actions row */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4" /> Add Keywords
        </Button>
        <Button variant="secondary" onClick={handleCheckNow} disabled={checking}>
          <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Checking...' : 'Check Now'}
        </Button>
        <Button variant="secondary" onClick={handleExportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        <div className="ml-auto flex gap-2">
          <select value={filterDevice} onChange={(e) => setFilterDevice(e.target.value)}
            className="bg-brand-800 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none">
            <option value="all">All Devices</option>
            {DEVICES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}
            className="bg-brand-800 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none">
            <option value="all">All Locations</option>
            {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Target} label="Keywords Tracked" value={keywords.length} />
        <StatCard icon={TrendingUp} label="Avg Position" value={avgPos || '—'} color="text-blue-400" />
        <StatCard icon={Search} label="Top 10" value={top10Count} sub="keywords in top 10" color="text-green-400" />
        <StatCard icon={Eye} label="Visibility Score" value={visibility.length ? `${visibility[visibility.length - 1]?.visibility_score ?? visibility[visibility.length - 1]?.score ?? '—'}%` : '—'} color="text-purple-400" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-default mb-6">
        {[
          { id: 'keywords', label: 'Keywords' },
          { id: 'history', label: 'Position History' },
          { id: 'visibility', label: 'Visibility' },
          { id: 'cannibalization', label: 'Cannibalization' },
        ].map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'history') loadHistory(); if (t.id === 'cannibalization') loadCannibalization(); }}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-16 text-slate-400"><RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />Loading rankings…</div>}
      {error && <div className="text-center py-12"><AlertTriangle className="h-6 w-6 text-red-400 mx-auto mb-2" /><p className="text-red-400">{error}</p><Button variant="secondary" className="mt-3" onClick={loadData}>Retry</Button></div>}

      {!loading && !error && tab === 'keywords' && (
        <>
          {filteredKeywords.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Target className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No keywords tracked yet. Add keywords to start tracking.</p>
            </div>
          ) : (
            <Card padding="none" overflowHidden>
              <Table>
                <TableHead sticky>
                  <tr>
                    <TableHeadCell>Keyword</TableHeadCell>
                    <TableHeadCell>Position</TableHeadCell>
                    <TableHeadCell>Change</TableHeadCell>
                    <TableHeadCell>URL</TableHeadCell>
                    <TableHeadCell>Device</TableHeadCell>
                    <TableHeadCell>Location</TableHeadCell>
                    <TableHeadCell>Tags</TableHeadCell>
                    <TableHeadCell>SERP</TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {filteredKeywords.map((kw, i) => (
                    <TableRow key={i}>
                      <TableCell><span className="text-bright font-medium">{kw.keyword}</span></TableCell>
                      <TableCell>
                        <span className={`font-bold text-base ${kw.current_position <= 3 ? 'text-green-400' : kw.current_position <= 10 ? 'text-blue-400' : 'text-slate-200'}`}>
                          {kw.current_position ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell><PositionChange current={kw.current_position} previous={kw.previous_position} /></TableCell>
                      <TableCell className="max-w-xs truncate">
                        {kw.url ? <a href={kw.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-xs">{kw.url}</a> : '—'}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          {kw.device === 'mobile' ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                          {kw.device}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <MapPin className="h-3 w-3" />{kw.location || 'Global'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(kw.tags || []).map((tag) => <span key={tag} className="px-1.5 py-0.5 rounded bg-slate-700 text-xs text-slate-300">{tag}</span>)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <button onClick={() => openSerpModal(kw)} className="text-slate-400 hover:text-blue-400 transition-colors">
                          <Eye className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {!loading && !error && tab === 'history' && (
        <Card>
          <p className="text-sm font-medium text-bright mb-4">Position History (Last 30 Days)</p>
          {history.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No history data available.</div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis reversed tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                <Legend />
                {(history[0] ? Object.keys(history[0]).filter((k) => k !== 'date') : []).slice(0, 5).map((kw, i) => (
                  <Line key={kw} type="monotone" dataKey={kw} stroke={PALETTE_CATEGORICAL[i % PALETTE_CATEGORICAL.length]} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}

      {!loading && !error && tab === 'visibility' && (
        <Card>
          <p className="text-sm font-medium text-bright mb-4">Visibility Score Trend</p>
          {visibility.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No visibility data available.</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={visibility}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                <Area type="monotone" dataKey="score" stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}

      {!loading && !error && tab === 'cannibalization' && (
        <Card padding="none" overflowHidden>
          <div className="p-4 border-b border-default flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-medium text-bright">Keyword Cannibalization Issues</span>
          </div>
          {cannibalization.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No cannibalization detected.</div>
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <TableHeadCell>Keyword</TableHeadCell>
                  <TableHeadCell>Competing URLs</TableHeadCell>
                  <TableHeadCell>Impact</TableHeadCell>
                </tr>
              </TableHead>
              <TableBody>
                {cannibalization.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-bright">{c.keyword}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {(c.urls || []).map((url, j) => (
                          <div key={j} className="text-xs text-blue-400 truncate max-w-sm">{url}</div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={c.impact === 'high' ? 'high' : 'medium'} label={c.impact || 'medium'} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {/* Add Keywords Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-bright font-bold text-lg">Add Keywords</h3>
              <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-bright">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1 block">Keywords (one per line)</label>
                <textarea value={bulkInput} onChange={(e) => setBulkInput(e.target.value)} rows={8}
                  placeholder="seo tools&#10;best seo software&#10;rank tracker tool"
                  className="w-full bg-brand-900 border border-default rounded-lg p-3 text-sm text-slate-200 outline-none resize-none focus:border-blue-500 font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1 block">Device</label>
                  <select value={addDevice} onChange={(e) => setAddDevice(e.target.value)}
                    className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none">
                    {DEVICES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1 block">Location</label>
                  <select value={addLocation} onChange={(e) => setAddLocation(e.target.value)}
                    className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none">
                    {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={handleAddKeywords} className="flex-1">Add {bulkInput.split('\n').filter(Boolean).length || 0} Keywords</Button>
                <Button variant="secondary" onClick={() => setShowAddForm(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* SERP Snapshot Modal */}
      {serpModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-bright font-bold">SERP Snapshot: {serpModal.keyword}</h3>
              <button onClick={() => setSerpModal(null)} className="text-slate-400 hover:text-bright">
                <X className="h-5 w-5" />
              </button>
            </div>
            {!serpData ? (
              <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading…</div>
            ) : (
              <div className="space-y-2">
                {(serpData?.results || []).map((r, i) => (
                  <div key={i} className={`p-3 rounded-lg border ${i + 1 === serpModal.current_position ? 'border-blue-500/50 bg-blue-500/5' : 'border-default bg-brand-900/30'}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-bold text-slate-500 w-5 shrink-0 mt-0.5">{i + 1}</span>
                      <div className="min-w-0">
                        <div className="text-blue-400 text-sm font-medium truncate">{r.title}</div>
                        <div className="text-green-600 text-xs truncate">{r.url}</div>
                        <div className="text-slate-400 text-xs mt-1 line-clamp-2">{r.description}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
