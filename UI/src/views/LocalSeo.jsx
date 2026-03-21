import { useState, useEffect } from 'react';
import {
  MapPin, RefreshCw, Plus, X, Star, MessageSquare, CheckCircle,
  AlertCircle, Building2, TrendingUp, Map,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { localSeoApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';

const TABS = ['GBP Profiles', 'Rank Tracking', 'Reviews', 'Citations', 'Geo Grid'];

function StarRating({ rating }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= Math.round(rating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}`} />
      ))}
      <span className="text-slate-400 text-xs ml-1">{rating?.toFixed(1)}</span>
    </div>
  );
}

function CompletenessRing({ percent }) {
  const r = 24, circ = 2 * Math.PI * r;
  const fill = (percent / 100) * circ;
  const color = percent >= 80 ? '#22c55e' : percent >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="64" height="64" className="shrink-0">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#1e293b" strokeWidth="5" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" fill={color} fontSize="13" fontWeight="bold">{percent}%</text>
    </svg>
  );
}

export default function LocalSeo() {
  const { isConnected, currentProject } = useApi();
  const [activeTab, setActiveTab] = useState(0);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [rankHistory, setRankHistory] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [citations, setCitations] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [heatmapMessage, setHeatmapMessage] = useState('');
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [newProfile, setNewProfile] = useState({ name: '', address: '', phone: '', website: '' });
  const [replyText, setReplyText] = useState({});
  const [aiSuggestLoading, setAiSuggestLoading] = useState({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (isConnected && currentProject?.id) loadProfiles();
  }, [isConnected, currentProject?.id]);

  useEffect(() => {
    if (selectedProfile) {
      if (activeTab === 1) loadRankHistory();
      else if (activeTab === 2) loadReviews();
      else if (activeTab === 3) loadCitations();
      else if (activeTab === 4) loadHeatmap();
    }
  }, [selectedProfile, activeTab]);

  async function loadProfiles() {
    if (!currentProject?.id) return;
    try {
      const r = await localSeoApi.getProfiles(currentProject.id);
      const arr = r?.profiles || r || [];
      setProfiles(arr);
      if (arr.length > 0 && !selectedProfile) setSelectedProfile(arr[0]);
    } catch { /* ignore */ }
  }

  async function loadRankHistory() {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const r = await localSeoApi.getRankHistory(currentProject.id);
      setRankHistory(r?.history || r || []);
    } catch { setRankHistory([]); } finally { setLoading(false); }
  }

  async function loadReviews() {
    setLoading(true);
    try {
      const r = await localSeoApi.getReviews(selectedProfile.id);
      setReviews(r?.reviews || r || []);
    } catch { setReviews([]); } finally { setLoading(false); }
  }

  async function loadCitations() {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const r = await localSeoApi.getCitations(currentProject.id);
      setCitations(r?.citations || r || []);
    } catch { setCitations([]); } finally { setLoading(false); }
  }

  async function loadHeatmap() {
    setLoading(true);
    try {
      const r = await localSeoApi.getHeatmap(selectedProfile.id);
      setHeatmap(r?.grid || r || []);
      setHeatmapMessage(r?.message || '');
    } catch { setHeatmap([]); setHeatmapMessage(''); } finally { setLoading(false); }
  }

  async function addProfile() {
    if (!currentProject?.id) return;
    try {
      await localSeoApi.addProfile({
        project_id: currentProject.id,
        name: newProfile.name,
        address: newProfile.address,
        phone: newProfile.phone,
        website: newProfile.website,
      });
      setShowAddProfile(false);
      setNewProfile({ name: '', address: '', phone: '', website: '' });
      loadProfiles();
    } catch (e) { alert(e.message); }
  }

  async function syncProfile(id) {
    setSyncing(true);
    try {
      await localSeoApi.syncProfile(id);
      loadProfiles();
    } catch (e) { alert(e.message); } finally { setSyncing(false); }
  }

  async function suggestAiReply(review, i) {
    setAiSuggestLoading((prev) => ({ ...prev, [i]: true }));
    try {
      const r = await localSeoApi.suggestResponse({
        review_text: review.text || review.comment,
        rating: review.rating,
        business_name: selectedProfile?.name || 'Business',
      });
      setReplyText((prev) => ({ ...prev, [i]: r?.suggestion || r?.response || '' }));
    } catch (e) { alert(e.message); } finally {
      setAiSuggestLoading((prev) => ({ ...prev, [i]: false }));
    }
  }

  async function sendReply(reviewId, i) {
    try {
      await localSeoApi.respondToReview(reviewId, { response: replyText[i] || '' });
      setReplyText((prev) => ({ ...prev, [i]: '' }));
    } catch (e) { alert(e.message); }
  }

  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1) : '—';

  if (!isConnected) return (
    <PageLayout>
      <PageHeader title="Local SEO" subtitle="Manage GBP profiles, reviews, and local rankings." />
      <ApiConnectPrompt feature="Local SEO" />
    </PageLayout>
  );

  if (!currentProject?.id) return (
    <PageLayout>
      <PageHeader title="Local SEO" subtitle="Google Business Profiles, local rank tracking, and citation management." />
      <Card className="text-center py-12 text-slate-400">Select a project to use Local SEO.</Card>
    </PageLayout>
  );

  return (
    <PageLayout>
      <PageHeader title="Local SEO" subtitle="Google Business Profiles, local rank tracking, and citation management." />

      <div className="flex gap-1 border-b border-default mb-6 overflow-x-auto">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === i ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* GBP Profiles */}
      {activeTab === 0 && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowAddProfile(true)}><Plus className="h-4 w-4" /> Add Profile</Button>
          </div>

          {profiles.length === 0 ? (
            <Card className="text-center py-12">
              <Building2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">No GBP Profiles</p>
              <p className="text-slate-400 text-sm mt-1">Add your Google Business Profile to start tracking local SEO.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profiles.map((p, i) => (
                <Card key={i}>
                  <div className="flex items-start gap-4">
                    <CompletenessRing percent={p.completeness || 0} />
                    <div className="flex-1 min-w-0">
                      <p className="text-bright font-bold">{p.name}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{p.address}</p>
                      <StarRating rating={p.avg_rating} />
                      <div className="flex gap-2 mt-3">
                        <Button variant="secondary" onClick={() => syncProfile(p.id)} disabled={syncing}>
                          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                          Sync
                        </Button>
                        <Button variant="ghost" onClick={() => setSelectedProfile(p)}>Select</Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rank Tracking */}
      {activeTab === 1 && (
        <div className="space-y-6">
          {!selectedProfile ? (
            <Card className="text-center py-8 text-slate-500">Select a profile in the GBP Profiles tab.</Card>
          ) : loading ? (
            <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : rankHistory.length === 0 ? (
            <Card className="text-center py-12">
              <TrendingUp className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">No Rank History</p>
              <p className="text-slate-400 text-sm mt-1">Add keywords and run rank checks to track local positions.</p>
            </Card>
          ) : (
            <Card>
              <p className="text-sm font-medium text-bright mb-4">Local Pack Position History</p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={rankHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis reversed tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                  <Legend />
                  <Line type="monotone" dataKey="position" stroke="#3b82f6" dot={false} strokeWidth={2} name="Local Pack Position" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      )}

      {/* Reviews */}
      {activeTab === 2 && (
        <div className="space-y-6">
          {!selectedProfile ? (
            <Card className="text-center py-8 text-slate-500">Select a profile in the GBP Profiles tab.</Card>
          ) : loading ? (
            <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Card shadow className="sm:col-span-2 flex flex-col items-center justify-center">
                  <div className="text-5xl font-bold text-yellow-400">{avgRating}</div>
                  <StarRating rating={parseFloat(avgRating)} />
                  <div className="text-slate-500 text-xs mt-1">{reviews.length} reviews</div>
                </Card>
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = reviews.filter((r) => Math.round(r.rating) === star).length;
                  const pct = reviews.length ? Math.round((count / reviews.length) * 100) : 0;
                  return (
                    <div key={star} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-4">{star}★</span>
                      <div className="flex-1 bg-brand-900 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 w-6">{pct}%</span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-4">
                {reviews.map((rev, i) => (
                  <Card key={i}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-bright font-medium text-sm">{rev.author_name || 'Anonymous'}</p>
                        <StarRating rating={rev.rating} />
                      </div>
                      <span className="text-slate-500 text-xs">{rev.date || rev.created_at}</span>
                    </div>
                    <p className="text-slate-300 text-sm">{rev.text || rev.comment}</p>

                    {!rev.replied && (
                      <div className="mt-3 space-y-2">
                        <textarea value={replyText[i] || ''} onChange={(e) => setReplyText((prev) => ({ ...prev, [i]: e.target.value }))}
                          rows={3} placeholder="Write a reply…"
                          className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 resize-none" />
                        <div className="flex gap-2">
                          <Button variant="secondary" onClick={() => suggestAiReply(rev, i)} disabled={aiSuggestLoading[i]}>
                            {aiSuggestLoading[i] ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                            AI Suggest
                          </Button>
                          <Button onClick={() => sendReply(rev.id, i)} disabled={!replyText[i]}>
                            <MessageSquare className="h-3.5 w-3.5" /> Reply
                          </Button>
                        </div>
                      </div>
                    )}
                    {rev.replied && (
                      <div className="mt-3 p-3 bg-brand-900 rounded-lg border-l-2 border-blue-500">
                        <p className="text-xs text-blue-400 font-medium mb-1">Owner Reply</p>
                        <p className="text-slate-400 text-sm">{rev.reply}</p>
                      </div>
                    )}
                  </Card>
                ))}
                {reviews.length === 0 && (
                  <Card className="text-center py-8 text-slate-500">No reviews found.</Card>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Citations */}
      {activeTab === 3 && (
        <div className="space-y-6">
          {!selectedProfile ? (
            <Card className="text-center py-8 text-slate-500">Select a profile in the GBP Profiles tab.</Card>
          ) : loading ? (
            <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : (
            <>
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => currentProject?.id && localSeoApi.scanCitations({ project_id: currentProject.id, profile_id: selectedProfile.id }).then(loadCitations)}>
                  <RefreshCw className="h-4 w-4" /> Scan Citations
                </Button>
              </div>
              {citations.length === 0 ? (
                <Card className="text-center py-8 text-slate-500">No citations found. Run a scan first.</Card>
              ) : (
                <Card padding="none" overflowHidden>
                  <Table>
                    <TableHead sticky>
                      <tr>
                        <TableHeadCell>Directory</TableHeadCell>
                        <TableHeadCell>Name Match</TableHeadCell>
                        <TableHeadCell>Address Match</TableHeadCell>
                        <TableHeadCell>Phone Match</TableHeadCell>
                        <TableHeadCell>Status</TableHeadCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {citations.map((c, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-bright font-medium">{c.directory}</TableCell>
                          <TableCell>{c.name_match ? <CheckCircle className="h-4 w-4 text-green-400" /> : <AlertCircle className="h-4 w-4 text-red-400" />}</TableCell>
                          <TableCell>{c.address_match ? <CheckCircle className="h-4 w-4 text-green-400" /> : <AlertCircle className="h-4 w-4 text-red-400" />}</TableCell>
                          <TableCell>{c.phone_match ? <CheckCircle className="h-4 w-4 text-green-400" /> : <AlertCircle className="h-4 w-4 text-red-400" />}</TableCell>
                          <TableCell><Badge variant={c.consistent ? 'success' : 'high'} label={c.consistent ? 'Consistent' : 'Inconsistent'} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Geo Grid */}
      {activeTab === 4 && (
        <div className="space-y-6">
          {!selectedProfile ? (
            <Card className="text-center py-8 text-slate-500">Select a profile in the GBP Profiles tab.</Card>
          ) : loading ? (
            <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : heatmap.length === 0 ? (
            <Card className="text-center py-12">
              <Map className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">No Geo Grid Data</p>
              <p className="text-slate-400 text-sm mt-1">{heatmapMessage || 'Run a local rank check to generate the geo grid heatmap.'}</p>
            </Card>
          ) : (
            <Card>
              <p className="text-sm font-medium text-bright mb-4">Local Pack Rankings — Geo Grid</p>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(heatmap.length))}, minmax(0, 1fr))` }}>
                {heatmap.map((cell, i) => {
                  const pos = cell.position ?? cell.rank ?? 99;
                  const bg = pos <= 3 ? 'bg-green-500' : pos <= 7 ? 'bg-yellow-500' : pos <= 10 ? 'bg-orange-500' : 'bg-red-500';
                  const tip = [cell.keyword, cell.location, cell.lat != null && cell.lng != null ? `${cell.lat}, ${cell.lng}` : null].filter(Boolean).join(' · ');
                  return (
                    <div key={i} className={`${bg} rounded-lg flex items-center justify-center h-12 text-white font-bold text-sm`} title={tip || String(pos)}>
                      {pos > 20 ? '20+' : pos}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-4 flex-wrap">
                {[['#22c55e', '1-3'], ['#eab308', '4-7'], ['#f97316', '8-10'], ['#ef4444', '11+']].map(([color, label]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ background: color }} />
                    <span className="text-xs text-slate-400">Position {label}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Add Profile Modal */}
      {showAddProfile && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-bright font-bold">Add GBP Profile</h3>
              <button onClick={() => setShowAddProfile(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              {[
                { key: 'name', placeholder: 'Business Name' },
                { key: 'address', placeholder: 'Full Address' },
                { key: 'phone', placeholder: 'Phone Number' },
                { key: 'website', placeholder: 'Website URL' },
              ].map(({ key, placeholder }) => (
                <input key={key} value={newProfile[key]} onChange={(e) => setNewProfile((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <Button className="flex-1" onClick={addProfile}>Add Profile</Button>
              <Button variant="secondary" onClick={() => setShowAddProfile(false)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
