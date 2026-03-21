import { useState, useEffect } from 'react';
import {
  BookOpen, RefreshCw, Search, Download, Copy, Check, FileText,
  Zap, Star, TrendingDown, Plus, ExternalLink, Sparkles,
} from 'lucide-react';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { contentApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';

const TABS = ['Content Explorer', 'AI Content Helper', 'Content Grader', 'Topic Research', 'Inventory'];

function ScoreGauge({ score }) {
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const angle = (score / 100) * 180;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 120 70" className="w-40">
        <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" />
        <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(angle / 180) * 157} 157`} />
        <text x="60" y="58" textAnchor="middle" fill={color} fontSize="22" fontWeight="bold">{score}</text>
        <text x="60" y="68" textAnchor="middle" fill="#64748b" fontSize="9">/100</text>
      </svg>
      <span className="text-sm font-medium" style={{ color }}>{score >= 80 ? 'Excellent' : score >= 50 ? 'Needs Work' : 'Poor'}</span>
    </div>
  );
}

export default function ContentExplorer() {
  const { isConnected, currentProject } = useApi();
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [explorerResults, setExplorerResults] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [topicCards, setTopicCards] = useState([]);
  const [aiKeyword, setAiKeyword] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [gradeUrl, setGradeUrl] = useState('');
  const [gradeKeyword, setGradeKeyword] = useState('');
  const [gradeResult, setGradeResult] = useState(null);
  const [topicSeed, setTopicSeed] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [gradeLoading, setGradeLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isConnected && currentProject?.id && activeTab === 4) loadInventory();
  }, [isConnected, currentProject?.id, activeTab]);

  async function searchContent() {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const r = await contentApi.explorer({ q: searchQuery });
      setExplorerResults(r?.results || r || []);
    } catch { setExplorerResults([]); } finally { setLoading(false); }
  }

  async function loadInventory() {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const r = await contentApi.getInventory(currentProject.id);
      setInventory(r?.pages || r || []);
    } catch { setInventory([]); } finally { setLoading(false); }
  }

  async function generateBrief() {
    if (!aiKeyword.trim()) return;
    setAiLoading(true);
    try {
      const r = await contentApi.generateBrief({ keyword: aiKeyword });
      setAiResult({ type: 'brief', content: r?.brief || r?.content || JSON.stringify(r, null, 2) });
    } catch (e) { setAiResult({ type: 'error', content: e.message }); } finally { setAiLoading(false); }
  }

  async function generateDraft() {
    if (!aiKeyword.trim()) return;
    setAiLoading(true);
    try {
      const r = await contentApi.generateDraft({
        brief: { title: aiKeyword, keyword: aiKeyword },
        length: 1500,
      });
      setAiResult({ type: 'draft', content: r?.draft || r?.content || JSON.stringify(r, null, 2) });
    } catch (e) { setAiResult({ type: 'error', content: e.message }); } finally { setAiLoading(false); }
  }

  async function gradeContent() {
    if ((!gradeUrl.trim() && !gradeKeyword.trim()) || !currentProject?.id) return;
    setGradeLoading(true);
    try {
      const r = await contentApi.score(currentProject.id, { url: gradeUrl || 'https://example.com', keyword: gradeKeyword });
      setGradeResult(r);
    } catch (e) { setGradeResult({ error: e.message }); } finally { setGradeLoading(false); }
  }

  async function researchTopic() {
    if (!topicSeed.trim() || !currentProject?.id) return;
    setLoading(true);
    try {
      const r = await contentApi.topicResearch(currentProject.id, { keyword: topicSeed });
      setTopicCards(r?.topics || r || []);
    } catch { setTopicCards([]); } finally { setLoading(false); }
  }

  function copyResult() {
    if (!aiResult?.content) return;
    navigator.clipboard.writeText(aiResult.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  if (!isConnected) return (
    <PageLayout>
      <PageHeader title="Content Tools" subtitle="AI-powered content creation and research." />
      <ApiConnectPrompt feature="Content Tools" />
    </PageLayout>
  );

  return (
    <PageLayout>
      <PageHeader title="Content Tools" subtitle="Explore, grade, and create content with AI assistance." />

      <div className="flex gap-1 border-b border-default mb-6 overflow-x-auto">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === i ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Content Explorer */}
      {activeTab === 0 && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchContent()}
                placeholder="Search topics, keywords, domains…"
                className="w-full bg-brand-800 border border-default rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
            </div>
            <Button onClick={searchContent} disabled={loading}>
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>

          {explorerResults.length === 0 ? (
            <Card className="text-center py-12">
              <BookOpen className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">Search Content</p>
              <p className="text-slate-400 text-sm mt-1">Find top-performing content by topic or keyword.</p>
            </Card>
          ) : (
            <Card padding="none" overflowHidden>
              <Table>
                <TableHead sticky>
                  <tr>
                    <TableHeadCell>Title</TableHeadCell>
                    <TableHeadCell>Domain</TableHeadCell>
                    <TableHeadCell>Traffic</TableHeadCell>
                    <TableHeadCell>Shares</TableHeadCell>
                    <TableHeadCell>Words</TableHeadCell>
                    <TableHeadCell>Ref Domains</TableHeadCell>
                    <TableHeadCell></TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {explorerResults.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-bright font-medium max-w-xs truncate">{r.title}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{r.domain}</TableCell>
                      <TableCell className="font-mono text-green-400">{r.traffic?.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-slate-300">{r.shares?.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-slate-400">{r.word_count?.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-blue-400">{r.referring_domains}</TableCell>
                      <TableCell>
                        {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300"><ExternalLink className="h-3.5 w-3.5" /></a>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* AI Content Helper */}
      {activeTab === 1 && (
        <div className="space-y-6 max-w-3xl">
          <Card>
            <p className="text-sm font-medium text-bright mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-yellow-400" /> AI Content Assistant
            </p>
            <div className="flex gap-3 mb-4">
              <input value={aiKeyword} onChange={(e) => setAiKeyword(e.target.value)}
                placeholder="Target keyword (e.g. 'best project management software')"
                className="flex-1 bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
            </div>
            <div className="flex gap-3">
              <Button onClick={generateBrief} disabled={aiLoading || !aiKeyword.trim()}>
                {aiLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Generate Brief
              </Button>
              <Button variant="secondary" onClick={generateDraft} disabled={aiLoading || !aiKeyword.trim()}>
                {aiLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Generate Draft
              </Button>
            </div>
          </Card>

          {aiResult && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <span className="text-bright font-medium capitalize">{aiResult.type === 'error' ? 'Error' : aiResult.type}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={copyResult}>
                    {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button variant="secondary" onClick={() => {
                    const blob = new Blob([aiResult.content], { type: 'text/plain' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `${aiResult.type}-${aiKeyword}.txt`;
                    a.click();
                  }}>
                    <Download className="h-4 w-4" /> Download
                  </Button>
                </div>
              </div>
              <pre className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto font-mono bg-brand-900 rounded-lg p-4">
                {aiResult.content}
              </pre>
            </Card>
          )}
        </div>
      )}

      {/* Content Grader */}
      {activeTab === 2 && (
        <div className="space-y-6 max-w-3xl">
          <Card>
            <p className="text-sm font-medium text-bright mb-4 flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-400" /> Content Grader
            </p>
            <div className="space-y-3">
              <input value={gradeUrl} onChange={(e) => setGradeUrl(e.target.value)}
                placeholder="Page URL to grade (optional)"
                className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
              <input value={gradeKeyword} onChange={(e) => setGradeKeyword(e.target.value)}
                placeholder="Target keyword"
                className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
              <Button onClick={gradeContent} disabled={gradeLoading}>
                {gradeLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                Grade Content
              </Button>
            </div>
          </Card>

          {gradeResult && !gradeResult.error && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="flex flex-col items-center justify-center">
                <ScoreGauge score={gradeResult.score || 0} />
                <p className="text-slate-500 text-xs mt-3">Overall Content Score</p>
              </Card>
              <div className="md:col-span-2 space-y-3">
                {(gradeResult.breakdown || []).map((item, i) => (
                  <Card key={i} className="flex items-center gap-3 py-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${item.passed ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div className="flex-1">
                      <p className="text-bright text-sm font-medium">{item.label}</p>
                      {item.note && <p className="text-slate-500 text-xs mt-0.5">{item.note}</p>}
                    </div>
                    <Badge variant={item.passed ? 'success' : 'high'} label={item.passed ? 'Pass' : 'Fail'} />
                  </Card>
                ))}
                {(gradeResult.recommendations || []).length > 0 && (
                  <Card>
                    <p className="text-bright font-medium text-sm mb-3">Recommendations</p>
                    <ul className="space-y-2">
                      {gradeResult.recommendations.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                          <span className="text-yellow-400 mt-0.5 shrink-0">•</span>{r}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            </div>
          )}
          {gradeResult?.error && (
            <Card className="border-red-500/30">
              <p className="text-red-400">{gradeResult.error}</p>
            </Card>
          )}
        </div>
      )}

      {/* Topic Research */}
      {activeTab === 3 && (
        <div className="space-y-6">
          <div className="flex gap-3">
            <input value={topicSeed} onChange={(e) => setTopicSeed(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && researchTopic()}
              placeholder="Enter seed keyword for topic research…"
              className="flex-1 bg-brand-800 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
            <Button onClick={researchTopic} disabled={loading}>
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Research
            </Button>
          </div>

          {topicCards.length === 0 ? (
            <Card className="text-center py-12">
              <Sparkles className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">Discover Topics</p>
              <p className="text-slate-400 text-sm mt-1">Enter a seed keyword to explore related topics and questions.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topicCards.map((t, i) => (
                <Card key={i}>
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-bright font-medium text-sm">{t.topic || t.title}</p>
                    {t.volume && <Badge variant="info" label={`${t.volume?.toLocaleString()} /mo`} />}
                  </div>
                  {t.questions && (
                    <ul className="mt-3 space-y-1">
                      {t.questions.slice(0, 4).map((q, j) => (
                        <li key={j} className="text-xs text-slate-400 flex items-start gap-1.5">
                          <span className="text-blue-500 mt-0.5 shrink-0">?</span>{q}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inventory */}
      {activeTab === 4 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-slate-400 text-sm">{inventory.length} pages tracked</p>
            <Button variant="secondary" onClick={() => currentProject?.id && contentApi.syncInventory(currentProject.id).then(loadInventory)}>
              <RefreshCw className="h-4 w-4" /> Sync Inventory
            </Button>
          </div>
          {loading ? (
            <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading…</div>
          ) : inventory.length === 0 ? (
            <Card className="text-center py-12">
              <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">No Content Inventory</p>
              <p className="text-slate-400 text-sm mt-1">Connect a project and sync to track your content inventory.</p>
            </Card>
          ) : (
            <Card padding="none" overflowHidden>
              <Table>
                <TableHead sticky>
                  <tr>
                    <TableHeadCell>Page</TableHeadCell>
                    <TableHeadCell>Title</TableHeadCell>
                    <TableHeadCell>Traffic</TableHeadCell>
                    <TableHeadCell>Word Count</TableHeadCell>
                    <TableHeadCell>Updated</TableHeadCell>
                    <TableHeadCell>Status</TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {inventory.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-xs truncate max-w-xs block">{p.url || p.path}</a>
                      </TableCell>
                      <TableCell className="text-bright text-sm truncate max-w-xs">{p.title}</TableCell>
                      <TableCell className="font-mono text-green-400">{p.traffic?.toLocaleString() ?? '—'}</TableCell>
                      <TableCell className="font-mono text-slate-300">{p.word_count?.toLocaleString() ?? '—'}</TableCell>
                      <TableCell className="text-slate-500 text-xs">{p.updated_at || p.last_modified}</TableCell>
                      <TableCell>
                        {p.decaying ? (
                          <Badge variant="high" label="Decaying" />
                        ) : (
                          <Badge variant="success" label="Healthy" />
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
    </PageLayout>
  );
}
