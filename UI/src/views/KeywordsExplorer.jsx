import { useState } from 'react';
import {
  Search, Download, BookmarkPlus, TrendingUp, ChevronRight,
  Filter, RefreshCw, AlertTriangle, X, BarChart2, HelpCircle,
  Layers, Sparkles,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { keywordsApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';
import { PALETTE_CATEGORICAL } from '../utils/chartPalette';

const LOCATIONS = ['United States', 'United Kingdom', 'Canada', 'Australia', 'Global'];
const TABS = ['Matching Terms', 'Related Terms', 'Questions', 'AI Suggestions', 'Clusters'];

const INTENT_COLORS = {
  Informational: 'bg-blue-500/20 text-blue-400',
  Navigational: 'bg-purple-500/20 text-purple-400',
  Commercial: 'bg-yellow-500/20 text-yellow-400',
  Transactional: 'bg-green-500/20 text-green-400',
};

function KdCircle({ value }) {
  if (value == null) return <span className="text-slate-500">—</span>;
  const color = value >= 70 ? '#ef4444' : value >= 40 ? '#eab308' : '#22c55e';
  const label = value >= 70 ? 'Hard' : value >= 40 ? 'Medium' : 'Easy';
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-8 h-8 shrink-0">
        <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${value * 0.942} 94.2`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color }}>{value}</span>
      </div>
      <span className="text-xs" style={{ color }}>{label}</span>
    </div>
  );
}

function IntentBadge({ intent }) {
  if (!intent) return null;
  const cls = INTENT_COLORS[intent] || 'bg-slate-500/20 text-slate-400';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${cls}`}>{intent}</span>;
}

function MiniSparkline({ data }) {
  if (!data || data.length === 0) return <span className="text-slate-500 text-xs">—</span>;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 60; const h = 24;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="text-blue-400">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={pts} />
    </svg>
  );
}

export default function KeywordsExplorer() {
  const { apiOnline, currentProject } = useApi();
  const [seedKeyword, setSeedKeyword] = useState('');
  const [location, setLocation] = useState('United States');
  const [activeTab, setActiveTab] = useState(0);
  const [results, setResults] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kw_recent') || '[]'); } catch { return []; }
  });
  const [volMin, setVolMin] = useState('');
  const [volMax, setVolMax] = useState('');
  const [kdMin, setKdMin] = useState('');
  const [kdMax, setKdMax] = useState('');
  const [intentFilter, setIntentFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  if (!apiOnline) return (
    <PageLayout>
      <PageHeader title="Keywords Explorer" subtitle="Discover keywords with volume, difficulty and intent data." />
      <ApiConnectPrompt feature="Keywords Explorer" />
    </PageLayout>
  );

  async function handleSearch() {
    if (!seedKeyword.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const [res, qs] = await Promise.all([
        keywordsApi.research({ keyword: seedKeyword, location }),
        keywordsApi.questions({ keyword: seedKeyword, location }),
      ]);
      setResults(Array.isArray(res) ? res : res?.keywords || []);
      setQuestions(Array.isArray(qs) ? qs : qs?.questions || []);
      const recent = [seedKeyword, ...recentSearches.filter((r) => r !== seedKeyword)].slice(0, 10);
      setRecentSearches(recent);
      localStorage.setItem('kw_recent', JSON.stringify(recent));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCluster() {
    if (!results.length || !currentProject?.id) return;
    try {
      const res = await keywordsApi.cluster(currentProject.id, {
        name: `Cluster ${seedKeyword || 'keywords'}`,
        keywords: results.map((r) => r.keyword),
      });
      setClusters(res?.clusters || res || []);
      setActiveTab(4);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleAiSuggestions() {
    try {
      const res = await keywordsApi.aiSuggestions({ seed: seedKeyword, count: 20 });
      setAiSuggestions(Array.isArray(res) ? res : res?.suggestions || []);
      setActiveTab(3);
    } catch (e) {
      alert(e.message);
    }
  }

  function handleExport() {
    const rows = [['Keyword', 'Volume', 'KD', 'CPC', 'Intent', 'Parent Topic']];
    results.forEach((r) => rows.push([r.keyword, r.volume, r.kd, r.cpc, r.intent, r.parent_topic]));
    const csv = rows.map((r) => r.map((v) => `"${v ?? ''}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `keywords-${seedKeyword}.csv`;
    a.click();
  }

  const filtered = results.filter((r) => {
    if (volMin && (r.volume || 0) < parseInt(volMin)) return false;
    if (volMax && (r.volume || 0) > parseInt(volMax)) return false;
    if (kdMin && (r.kd || 0) < parseInt(kdMin)) return false;
    if (kdMax && (r.kd || 0) > parseInt(kdMax)) return false;
    if (intentFilter !== 'all' && r.intent !== intentFilter) return false;
    return true;
  });

  return (
    <PageLayout>
      <PageHeader title="Keywords Explorer" subtitle="Research keywords with volume, difficulty, intent and SERP analysis." />

      {/* Search bar */}
      <Card className="mb-6">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-64 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={seedKeyword}
              onChange={(e) => setSeedKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter seed keyword..."
              className="w-full bg-brand-900 border border-default rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500"
            />
          </div>
          <select value={location} onChange={(e) => setLocation(e.target.value)}
            className="bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none">
            {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
          </select>
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? 'Searching…' : 'Search'}
          </Button>
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4" /> Filters
          </Button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-default grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block uppercase tracking-wider font-bold">Volume Min</label>
              <input value={volMin} onChange={(e) => setVolMin(e.target.value)} type="number" placeholder="0"
                className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block uppercase tracking-wider font-bold">Volume Max</label>
              <input value={volMax} onChange={(e) => setVolMax(e.target.value)} type="number" placeholder="∞"
                className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block uppercase tracking-wider font-bold">KD Range</label>
              <div className="flex gap-2">
                <input value={kdMin} onChange={(e) => setKdMin(e.target.value)} type="number" placeholder="0"
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none" />
                <input value={kdMax} onChange={(e) => setKdMax(e.target.value)} type="number" placeholder="100"
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block uppercase tracking-wider font-bold">Intent</label>
              <select value={intentFilter} onChange={(e) => setIntentFilter(e.target.value)}
                className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none">
                <option value="all">All Intents</option>
                <option>Informational</option>
                <option>Navigational</option>
                <option>Commercial</option>
                <option>Transactional</option>
              </select>
            </div>
          </div>
        )}

        {/* Recent searches */}
        {recentSearches.length > 0 && !searched && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-slate-500">Recent:</span>
            {recentSearches.slice(0, 6).map((s) => (
              <button key={s} onClick={() => { setSeedKeyword(s); }}
                className="text-xs text-slate-400 hover:text-blue-400 bg-brand-900/50 px-2 py-0.5 rounded transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}
      </Card>

      {error && <div className="text-center py-8"><AlertTriangle className="h-5 w-5 text-red-400 mx-auto mb-2" /><p className="text-red-400">{error}</p></div>}

      {searched && !loading && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-default mb-4 overflow-x-auto">
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setActiveTab(i)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === i ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                {t}
                {i === 0 && results.length > 0 && <span className="ml-2 text-xs bg-brand-900 text-slate-400 px-1.5 py-0.5 rounded">{filtered.length}</span>}
              </button>
            ))}
          </div>

          {/* Action row */}
          {(activeTab === 0 || activeTab === 1) && results.length > 0 && (
            <div className="flex gap-2 mb-4">
              <Button variant="secondary" onClick={handleExport}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
              <Button variant="secondary" onClick={handleCluster}>
                <Layers className="h-4 w-4" /> Cluster Keywords
              </Button>
              <Button variant="secondary" onClick={handleAiSuggestions}>
                <Sparkles className="h-4 w-4" /> AI Suggestions
              </Button>
            </div>
          )}

          {/* Keywords table */}
          {(activeTab === 0 || activeTab === 1) && (
            <div className="flex gap-4">
              <Card padding="none" overflowHidden className="flex-1">
                {filtered.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">No results found. Try a different keyword or adjust filters.</div>
                ) : (
                  <Table>
                    <TableHead sticky>
                      <tr>
                        <TableHeadCell>Keyword</TableHeadCell>
                        <TableHeadCell>Volume</TableHeadCell>
                        <TableHeadCell>KD</TableHeadCell>
                        <TableHeadCell>CPC</TableHeadCell>
                        <TableHeadCell>Intent</TableHeadCell>
                        <TableHeadCell>Parent Topic</TableHeadCell>
                        <TableHeadCell>Trend</TableHeadCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {filtered.map((kw, i) => (
                        <TableRow key={i} className={selectedRow === i ? 'bg-blue-500/5' : ''} onClick={() => setSelectedRow(selectedRow === i ? null : i)}>
                          <TableCell><span className="text-bright font-medium">{kw.keyword}</span></TableCell>
                          <TableCell><span className="font-mono text-slate-200">{(kw.volume || 0).toLocaleString()}</span></TableCell>
                          <TableCell><KdCircle value={kw.kd} /></TableCell>
                          <TableCell><span className="text-slate-200">{kw.cpc ? `$${kw.cpc}` : '—'}</span></TableCell>
                          <TableCell><IntentBadge intent={kw.intent} /></TableCell>
                          <TableCell className="text-slate-400 text-xs">{kw.parent_topic || '—'}</TableCell>
                          <TableCell><MiniSparkline data={kw.trend} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>

              {/* SERP preview panel */}
              {selectedRow !== null && filtered[selectedRow] && (
                <Card className="w-72 shrink-0 self-start">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">SERP Preview</span>
                    <button onClick={() => setSelectedRow(null)}><X className="h-4 w-4 text-slate-500" /></button>
                  </div>
                  <p className="text-bright font-medium text-sm mb-3">{filtered[selectedRow].keyword}</p>
                  <div className="space-y-2 text-xs">
                    {(filtered[selectedRow].serp_features || []).map((f) => (
                      <div key={f} className="flex items-center gap-2 text-slate-300">
                        <ChevronRight className="h-3 w-3 text-blue-400 shrink-0" />
                        {f}
                      </div>
                    ))}
                    {(filtered[selectedRow].serp_features || []).length === 0 && (
                      <p className="text-slate-500">No SERP features data.</p>
                    )}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Questions tab */}
          {activeTab === 2 && (
            <div className="space-y-4">
              {['who', 'what', 'where', 'when', 'how', 'why'].map((wh) => {
                const qs = questions.filter((q) => q.type === wh || q.question?.toLowerCase().startsWith(wh));
                if (!qs.length) return null;
                return (
                  <Card key={wh}>
                    <div className="flex items-center gap-2 mb-3">
                      <HelpCircle className="h-4 w-4 text-blue-400" />
                      <span className="text-bright font-medium capitalize">{wh}…</span>
                      <span className="text-xs text-slate-500">({qs.length})</span>
                    </div>
                    <div className="space-y-1">
                      {qs.map((q, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 border-b border-default/50 last:border-0">
                          <span className="text-sm text-slate-300">{q.question}</span>
                          <span className="text-xs text-slate-500 ml-4">{q.volume ? q.volume.toLocaleString() + '/mo' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
              {questions.length === 0 && <div className="text-center py-12 text-slate-500">No questions found.</div>}
            </div>
          )}

          {/* AI Suggestions tab */}
          {activeTab === 3 && (
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <span className="text-bright font-medium">AI-Powered Suggestions</span>
              </div>
              {aiSuggestions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-500 mb-3">Click "AI Suggestions" to generate keyword ideas using AI.</p>
                  <Button onClick={handleAiSuggestions}><Sparkles className="h-4 w-4" /> Generate Now</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {aiSuggestions.map((s, i) => (
                    <div key={i} className="p-3 bg-brand-900/40 rounded-lg border border-default">
                      <p className="text-bright text-sm font-medium">{s.keyword}</p>
                      {s.reasoning && <p className="text-xs text-slate-400 mt-1">{s.reasoning}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Clusters tab */}
          {activeTab === 4 && (
            <div className="space-y-4">
              {clusters.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-500 mb-3">Click "Cluster Keywords" to group keywords by topic.</p>
                  <Button onClick={handleCluster}><Layers className="h-4 w-4" /> Cluster Now</Button>
                </div>
              ) : (
                clusters.map((cluster, i) => (
                  <Card key={i}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-bright font-bold">{cluster.topic}</span>
                        <span className="text-xs text-slate-500 ml-3">{cluster.keywords?.length || 0} keywords</span>
                      </div>
                      <span className="text-xs text-slate-400">{cluster.total_volume?.toLocaleString()}/mo total</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(cluster.keywords || []).map((kw, j) => (
                        <span key={j} className="px-2 py-1 bg-brand-900/50 rounded text-xs text-slate-300">{kw}</span>
                      ))}
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </>
      )}

      {!searched && !loading && (
        <div className="text-center py-20 text-slate-500">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">Enter a seed keyword to start research</p>
          <p className="text-sm mt-1">Discover volume, difficulty, intent and related keywords.</p>
        </div>
      )}
    </PageLayout>
  );
}
