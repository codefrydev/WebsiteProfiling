import { useState } from 'react';
import {
  Globe, Search, RefreshCw, AlertTriangle, Download, Plus, X,
  ExternalLink, TrendingUp, Link2, FileText, DollarSign, Layers,
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { siteExplorerApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';
import { PALETTE_CATEGORICAL } from '../utils/chartPalette';

const TABS = ['Overview', 'Backlinks', 'Referring Domains', 'Organic Keywords', 'Paid Keywords', 'Site Structure'];

function MetricCard({ label, value, sub, color = 'text-bright' }) {
  return (
    <Card shadow>
      <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </Card>
  );
}

export default function SiteExplorer() {
  const { apiOnline } = useApi();
  const [domain, setDomain] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [overview, setOverview] = useState(null);
  const [backlinks, setBacklinks] = useState([]);
  const [refDomains, setRefDomains] = useState([]);
  const [organicKw, setOrganicKw] = useState([]);
  const [paidKw, setPaidKw] = useState([]);
  const [anchorData, setAnchorData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analyzed, setAnalyzed] = useState(false);
  const [blFilter, setBlFilter] = useState('all');
  const [contentGapModal, setContentGapModal] = useState(false);
  const [competitorDomains, setCompetitorDomains] = useState(['', '', '']);
  const [fetching, setFetching] = useState(false);

  if (!apiOnline) return (
    <PageLayout>
      <PageHeader title="Site Explorer" subtitle="Analyze backlinks, organic keywords and domain authority." />
      <ApiConnectPrompt feature="Site Explorer" />
    </PageLayout>
  );

  async function handleAnalyze() {
    if (!domain.trim()) return;
    setLoading(true);
    setError(null);
    setAnalyzed(true);
    try {
      const ov = await siteExplorerApi.getOverview(domain.trim().replace(/^https?:\/\//, ''));
      setOverview(ov);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadTabData(tabIdx) {
    const d = domain.trim().replace(/^https?:\/\//, '');
    if (!d) return;
    setTabLoading(true);
    try {
      if (tabIdx === 1) {
        const [bl, anc] = await Promise.all([
          siteExplorerApi.getBacklinks(d, { type: blFilter }),
          siteExplorerApi.getAnchorText(d),
        ]);
        setBacklinks(bl?.backlinks || bl || []);
        setAnchorData(anc?.anchors || anc || []);
      } else if (tabIdx === 2) {
        const rd = await siteExplorerApi.getReferringDomains(d);
        setRefDomains(rd?.domains || rd || []);
      } else if (tabIdx === 3) {
        const ok = await siteExplorerApi.getOrganicKeywords(d);
        setOrganicKw(ok?.keywords || ok || []);
      } else if (tabIdx === 4) {
        const pk = await siteExplorerApi.getPaidKeywords(d);
        setPaidKw(pk?.keywords || pk || []);
      }
    } catch { /* ignore */ } finally {
      setTabLoading(false);
    }
  }

  function selectTab(idx) {
    setActiveTab(idx);
    if (analyzed) loadTabData(idx);
  }

  async function handleFetchFresh() {
    setFetching(true);
    try {
      await siteExplorerApi.fetchFresh(domain.trim().replace(/^https?:\/\//, ''));
      handleAnalyze();
    } catch (e) {
      alert(e.message);
    } finally {
      setFetching(false);
    }
  }

  const trafficData = overview?.traffic_history || [];
  const topPages = overview?.top_pages || [];

  return (
    <PageLayout>
      <PageHeader title="Site Explorer" subtitle="Analyze any domain's backlink profile, organic keywords and traffic." />

      {/* Search bar */}
      <Card className="mb-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              placeholder="Enter domain (e.g. example.com)..."
              className="w-full bg-brand-900 border border-default rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500" />
          </div>
          <Button onClick={handleAnalyze} disabled={loading}>
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? 'Analyzing…' : 'Analyze'}
          </Button>
          {analyzed && (
            <Button variant="secondary" onClick={handleFetchFresh} disabled={fetching}>
              <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
              Fetch Fresh
            </Button>
          )}
        </div>
      </Card>

      {error && <div className="text-center py-8"><AlertTriangle className="h-5 w-5 text-red-400 mx-auto mb-2" /><p className="text-red-400">{error}</p></div>}

      {analyzed && !loading && !error && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-default mb-6 overflow-x-auto">
            {TABS.map((t, i) => (
              <button key={t} onClick={() => selectTab(i)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === i ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                {t}
              </button>
            ))}
          </div>

          {tabLoading && <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading…</div>}

          {/* Overview tab */}
          {!tabLoading && activeTab === 0 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <MetricCard label="Domain Rating" value={overview?.dr} color="text-blue-400" />
                <MetricCard label="Org. Traffic/mo" value={overview?.organic_traffic?.toLocaleString()} color="text-green-400" />
                <MetricCard label="Keywords" value={overview?.keywords?.toLocaleString()} />
                <MetricCard label="Referring Domains" value={overview?.referring_domains?.toLocaleString()} />
                <MetricCard label="Backlinks" value={overview?.backlinks?.toLocaleString()} />
              </div>

              <Card>
                <p className="text-sm font-medium text-bright mb-4">Organic Traffic (12 months)</p>
                {trafficData.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">No traffic history.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={trafficData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                      <Area type="monotone" dataKey="traffic" stroke="#22c55e" fill="#22c55e20" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card padding="none" overflowHidden>
                <div className="p-4 border-b border-default flex items-center justify-between">
                  <span className="text-sm font-medium text-bright">Top Pages by Traffic</span>
                </div>
                {topPages.length === 0 ? <div className="text-center py-8 text-slate-500">No page data.</div> : (
                  <Table>
                    <TableHead>
                      <tr>
                        <TableHeadCell>URL</TableHeadCell>
                        <TableHeadCell>Traffic</TableHeadCell>
                        <TableHeadCell>Keywords</TableHeadCell>
                        <TableHeadCell>Top Keyword</TableHeadCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {topPages.slice(0, 20).map((p, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-xs flex items-center gap-1 max-w-sm truncate">
                              {p.url}<ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          </TableCell>
                          <TableCell className="text-slate-200">{p.traffic?.toLocaleString()}</TableCell>
                          <TableCell className="text-slate-400">{p.keywords}</TableCell>
                          <TableCell className="text-slate-400 text-xs">{p.top_keyword}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>

              {/* Competitors compare */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-bright">Compare Competitors</span>
                  <Button variant="secondary" onClick={() => setContentGapModal(true)}>
                    <Layers className="h-4 w-4" /> Content Gap
                  </Button>
                </div>
                <div className="flex flex-wrap gap-3">
                  {competitorDomains.map((d, i) => (
                    <input key={i} value={d} onChange={(e) => { const nd = [...competitorDomains]; nd[i] = e.target.value; setCompetitorDomains(nd); }}
                      placeholder={`Competitor ${i + 1}`}
                      className="bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 w-48" />
                  ))}
                  {competitorDomains.length < 4 && (
                    <button onClick={() => setCompetitorDomains([...competitorDomains, ''])}
                      className="text-blue-400 text-sm hover:text-blue-300 flex items-center gap-1">
                      <Plus className="h-4 w-4" /> Add
                    </button>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Backlinks tab */}
          {!tabLoading && activeTab === 1 && (
            <div className="space-y-4">
              <div className="flex gap-3 flex-wrap">
                {['all', 'dofollow', 'nofollow', 'new', 'lost'].map((f) => (
                  <button key={f} onClick={() => setBlFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${blFilter === f ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-brand-800 text-slate-400 hover:text-slate-200 border border-default'}`}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
                <Button variant="secondary" className="ml-auto">
                  <Download className="h-4 w-4" /> Export
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card padding="none" overflowHidden className="md:col-span-1">
                  <div className="p-4 border-b border-default">
                    <span className="text-sm font-medium text-bright">Anchor Text Distribution</span>
                  </div>
                  {anchorData.length === 0 ? <div className="text-center py-8 text-slate-500">No anchor data.</div> : (
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={anchorData.slice(0, 8)} dataKey="count" nameKey="anchor" cx="50%" cy="50%" outerRadius={80} label={({ anchor, percent }) => `${anchor} ${(percent * 100).toFixed(0)}%`}>
                          {anchorData.slice(0, 8).map((_, i) => <Cell key={i} fill={PALETTE_CATEGORICAL[i % PALETTE_CATEGORICAL.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Card>

                <Card padding="none" overflowHidden>
                  {backlinks.length === 0 ? (
                    <div className="text-center py-16 text-slate-500">No backlinks data. Click Analyze first.</div>
                  ) : (
                    <Table>
                      <TableHead>
                        <tr>
                          <TableHeadCell>Source</TableHeadCell>
                          <TableHeadCell>Anchor</TableHeadCell>
                          <TableHeadCell>DR</TableHeadCell>
                          <TableHeadCell>Type</TableHeadCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {backlinks.slice(0, 30).map((bl, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <a href={bl.source_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-xs max-w-xs truncate block">
                                {bl.source_domain || bl.source_url}
                              </a>
                            </TableCell>
                            <TableCell className="text-xs text-slate-400 max-w-xs truncate">{bl.anchor}</TableCell>
                            <TableCell><span className="text-slate-200 font-mono">{bl.dr}</span></TableCell>
                            <TableCell>
                              <Badge variant={bl.dofollow ? 'success' : 'low'} label={bl.dofollow ? 'dofollow' : 'nofollow'} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* Referring Domains tab */}
          {!tabLoading && activeTab === 2 && (
            <Card padding="none" overflowHidden>
              {refDomains.length === 0 ? (
                <div className="text-center py-12 text-slate-500">No referring domains data.</div>
              ) : (
                <Table>
                  <TableHead sticky>
                    <tr>
                      <TableHeadCell>Domain</TableHeadCell>
                      <TableHeadCell>DR</TableHeadCell>
                      <TableHeadCell>Backlinks</TableHeadCell>
                      <TableHeadCell>First Seen</TableHeadCell>
                      <TableHeadCell>Last Seen</TableHeadCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {refDomains.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <a href={`https://${d.domain}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-sm flex items-center gap-1">
                            {d.domain}<ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </TableCell>
                        <TableCell className="font-mono text-slate-200">{d.dr}</TableCell>
                        <TableCell className="text-slate-200">{d.backlinks}</TableCell>
                        <TableCell className="text-slate-400 text-xs">{d.first_seen}</TableCell>
                        <TableCell className="text-slate-400 text-xs">{d.last_seen}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {/* Organic Keywords tab */}
          {!tabLoading && activeTab === 3 && (
            <Card padding="none" overflowHidden>
              {organicKw.length === 0 ? <div className="text-center py-12 text-slate-500">No organic keywords data.</div> : (
                <Table>
                  <TableHead sticky>
                    <tr>
                      <TableHeadCell>Keyword</TableHeadCell>
                      <TableHeadCell>Position</TableHeadCell>
                      <TableHeadCell>Volume</TableHeadCell>
                      <TableHeadCell>Traffic Est.</TableHeadCell>
                      <TableHeadCell>KD</TableHeadCell>
                      <TableHeadCell>URL</TableHeadCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {organicKw.map((kw, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-bright font-medium">{kw.keyword}</TableCell>
                        <TableCell className="font-mono text-slate-200">{kw.position}</TableCell>
                        <TableCell className="text-slate-200">{kw.volume?.toLocaleString()}</TableCell>
                        <TableCell className="text-green-400">{kw.traffic_est?.toLocaleString()}</TableCell>
                        <TableCell className="text-slate-400">{kw.kd}</TableCell>
                        <TableCell className="text-xs text-blue-400 truncate max-w-xs">
                          <a href={kw.url} target="_blank" rel="noreferrer" className="hover:underline">{kw.url}</a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {/* Paid Keywords tab */}
          {!tabLoading && activeTab === 4 && (
            <Card padding="none" overflowHidden>
              {paidKw.length === 0 ? <div className="text-center py-12 text-slate-500">No paid keywords data.</div> : (
                <Table>
                  <TableHead sticky>
                    <tr>
                      <TableHeadCell>Keyword</TableHeadCell>
                      <TableHeadCell>CPC</TableHeadCell>
                      <TableHeadCell>Volume</TableHeadCell>
                      <TableHeadCell>Ad Copy</TableHeadCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {paidKw.map((kw, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-bright font-medium">{kw.keyword}</TableCell>
                        <TableCell className="text-yellow-400">${kw.cpc}</TableCell>
                        <TableCell className="text-slate-200">{kw.volume?.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-slate-400 max-w-xs">{kw.ad_copy}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {/* Site Structure tab */}
          {!tabLoading && activeTab === 5 && (
            <Card>
              <div className="text-center py-12">
                <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">Site structure visualization coming soon.</p>
                <p className="text-xs text-slate-500 mt-1">Hierarchical folder tree and internal link flow.</p>
              </div>
            </Card>
          )}
        </>
      )}

      {!analyzed && (
        <div className="text-center py-20 text-slate-500">
          <Globe className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">Enter a domain to analyze</p>
          <p className="text-sm mt-1">Discover backlinks, organic keywords, and traffic data.</p>
        </div>
      )}

      {/* Content Gap Modal */}
      {contentGapModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-bright font-bold">Content Gap Analysis</h3>
              <button onClick={() => setContentGapModal(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <p className="text-slate-400 text-sm mb-4">Find keywords your competitors rank for that you don't.</p>
            <div className="space-y-2 mb-4">
              <input value={domain} readOnly className="w-full bg-brand-900 border border-blue-500/50 rounded-lg px-3 py-2 text-sm text-slate-200" />
              {competitorDomains.filter(Boolean).map((d, i) => (
                <input key={i} value={d} readOnly className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-400" />
              ))}
            </div>
            <div className="flex gap-3">
              <Button className="flex-1">Run Analysis</Button>
              <Button variant="secondary" onClick={() => setContentGapModal(false)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
