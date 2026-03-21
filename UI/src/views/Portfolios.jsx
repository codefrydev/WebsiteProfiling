import { useState, useEffect } from 'react';
import {
  Folders, Plus, X, RefreshCw, Download, TrendingUp,
  Globe, BarChart2, ExternalLink,
} from 'lucide-react';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { reportingApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';

function HealthRing({ score }) {
  const r = 30, circ = 2 * Math.PI * r;
  const fill = ((score || 0) / 100) * circ;
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="76" height="76" className="shrink-0">
      <circle cx="38" cy="38" r={r} fill="none" stroke="#1e293b" strokeWidth="6" />
      <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 38 38)" />
      <text x="38" y="43" textAnchor="middle" fill={color} fontSize="15" fontWeight="bold">{score ?? '—'}</text>
    </svg>
  );
}

export default function Portfolios() {
  const { isConnected } = useApi();
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrls, setNewUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    if (isConnected) loadPortfolios();
  }, [isConnected]);

  useEffect(() => {
    if (selectedPortfolio) loadMetrics(selectedPortfolio.id);
  }, [selectedPortfolio]);

  async function loadPortfolios() {
    setLoading(true);
    try {
      const r = await reportingApi.getPortfolios();
      const arr = r?.portfolios || r || [];
      setPortfolios(arr);
      if (arr.length > 0 && !selectedPortfolio) setSelectedPortfolio(arr[0]);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  async function loadMetrics(id) {
    setMetricsLoading(true);
    try {
      const r = await reportingApi.getPortfolioMetrics(id);
      setMetrics(r);
    } catch { setMetrics(null); } finally { setMetricsLoading(false); }
  }

  async function createPortfolio() {
    const urls = newUrls.split('\n').map((u) => u.trim()).filter(Boolean);
    try {
      const r = await reportingApi.createPortfolio({ name: newName, urls });
      setShowCreate(false);
      setNewName('');
      setNewUrls('');
      await loadPortfolios();
      setSelectedPortfolio(r);
    } catch (e) { alert(e.message); }
  }

  async function deletePortfolio(id) {
    if (!confirm('Delete this portfolio?')) return;
    try {
      await reportingApi.deletePortfolio(id);
      setSelectedPortfolio(null);
      setMetrics(null);
      loadPortfolios();
    } catch (e) { alert(e.message); }
  }

  function exportMetrics() {
    if (!metrics?.urls) return;
    const keys = Object.keys(metrics.urls[0] || {});
    const rows = [keys.join(','), ...metrics.urls.map((u) => keys.map((k) => `"${u[k] ?? ''}"`).join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    a.download = `portfolio-${selectedPortfolio?.name || 'export'}.csv`;
    a.click();
  }

  if (!isConnected) return (
    <PageLayout>
      <PageHeader title="Portfolios" subtitle="Track SEO metrics across multiple websites." />
      <ApiConnectPrompt feature="Portfolios" />
    </PageLayout>
  );

  return (
    <PageLayout>
      <PageHeader title="Portfolios" subtitle="Monitor SEO health across your entire website portfolio." />

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex gap-2 flex-wrap flex-1">
          {portfolios.map((p) => (
            <button key={p.id} onClick={() => setSelectedPortfolio(p)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${selectedPortfolio?.id === p.id ? 'bg-blue-500/10 border-blue-500/25 text-blue-400' : 'border-default text-slate-400 hover:text-slate-200'}`}>
              {p.name}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> New Portfolio
        </Button>
      </div>

      {loading && <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>}

      {!loading && portfolios.length === 0 && (
        <Card className="text-center py-12">
          <Folders className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-bright font-medium">No Portfolios</p>
          <p className="text-slate-400 text-sm mt-1">Create a portfolio to monitor multiple websites together.</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create Portfolio</Button>
        </Card>
      )}

      {selectedPortfolio && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-bright font-bold text-xl">{selectedPortfolio.name}</h2>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={exportMetrics}><Download className="h-4 w-4" /> Export</Button>
              <Button variant="secondary" onClick={() => deletePortfolio(selectedPortfolio.id)}>
                <X className="h-4 w-4" /> Delete
              </Button>
            </div>
          </div>

          {metricsLoading ? (
            <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : metrics ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card shadow className="flex items-center gap-4">
                  <HealthRing score={metrics.avg_health_score} />
                  <div>
                    <div className="text-slate-500 text-xs font-bold uppercase">Avg Health</div>
                    <div className="text-bright text-sm mt-1">{metrics.total_urls} URLs tracked</div>
                  </div>
                </Card>
                <Card shadow>
                  <div className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />Total Traffic</div>
                  <div className="text-2xl font-bold text-blue-400">{metrics.total_traffic?.toLocaleString() ?? '—'}</div>
                </Card>
                <Card shadow>
                  <div className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><BarChart2 className="h-3.5 w-3.5" />Avg Position</div>
                  <div className="text-2xl font-bold text-green-400">{metrics.avg_position?.toFixed(1) ?? '—'}</div>
                </Card>
                <Card shadow>
                  <div className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><Globe className="h-3.5 w-3.5" />Backlinks</div>
                  <div className="text-2xl font-bold text-purple-400">{metrics.total_backlinks?.toLocaleString() ?? '—'}</div>
                </Card>
              </div>

              <Card padding="none" overflowHidden>
                <Table>
                  <TableHead sticky>
                    <tr>
                      <TableHeadCell>URL</TableHeadCell>
                      <TableHeadCell>Health</TableHeadCell>
                      <TableHeadCell>Traffic</TableHeadCell>
                      <TableHeadCell>Keywords</TableHeadCell>
                      <TableHeadCell>Backlinks</TableHeadCell>
                      <TableHeadCell>Issues</TableHeadCell>
                      <TableHeadCell></TableHeadCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {(metrics.urls || []).map((u, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <span className="text-blue-400 text-sm font-mono truncate max-w-xs block">{u.url}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-brand-900 rounded-full h-1.5 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${u.health_score || 0}%`, background: (u.health_score || 0) >= 80 ? '#22c55e' : (u.health_score || 0) >= 50 ? '#f59e0b' : '#ef4444' }} />
                            </div>
                            <span className="text-xs font-mono text-slate-400">{u.health_score}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-green-400">{u.traffic?.toLocaleString() ?? '—'}</TableCell>
                        <TableCell className="font-mono text-slate-300">{u.keywords?.toLocaleString() ?? '—'}</TableCell>
                        <TableCell className="font-mono text-blue-400">{u.backlinks?.toLocaleString() ?? '—'}</TableCell>
                        <TableCell>
                          {u.issues > 0 && <Badge variant="high" label={String(u.issues)} />}
                        </TableCell>
                        <TableCell>
                          <a href={u.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300"><ExternalLink className="h-3.5 w-3.5" /></a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          ) : (
            <Card className="text-center py-8 text-slate-500">No metrics available. The portfolio may still be processing.</Card>
          )}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-bright font-bold">Create Portfolio</h3>
              <button onClick={() => setShowCreate(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Portfolio name"
              className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 mb-3" />
            <textarea value={newUrls} onChange={(e) => setNewUrls(e.target.value)}
              rows={6} placeholder="URLs (one per line)&#10;https://site1.com&#10;https://site2.com"
              className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 font-mono resize-none mb-4" />
            <div className="flex gap-3">
              <Button className="flex-1" onClick={createPortfolio} disabled={!newName.trim() || !newUrls.trim()}>Create Portfolio</Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
