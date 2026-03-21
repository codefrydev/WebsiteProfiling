import { useState, useEffect } from 'react';
import {
  Swords, Search, RefreshCw, Plus, X, Download, Upload, Globe,
  TrendingUp, Users, Clock, BarChart2, Layers,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { competitiveApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';

const TABS = ['Traffic Analytics', 'Keyword Gap', 'Backlink Gap', 'Batch Analysis', 'Market Segments'];
const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

function MetricCard({ label, value, sub }) {
  return (
    <Card shadow>
      <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold text-bright">{value ?? '—'}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </Card>
  );
}

export default function CompetitiveIntel() {
  const { isConnected, currentProject } = useApi();
  const [activeTab, setActiveTab] = useState(0);
  const [domain, setDomain] = useState('');
  const [trafficData, setTrafficData] = useState(null);
  const [gapDomains, setGapDomains] = useState(['', '']);
  const [keywordGap, setKeywordGap] = useState([]);
  const [backlinkGap, setBacklinkGap] = useState([]);
  const [batchUrls, setBatchUrls] = useState('');
  const [batchResults, setBatchResults] = useState([]);
  const [batchJobId, setBatchJobId] = useState(null);
  const [segments, setSegments] = useState([]);
  const [newSegmentName, setNewSegmentName] = useState('');
  const [newSegmentDomains, setNewSegmentDomains] = useState('');
  const [showNewSegment, setShowNewSegment] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isConnected && currentProject?.id && activeTab === 4) loadSegments();
  }, [isConnected, currentProject?.id, activeTab]);

  async function lookupTraffic() {
    if (!domain.trim()) return;
    setLoading(true);
    try {
      const r = await competitiveApi.getTraffic(domain);
      setTrafficData(r);
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  }

  async function loadKeywordGap() {
    const valid = gapDomains.filter((d) => d.trim());
    if (valid.length < 2) return alert('Enter at least 2 domains.');
    setLoading(true);
    try {
      const r = await competitiveApi.keywordGap({ domains: valid });
      setKeywordGap(r?.gaps || r?.keywords || r || []);
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  }

  async function loadBacklinkGap() {
    const valid = gapDomains.filter((d) => d.trim());
    if (valid.length < 2) return alert('Enter at least 2 domains.');
    setLoading(true);
    try {
      const r = await competitiveApi.backlinkGap({ domains: valid });
      const op = r?.opportunities || {};
      setBacklinkGap(
        Object.entries(op).flatMap(([comp, urls]) =>
          (urls || []).map((u) => ({ competitor: comp, domain: u })),
        ),
      );
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  }

  async function runBatchAnalysis() {
    if (!currentProject?.id) return alert('Select a project first.');
    const urls = batchUrls.split('\n').map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    setLoading(true);
    try {
      const r = await competitiveApi.batchAnalysis(currentProject.id, { urls });
      setBatchJobId(r?.job_id || r?.id);
      if (r?.results) setBatchResults(r.results);
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  }

  async function loadSegments() {
    if (!currentProject?.id) return;
    try {
      const r = await competitiveApi.getSegments(currentProject.id);
      setSegments(r?.segments || r || []);
    } catch { /* ignore */ }
  }

  async function createSegment() {
    if (!currentProject?.id) return;
    const domains = newSegmentDomains.split('\n').map((d) => d.trim()).filter(Boolean);
    try {
      await competitiveApi.createSegment(currentProject.id, { name: newSegmentName, domains });
      setShowNewSegment(false);
      setNewSegmentName('');
      setNewSegmentDomains('');
      loadSegments();
    } catch (e) { alert(e.message); }
  }

  function exportBatch() {
    if (!batchResults.length) return;
    const keys = Object.keys(batchResults[0]);
    const rows = [keys.join(','), ...batchResults.map((r) => keys.map((k) => `"${r[k] ?? ''}"`).join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    a.download = 'batch-analysis.csv';
    a.click();
  }

  const sources = trafficData?.traffic_sources || [];

  if (!isConnected) return (
    <PageLayout>
      <PageHeader title="Competitive Intel" subtitle="Analyze competitor traffic, keywords, and backlinks." />
      <ApiConnectPrompt feature="Competitive Intel" />
    </PageLayout>
  );

  return (
    <PageLayout>
      <PageHeader title="Competitive Intel" subtitle="Traffic intelligence, keyword gaps, and competitor analysis." />

      <div className="flex gap-1 border-b border-default mb-6 overflow-x-auto">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === i ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Traffic Analytics */}
      {activeTab === 0 && (
        <div className="space-y-6">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-md">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input value={domain} onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && lookupTraffic()}
                placeholder="competitor.com"
                className="w-full bg-brand-800 border border-default rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
            </div>
            <Button onClick={lookupTraffic} disabled={loading || !domain.trim()}>
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Analyze
            </Button>
          </div>

          {!trafficData ? (
            <Card className="text-center py-12">
              <Swords className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">Enter a competitor domain to analyze.</p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard label="Monthly Visits" value={trafficData.visits?.toLocaleString()} />
                <MetricCard label="Pages / Visit" value={trafficData.pages_per_visit?.toFixed(1)} />
                <MetricCard label="Bounce Rate" value={trafficData.bounce_rate != null ? `${trafficData.bounce_rate}%` : '—'} />
                <MetricCard label="Avg Duration" value={trafficData.avg_duration} />
              </div>

              {sources.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <p className="text-sm font-medium text-bright mb-4">Traffic Sources</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={sources} dataKey="share" nameKey="source" cx="50%" cy="50%" outerRadius={80}
                          label={({ source, percent }) => `${source} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {sources.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </Card>
                  {(trafficData.geo || []).length > 0 && (
                    <Card padding="none" overflowHidden>
                      <Table>
                        <TableHead><tr><TableHeadCell>Country</TableHeadCell><TableHeadCell>Share</TableHeadCell><TableHeadCell>Visits</TableHeadCell></tr></TableHead>
                        <TableBody>
                          {trafficData.geo.slice(0, 8).map((g, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-bright">{g.country}</TableCell>
                              <TableCell className="text-slate-300">{g.share}%</TableCell>
                              <TableCell className="font-mono text-blue-400">{g.visits?.toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Keyword Gap */}
      {activeTab === 1 && (
        <div className="space-y-6">
          <Card>
            <p className="text-sm font-medium text-bright mb-4">Compare Keyword Rankings</p>
            <div className="space-y-2 mb-4">
              {gapDomains.map((d, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={d} onChange={(e) => { const updated = [...gapDomains]; updated[i] = e.target.value; setGapDomains(updated); }}
                    placeholder={i === 0 ? 'Your domain' : `Competitor ${i}`}
                    className="flex-1 bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
                  {i >= 2 && (
                    <button onClick={() => setGapDomains(gapDomains.filter((_, j) => j !== i))}><X className="h-4 w-4 text-slate-500" /></button>
                  )}
                </div>
              ))}
              {gapDomains.length < 4 && (
                <Button variant="ghost" onClick={() => setGapDomains([...gapDomains, ''])}>
                  <Plus className="h-4 w-4" /> Add Domain
                </Button>
              )}
            </div>
            <Button onClick={loadKeywordGap} disabled={loading}>
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BarChart2 className="h-4 w-4" />}
              Analyze Keyword Gap
            </Button>
          </Card>

          {keywordGap.length === 0 ? (
            <Card className="text-center py-8 text-slate-500">Enter domains and analyze to see keyword gaps.</Card>
          ) : (
            <Card padding="none" overflowHidden>
              <Table>
                <TableHead sticky>
                  <tr>
                    <TableHeadCell>Keyword</TableHeadCell>
                    <TableHeadCell>Volume</TableHeadCell>
                    <TableHeadCell>KD</TableHeadCell>
                    {gapDomains.filter(Boolean).map((d, i) => <TableHeadCell key={i}>{d || `Domain ${i + 1}`}</TableHeadCell>)}
                    <TableHeadCell>Opportunity</TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {keywordGap.map((k, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-bright font-medium">{k.keyword}</TableCell>
                      <TableCell className="font-mono text-slate-300">{k.volume?.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-yellow-400">{k.difficulty}</TableCell>
                      {gapDomains.filter(Boolean).map((_, j) => (
                        <TableCell key={j} className="font-mono text-slate-300">{k[`pos_${j}`] ?? k.positions?.[j] ?? '—'}</TableCell>
                      ))}
                      <TableCell>
                        {!k.positions?.[0] && <Badge variant="success" label="Gap" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Backlink Gap */}
      {activeTab === 2 && (
        <div className="space-y-6">
          <Card>
            <p className="text-sm font-medium text-bright mb-4">Compare Referring Domains</p>
            <div className="space-y-2 mb-4">
              {gapDomains.map((d, i) => (
                <input key={i} value={d} onChange={(e) => { const updated = [...gapDomains]; updated[i] = e.target.value; setGapDomains(updated); }}
                  placeholder={i === 0 ? 'Your domain' : `Competitor ${i}`}
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
              ))}
            </div>
            <Button onClick={loadBacklinkGap} disabled={loading}>
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BarChart2 className="h-4 w-4" />}
              Analyze Backlink Gap
            </Button>
          </Card>

          {backlinkGap.length === 0 ? (
            <Card className="text-center py-8 text-slate-500">Referring domains that link to competitors but not you.</Card>
          ) : (
            <Card padding="none" overflowHidden>
              <Table>
                <TableHead sticky>
                  <tr>
                    <TableHeadCell>Referring Domain</TableHeadCell>
                    <TableHeadCell>Domain Rating</TableHeadCell>
                    <TableHeadCell>Traffic</TableHeadCell>
                    {gapDomains.filter(Boolean).map((d, i) => <TableHeadCell key={i}>{d || `Domain ${i + 1}`}</TableHeadCell>)}
                  </tr>
                </TableHead>
                <TableBody>
                  {backlinkGap.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-blue-400 font-medium">{r.domain}</TableCell>
                      <TableCell className="font-mono text-yellow-400">{r.dr}</TableCell>
                      <TableCell className="font-mono text-slate-300">{r.traffic?.toLocaleString()}</TableCell>
                      {gapDomains.filter(Boolean).map((_, j) => (
                        <TableCell key={j}>{r.links?.[j] ? <Badge variant="success" label="Links" /> : <span className="text-slate-600">—</span>}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Batch Analysis */}
      {activeTab === 3 && (
        <div className="space-y-6">
          <Card>
            <p className="text-sm font-medium text-bright mb-2">Batch URL Analysis</p>
            <p className="text-slate-500 text-xs mb-4">Paste URLs or domains (one per line) to analyze in bulk.</p>
            <textarea value={batchUrls} onChange={(e) => setBatchUrls(e.target.value)}
              rows={8} placeholder="https://example.com/page-1&#10;https://example.com/page-2&#10;competitor.com"
              className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 font-mono resize-none" />
            <div className="flex gap-3 mt-4">
              <Button onClick={runBatchAnalysis} disabled={loading || !batchUrls.trim()}>
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                {loading ? 'Analyzing…' : 'Analyze'}
              </Button>
              {batchResults.length > 0 && (
                <Button variant="secondary" onClick={exportBatch}>
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
              )}
            </div>
          </Card>

          {batchResults.length > 0 && (
            <Card padding="none" overflowHidden>
              <Table>
                <TableHead sticky>
                  <tr>
                    <TableHeadCell>URL / Domain</TableHeadCell>
                    <TableHeadCell>Traffic</TableHeadCell>
                    <TableHeadCell>Keywords</TableHeadCell>
                    <TableHeadCell>Backlinks</TableHeadCell>
                    <TableHeadCell>DA</TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {batchResults.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-blue-400 text-xs font-mono truncate max-w-xs">{r.url || r.domain}</TableCell>
                      <TableCell className="font-mono text-green-400">{r.traffic?.toLocaleString() ?? '—'}</TableCell>
                      <TableCell className="font-mono text-slate-300">{r.keywords?.toLocaleString() ?? '—'}</TableCell>
                      <TableCell className="font-mono text-slate-300">{r.backlinks?.toLocaleString() ?? '—'}</TableCell>
                      <TableCell className="font-mono text-yellow-400">{r.da ?? r.domain_rating ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Market Segments */}
      {activeTab === 4 && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowNewSegment(true)}>
              <Plus className="h-4 w-4" /> New Segment
            </Button>
          </div>

          {segments.length === 0 ? (
            <Card className="text-center py-12">
              <Layers className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">No Market Segments</p>
              <p className="text-slate-400 text-sm mt-1">Create segments to group and compare competitor domains.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {segments.map((seg, i) => (
                <Card key={i}>
                  <p className="text-bright font-bold mb-2">{seg.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {(seg.domains || []).map((d, j) => (
                      <span key={j} className="text-xs bg-brand-900 border border-default rounded px-2 py-1 text-slate-300">{d}</span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {showNewSegment && (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
              <Card className="w-full max-w-md">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-bright font-bold">New Market Segment</h3>
                  <button onClick={() => setShowNewSegment(false)}><X className="h-5 w-5 text-slate-400" /></button>
                </div>
                <input value={newSegmentName} onChange={(e) => setNewSegmentName(e.target.value)}
                  placeholder="Segment name"
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 mb-3" />
                <textarea value={newSegmentDomains} onChange={(e) => setNewSegmentDomains(e.target.value)}
                  rows={5} placeholder="One domain per line"
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 font-mono resize-none mb-4" />
                <div className="flex gap-3">
                  <Button className="flex-1" onClick={createSegment}>Create Segment</Button>
                  <Button variant="secondary" onClick={() => setShowNewSegment(false)}>Cancel</Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
}
