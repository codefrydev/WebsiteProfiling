import { useState, useEffect } from 'react';
import {
  Radar, RefreshCw, Plus, X, Search, ExternalLink, Scan,
  MessageSquare, Bot, BarChart2, TrendingUp, TrendingDown, Globe,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { brandRadarApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';

const TABS = ['Web Mentions', 'AI Visibility', 'Share of Voice'];

const AI_PLATFORMS = [
  { id: 'chatgpt', label: 'ChatGPT', color: '#10b981' },
  { id: 'claude', label: 'Claude', color: '#f59e0b' },
  { id: 'gemini', label: 'Gemini', color: '#3b82f6' },
  { id: 'perplexity', label: 'Perplexity', color: '#8b5cf6' },
  { id: 'grok', label: 'Grok', color: '#ef4444' },
  { id: 'copilot', label: 'Copilot', color: '#06b6d4' },
];

function SentimentBadge({ sentiment }) {
  const map = { positive: 'success', negative: 'high', neutral: 'info' };
  return <Badge variant={map[sentiment] || 'info'} label={sentiment || 'neutral'} />;
}

function PlatformCard({ platform, count = 0, mentioned = false }) {
  return (
    <Card className={`text-center ${mentioned ? 'border-blue-500/30' : ''}`} shadow>
      <div className="text-2xl font-bold mb-1" style={{ color: platform.color }}>{count}</div>
      <div className="text-bright text-sm font-medium">{platform.label}</div>
      <div className={`text-xs mt-1 ${mentioned ? 'text-green-400' : 'text-slate-500'}`}>
        {mentioned ? 'Mentioned' : 'Not tracked'}
      </div>
    </Card>
  );
}

export default function BrandRadar() {
  const { isConnected, currentProject } = useApi();
  const [activeTab, setActiveTab] = useState(0);
  const [mentions, setMentions] = useState([]);
  const [aiCitations, setAiCitations] = useState([]);
  const [shareOfVoice, setShareOfVoice] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanningAi, setScanningAi] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [brandQuery, setBrandQuery] = useState('');

  useEffect(() => {
    if (isConnected && currentProject?.id) loadAll();
  }, [isConnected, currentProject?.id]);

  async function loadAll() {
    if (!currentProject?.id) return;
    const pid = currentProject.id;
    const brand = brandQuery.trim() || 'Brand';
    setLoading(true);
    try {
      const [m, ai, sov, p] = await Promise.all([
        brandRadarApi.getMentions(pid).catch(() => []),
        brandRadarApi.getAiCitations(pid).catch(() => []),
        brandRadarApi.getShareOfVoice(pid, { brand_name: brand }).catch(() => []),
        brandRadarApi.getPrompts(pid).catch(() => ({ prompts: [] })),
      ]);
      setMentions(m?.items || m || []);
      setAiCitations(ai?.items || ai || []);
      setShareOfVoice(sov?.platforms || sov?.data || (Array.isArray(sov) ? sov : []));
      setPrompts(p?.prompts || p || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  async function handleScanWeb() {
    if (!brandQuery.trim() || !currentProject?.id) return;
    setScanning(true);
    try {
      await brandRadarApi.scanWeb(currentProject.id, { brand_name: brandQuery, keywords: [] });
      const m = await brandRadarApi.getMentions(currentProject.id);
      setMentions(m?.items || m || []);
    } catch (e) { alert(e.message); } finally { setScanning(false); }
  }

  async function handleScanAi() {
    if (!currentProject?.id) return;
    setScanningAi(true);
    try {
      await brandRadarApi.scanAi(currentProject.id, {
        brand_name: brandQuery.trim() || 'Brand',
        llm_platforms: ['openai'],
        prompts: [],
      });
      const ai = await brandRadarApi.getAiCitations(currentProject.id);
      setAiCitations(ai?.items || ai || []);
    } catch (e) { alert(e.message); } finally { setScanningAi(false); }
  }

  async function addPrompt() {
    if (!newPrompt.trim() || !currentProject?.id) return;
    try {
      await brandRadarApi.addPrompt(currentProject.id, { prompt: newPrompt });
      setNewPrompt('');
      setShowAddPrompt(false);
      const p = await brandRadarApi.getPrompts(currentProject.id);
      setPrompts(p?.prompts || p || []);
    } catch (e) { alert(e.message); }
  }

  const platformCounts = AI_PLATFORMS.reduce((acc, p) => {
    acc[p.id] = aiCitations.filter((c) => c.platform === p.id).length;
    return acc;
  }, {});

  if (!isConnected) return (
    <PageLayout>
      <PageHeader title="Brand Radar" subtitle="Monitor web mentions and AI visibility." />
      <ApiConnectPrompt feature="Brand Radar" />
    </PageLayout>
  );

  if (!currentProject?.id) return (
    <PageLayout>
      <PageHeader title="Brand Radar" subtitle="Monitor web mentions and AI visibility." />
      <Card className="text-center py-12 text-slate-400">Select a project to use Brand Radar.</Card>
    </PageLayout>
  );

  return (
    <PageLayout>
      <PageHeader title="Brand Radar" subtitle="Track brand mentions across the web and AI platforms." />

      {/* Brand input */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            value={brandQuery}
            onChange={(e) => setBrandQuery(e.target.value)}
            placeholder="Your brand name…"
            className="w-full bg-brand-800 border border-default rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 outline-none focus:border-blue-500"
          />
        </div>
        <Button variant="secondary" onClick={handleScanWeb} disabled={scanning || !brandQuery.trim()}>
          <Scan className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning…' : 'Scan Web'}
        </Button>
        <Button variant="secondary" onClick={handleScanAi} disabled={scanningAi || !brandQuery.trim()}>
          <Bot className={`h-4 w-4 ${scanningAi ? 'animate-spin' : ''}`} />
          {scanningAi ? 'Scanning AI…' : 'Scan AI'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-default mb-6">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === i ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading…</div>}

      {/* Web Mentions */}
      {!loading && activeTab === 0 && (
        <div className="space-y-6">
          {mentions.length === 0 ? (
            <Card className="text-center py-12">
              <MessageSquare className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">No Mentions Yet</p>
              <p className="text-slate-400 text-sm mt-1">Enter your brand name and click "Scan Web" to find mentions.</p>
            </Card>
          ) : (
            <Card padding="none" overflowHidden>
              <Table>
                <TableHead sticky>
                  <tr>
                    <TableHeadCell>Source</TableHeadCell>
                    <TableHeadCell>Date</TableHeadCell>
                    <TableHeadCell>Context</TableHeadCell>
                    <TableHeadCell>Sentiment</TableHeadCell>
                    <TableHeadCell>Type</TableHeadCell>
                    <TableHeadCell></TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {mentions.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Globe className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span className="text-bright text-sm font-medium truncate max-w-xs">{m.source || m.domain}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs whitespace-nowrap">{m.date || m.found_at}</TableCell>
                      <TableCell className="text-slate-300 text-xs max-w-sm truncate">{m.context || m.snippet}</TableCell>
                      <TableCell><SentimentBadge sentiment={m.sentiment} /></TableCell>
                      <TableCell>
                        <Badge variant={m.linked ? 'success' : 'low'} label={m.linked ? 'Linked' : 'Unlinked'} />
                      </TableCell>
                      <TableCell>
                        {m.url && (
                          <a href={m.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* AI Visibility */}
      {!loading && activeTab === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {AI_PLATFORMS.map((p) => (
              <PlatformCard key={p.id} platform={p} count={platformCounts[p.id] || 0} mentioned={(platformCounts[p.id] || 0) > 0} />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-bright font-medium">Citations</h3>
            <Button variant="secondary" onClick={() => setShowAddPrompt(true)}>
              <Plus className="h-4 w-4" /> Add Prompt
            </Button>
          </div>

          {prompts.length > 0 && (
            <Card>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-3">Tracked Prompts</p>
              <div className="flex flex-wrap gap-2">
                {prompts.map((p, i) => (
                  <span key={i} className="bg-brand-900 border border-default rounded-lg px-3 py-1 text-xs text-slate-300">{p.prompt || p}</span>
                ))}
              </div>
            </Card>
          )}

          {aiCitations.length === 0 ? (
            <Card className="text-center py-12">
              <Bot className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">No AI Citations Tracked</p>
              <p className="text-slate-400 text-sm mt-1">Scan AI platforms to see where your brand is mentioned.</p>
            </Card>
          ) : (
            <Card padding="none" overflowHidden>
              <Table>
                <TableHead sticky>
                  <tr>
                    <TableHeadCell>Platform</TableHeadCell>
                    <TableHeadCell>Query</TableHeadCell>
                    <TableHeadCell>Response Snippet</TableHeadCell>
                    <TableHeadCell>Date</TableHeadCell>
                    <TableHeadCell>Position</TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {aiCitations.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <span className="font-medium text-bright capitalize">{c.platform}</span>
                      </TableCell>
                      <TableCell className="text-slate-300 text-xs max-w-xs truncate">{c.query}</TableCell>
                      <TableCell className="text-slate-400 text-xs max-w-sm truncate">{c.snippet || c.context}</TableCell>
                      <TableCell className="text-slate-500 text-xs">{c.date || c.checked_at}</TableCell>
                      <TableCell className="text-slate-300 font-mono text-xs">{c.position ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Share of Voice */}
      {!loading && activeTab === 2 && (
        <div className="space-y-6">
          {shareOfVoice.length === 0 ? (
            <Card className="text-center py-12">
              <BarChart2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">No Share of Voice Data</p>
              <p className="text-slate-400 text-sm mt-1">Add competitors and scan to compare brand visibility.</p>
            </Card>
          ) : (
            <Card>
              <p className="text-sm font-medium text-bright mb-4">Brand vs Competitors — Mention Share</p>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={shareOfVoice}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="period" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} unit="%" />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                  <Legend />
                  <Bar dataKey="brand" name="Your Brand" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="competitor1" name="Competitor 1" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="competitor2" name="Competitor 2" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      )}

      {/* Add Prompt Modal */}
      {showAddPrompt && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-bright font-bold">Add AI Prompt</h3>
              <button onClick={() => setShowAddPrompt(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <p className="text-slate-400 text-sm mb-4">Add a query to track across AI platforms (e.g. "best SEO tools").</p>
            <input
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Enter prompt…"
              className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex gap-3">
              <Button className="flex-1" onClick={addPrompt}>Add Prompt</Button>
              <Button variant="secondary" onClick={() => setShowAddPrompt(false)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
