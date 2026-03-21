import { useState } from 'react';
import {
  Megaphone, Search, RefreshCw, DollarSign, TrendingUp, Copy,
  Check, Sparkles, Globe, BarChart2,
} from 'lucide-react';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { advertisingApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';

const TABS = ['PPC Keywords', 'Competitor Ads', 'Ad Copy Generator'];

function DifficultyBar({ value }) {
  const pct = Math.min(100, Math.max(0, value || 0));
  const color = pct > 70 ? '#ef4444' : pct > 40 ? '#f59e0b' : '#22c55e';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-brand-900 rounded-full h-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono text-slate-400 w-6">{pct}</span>
    </div>
  );
}

export default function Advertising() {
  const { isConnected } = useApi();
  const [activeTab, setActiveTab] = useState(0);
  const [seedKeyword, setSeedKeyword] = useState('');
  const [ppcKeywords, setPpcKeywords] = useState([]);
  const [competitorDomain, setCompetitorDomain] = useState('');
  const [competitorAds, setCompetitorAds] = useState(null);
  const [adProduct, setAdProduct] = useState('');
  const [adAudience, setAdAudience] = useState('');
  const [generatedAds, setGeneratedAds] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);

  async function researchKeywords() {
    if (!seedKeyword.trim()) return;
    setLoading(true);
    try {
      const r = await advertisingApi.researchPpc({ keyword: seedKeyword });
      setPpcKeywords(r?.keywords || r || []);
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  }

  async function lookupAds() {
    if (!competitorDomain.trim()) return;
    setLoading(true);
    try {
      const r = await advertisingApi.getCompetitorAds(competitorDomain);
      setCompetitorAds(r);
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  }

  async function generateCopy() {
    if (!adProduct.trim()) return;
    setLoading(true);
    try {
      const r = await advertisingApi.generateCopy({ product: adProduct, audience: adAudience });
      setGeneratedAds(r?.ads || r);
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  }

  function copyAd(text, idx) {
    navigator.clipboard.writeText(text).then(() => { setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000); });
  }

  if (!isConnected) return (
    <PageLayout>
      <PageHeader title="Advertising" subtitle="PPC keyword research and ad copy generation." />
      <ApiConnectPrompt feature="Advertising" />
    </PageLayout>
  );

  return (
    <PageLayout>
      <PageHeader title="Advertising" subtitle="PPC intelligence, competitor ad tracking, and AI ad copy." />

      <div className="flex gap-1 border-b border-default mb-6 overflow-x-auto">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === i ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* PPC Keywords */}
      {activeTab === 0 && (
        <div className="space-y-6">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input value={seedKeyword} onChange={(e) => setSeedKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && researchKeywords()}
                placeholder="Seed keyword…"
                className="w-full bg-brand-800 border border-default rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
            </div>
            <Button onClick={researchKeywords} disabled={loading || !seedKeyword.trim()}>
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Research
            </Button>
          </div>

          {ppcKeywords.length === 0 ? (
            <Card className="text-center py-12">
              <DollarSign className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">PPC Keyword Research</p>
              <p className="text-slate-400 text-sm mt-1">Find keywords to target with paid search campaigns.</p>
            </Card>
          ) : (
            <Card padding="none" overflowHidden>
              <Table>
                <TableHead sticky>
                  <tr>
                    <TableHeadCell>Keyword</TableHeadCell>
                    <TableHeadCell>Avg CPC</TableHeadCell>
                    <TableHeadCell>Competition</TableHeadCell>
                    <TableHeadCell>Volume</TableHeadCell>
                    <TableHeadCell>Intent</TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {ppcKeywords.map((k, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-bright font-medium">{k.keyword}</TableCell>
                      <TableCell className="text-green-400 font-mono font-bold">${k.cpc?.toFixed(2) ?? '—'}</TableCell>
                      <TableCell className="min-w-32"><DifficultyBar value={k.competition} /></TableCell>
                      <TableCell className="font-mono text-slate-300">{k.volume?.toLocaleString()}</TableCell>
                      <TableCell><Badge variant={k.intent === 'commercial' ? 'success' : k.intent === 'transactional' ? 'high' : 'info'} label={k.intent || 'informational'} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Competitor Ads */}
      {activeTab === 1 && (
        <div className="space-y-6">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-md">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input value={competitorDomain} onChange={(e) => setCompetitorDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && lookupAds()}
                placeholder="competitor.com"
                className="w-full bg-brand-800 border border-default rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
            </div>
            <Button onClick={lookupAds} disabled={loading || !competitorDomain.trim()}>
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Look Up Ads
            </Button>
          </div>

          {!competitorAds ? (
            <Card className="text-center py-12">
              <Megaphone className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">Competitor Ad Intelligence</p>
              <p className="text-slate-400 text-sm mt-1">See what keywords competitors are bidding on.</p>
            </Card>
          ) : (
            <>
              {competitorAds.spend_estimate && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card shadow>
                    <div className="text-slate-500 text-xs font-bold uppercase mb-1">Est. Monthly Spend</div>
                    <div className="text-2xl font-bold text-green-400">${competitorAds.spend_estimate?.toLocaleString()}</div>
                  </Card>
                  <Card shadow>
                    <div className="text-slate-500 text-xs font-bold uppercase mb-1">Paid Keywords</div>
                    <div className="text-2xl font-bold text-blue-400">{competitorAds.paid_keywords?.toLocaleString() ?? '—'}</div>
                  </Card>
                  <Card shadow>
                    <div className="text-slate-500 text-xs font-bold uppercase mb-1">Active Ads</div>
                    <div className="text-2xl font-bold text-purple-400">{competitorAds.active_ads ?? '—'}</div>
                  </Card>
                </div>
              )}

              <Card padding="none" overflowHidden>
                <Table>
                  <TableHead sticky>
                    <tr>
                      <TableHeadCell>Keyword</TableHeadCell>
                      <TableHeadCell>Ad Headline</TableHeadCell>
                      <TableHeadCell>Destination</TableHeadCell>
                      <TableHeadCell>CPC</TableHeadCell>
                      <TableHeadCell>Position</TableHeadCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {(competitorAds.ads || []).map((ad, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-bright font-medium">{ad.keyword}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-blue-400 text-sm font-medium">{ad.headline || ad.title}</p>
                            {ad.description && <p className="text-slate-500 text-xs mt-0.5 truncate max-w-xs">{ad.description}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-400 text-xs truncate max-w-xs">{ad.display_url || ad.destination}</TableCell>
                        <TableCell className="font-mono text-green-400">{ad.cpc != null ? `$${ad.cpc}` : '—'}</TableCell>
                        <TableCell className="font-mono text-slate-300">{ad.position ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Ad Copy Generator */}
      {activeTab === 2 && (
        <div className="space-y-6 max-w-2xl">
          <Card>
            <p className="text-sm font-medium text-bright mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-yellow-400" /> AI Ad Copy Generator
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 block">Product / Service</label>
                <input value={adProduct} onChange={(e) => setAdProduct(e.target.value)}
                  placeholder="e.g. 'Project management software for teams'"
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 block">Target Audience</label>
                <input value={adAudience} onChange={(e) => setAdAudience(e.target.value)}
                  placeholder="e.g. 'Startup founders, 25-45, tech-savvy'"
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
              </div>
              <Button onClick={generateCopy} disabled={loading || !adProduct.trim()}>
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Ad Variations
              </Button>
            </div>
          </Card>

          {generatedAds && (
            <div className="space-y-4">
              {(Array.isArray(generatedAds) ? generatedAds : [generatedAds]).map((ad, i) => (
                <Card key={i} className="relative">
                  <div className="flex items-start justify-between mb-2">
                    <Badge variant="info" label={`Variation ${i + 1}`} />
                    <button onClick={() => copyAd(ad.headline + '\n' + ad.description, i)}
                      className="text-slate-400 hover:text-slate-200 transition-colors">
                      {copiedIdx === i ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="mt-2 p-3 bg-brand-900 rounded-lg">
                    <div className="text-xs text-green-500 mb-0.5">Ad · {ad.display_url || 'example.com'}</div>
                    <div className="text-blue-400 font-medium text-sm">{ad.headline || ad.title}</div>
                    <div className="text-slate-400 text-sm mt-1">{ad.description}</div>
                  </div>
                  {ad.cta && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-slate-500">CTA:</span>
                      <Badge variant="success" label={ad.cta} />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
}
