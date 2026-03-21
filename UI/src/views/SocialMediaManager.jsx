import { useState, useEffect } from 'react';
import {
  MessageSquare, RefreshCw, Plus, X, Calendar, BarChart2,
  Users, Heart, Share2, Eye, Send, Clock, Check,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { socialApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';

const TABS = ['Composer', 'Calendar', 'Analytics', 'Influencers'];

const PLATFORMS = [
  { id: 'twitter', label: 'Twitter / X', color: '#1d9bf0', icon: '𝕏' },
  { id: 'facebook', label: 'Facebook', color: '#1877f2', icon: 'f' },
  { id: 'linkedin', label: 'LinkedIn', color: '#0a66c2', icon: 'in' },
  { id: 'instagram', label: 'Instagram', color: '#e1306c', icon: '📷' },
  { id: 'tiktok', label: 'TikTok', color: '#fe2c55', icon: '♪' },
];

const MONTH_DAYS = Array.from({ length: 35 }, (_, i) => i);

export default function SocialMediaManager() {
  const { isConnected, currentProject } = useApi();
  const [activeTab, setActiveTab] = useState(0);
  const [postText, setPostText] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState(['twitter']);
  const [scheduleDate, setScheduleDate] = useState('');
  const [posts, setPosts] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [topPosts, setTopPosts] = useState([]);
  const [influencerQuery, setInfluencerQuery] = useState('');
  const [influencers, setInfluencers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (isConnected && currentProject?.id) loadPosts();
  }, [isConnected, currentProject?.id]);

  async function loadPosts() {
    if (!currentProject?.id) return;
    try {
      const r = await socialApi.getPosts(currentProject.id);
      setPosts(r?.posts || r || []);
    } catch { /* ignore */ }
  }

  async function loadAnalytics() {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const r = await socialApi.getAnalytics(currentProject.id);
      setAnalytics(r);
      setTopPosts(r?.top_posts || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  async function searchInfluencers() {
    if (!influencerQuery.trim() || !currentProject?.id) return;
    setLoading(true);
    try {
      const r = await socialApi.findInfluencers(currentProject.id, { niche: influencerQuery });
      setInfluencers(r?.influencers || r || []);
    } catch { setInfluencers([]); } finally { setLoading(false); }
  }

  async function submitPost() {
    if (!postText.trim() || selectedPlatforms.length === 0 || !currentProject?.id) return;
    setPosting(true);
    try {
      await socialApi.createPost({
        project_id: currentProject.id,
        content: postText,
        platforms: selectedPlatforms,
        scheduled_at: scheduleDate || null,
      });
      setPostText('');
      setScheduleDate('');
      loadPosts();
    } catch (e) { alert(e.message); } finally { setPosting(false); }
  }

  function togglePlatform(id) {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  const calendarPosts = posts.filter((p) => p.scheduled_at);
  function getPostsForDay(day) {
    return calendarPosts.filter((p) => {
      const d = new Date(p.scheduled_at);
      return d.getDate() === day && d.getMonth() === today.getMonth();
    });
  }

  if (!isConnected) return (
    <PageLayout>
      <PageHeader title="Social Media Manager" subtitle="Schedule posts and track social performance." />
      <ApiConnectPrompt feature="Social Media Manager" />
    </PageLayout>
  );

  return (
    <PageLayout>
      <PageHeader title="Social Media Manager" subtitle="Compose, schedule, and analyze social media content." />

      <div className="flex gap-1 border-b border-default mb-6 overflow-x-auto">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => { setActiveTab(i); if (i === 2) loadAnalytics(); }}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === i ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Composer */}
      {activeTab === 0 && (
        <div className="space-y-6 max-w-2xl">
          <Card>
            <p className="text-sm font-medium text-bright mb-4">Create Post</p>
            <textarea value={postText} onChange={(e) => setPostText(e.target.value)}
              rows={5} maxLength={2200}
              placeholder="What's on your mind? Write your post here…"
              className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 resize-none mb-2" />
            <div className="text-right text-xs text-slate-600 mb-4">{postText.length} / 2200</div>

            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-3">Platforms</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {PLATFORMS.map((p) => (
                <button key={p.id} onClick={() => togglePlatform(p.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${selectedPlatforms.includes(p.id) ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-default text-slate-400 hover:text-slate-200'}`}>
                  <span style={{ color: p.color }}>{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-3">Schedule (optional)</p>
            <input type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 mb-4" />

            <div className="flex gap-3">
              <Button onClick={submitPost} disabled={posting || !postText.trim() || selectedPlatforms.length === 0}>
                {posting ? <RefreshCw className="h-4 w-4 animate-spin" /> : scheduleDate ? <Clock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {posting ? 'Posting…' : scheduleDate ? 'Schedule' : 'Post Now'}
              </Button>
            </div>
          </Card>

          {posts.length > 0 && (
            <Card>
              <p className="text-sm font-medium text-bright mb-4">Recent Posts</p>
              <div className="space-y-3">
                {posts.slice(0, 5).map((p, i) => (
                  <div key={i} className="flex items-start gap-3 pb-3 border-b border-default last:border-0">
                    <div className="flex-1">
                      <p className="text-slate-300 text-sm line-clamp-2">{p.content}</p>
                      <div className="flex items-center gap-3 mt-2">
                        {(p.platforms || []).map((pl) => (
                          <span key={pl} className="text-xs text-slate-500 capitalize">{pl}</span>
                        ))}
                        <span className="text-xs text-slate-600">{p.scheduled_at || p.published_at}</span>
                      </div>
                    </div>
                    <Badge variant={p.status === 'published' ? 'success' : p.status === 'scheduled' ? 'info' : 'low'} label={p.status || 'draft'} />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Calendar */}
      {activeTab === 1 && (
        <Card>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-bright font-bold">
              {today.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h3>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-center text-xs text-slate-500 font-bold py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dayPosts = getPostsForDay(day);
              const isToday = day === today.getDate();
              return (
                <div key={day} className={`min-h-16 rounded-lg border p-1.5 ${isToday ? 'border-blue-500/50 bg-blue-500/5' : 'border-default'}`}>
                  <span className={`text-xs font-bold ${isToday ? 'text-blue-400' : 'text-slate-500'}`}>{day}</span>
                  <div className="space-y-0.5 mt-1">
                    {dayPosts.map((p, i) => (
                      <div key={i} className="text-[10px] bg-blue-600/20 text-blue-300 rounded px-1 truncate">{p.content?.substring(0, 20)}…</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Analytics */}
      {activeTab === 2 && (
        <div className="space-y-6">
          {loading ? (
            <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card shadow>
                  <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> Engagement</div>
                  <div className="text-2xl font-bold text-red-400">{analytics?.total_engagement?.toLocaleString() ?? '—'}</div>
                </Card>
                <Card shadow>
                  <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> Impressions</div>
                  <div className="text-2xl font-bold text-blue-400">{analytics?.impressions?.toLocaleString() ?? '—'}</div>
                </Card>
                <Card shadow>
                  <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Followers</div>
                  <div className="text-2xl font-bold text-green-400">{analytics?.followers?.toLocaleString() ?? '—'}</div>
                </Card>
                <Card shadow>
                  <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1"><Share2 className="h-3.5 w-3.5" /> Shares</div>
                  <div className="text-2xl font-bold text-purple-400">{analytics?.shares?.toLocaleString() ?? '—'}</div>
                </Card>
              </div>

              {analytics?.chart_data?.length > 0 && (
                <Card>
                  <p className="text-sm font-medium text-bright mb-4">Engagement Over Time</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={analytics.chart_data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                      <Legend />
                      <Line type="monotone" dataKey="likes" stroke="#ef4444" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="shares" stroke="#3b82f6" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="comments" stroke="#22c55e" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {topPosts.length > 0 && (
                <Card padding="none" overflowHidden>
                  <Table>
                    <TableHead><tr><TableHeadCell>Post</TableHeadCell><TableHeadCell>Platform</TableHeadCell><TableHeadCell>Likes</TableHeadCell><TableHeadCell>Shares</TableHeadCell><TableHeadCell>Impressions</TableHeadCell></tr></TableHead>
                    <TableBody>
                      {topPosts.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-slate-300 text-xs max-w-xs truncate">{p.content}</TableCell>
                          <TableCell><Badge variant="info" label={p.platform || '—'} /></TableCell>
                          <TableCell className="font-mono text-red-400">{p.likes?.toLocaleString()}</TableCell>
                          <TableCell className="font-mono text-blue-400">{p.shares?.toLocaleString()}</TableCell>
                          <TableCell className="font-mono text-slate-300">{p.impressions?.toLocaleString()}</TableCell>
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

      {/* Influencers */}
      {activeTab === 3 && (
        <div className="space-y-6">
          <div className="flex gap-3">
            <input value={influencerQuery} onChange={(e) => setInfluencerQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchInfluencers()}
              placeholder="Niche or keyword (e.g. 'marketing', 'fitness')…"
              className="flex-1 bg-brand-800 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
            <Button onClick={searchInfluencers} disabled={loading}>
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Find Influencers
            </Button>
          </div>

          {influencers.length === 0 ? (
            <Card className="text-center py-12">
              <Users className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">Find Influencers</p>
              <p className="text-slate-400 text-sm mt-1">Search by niche to discover relevant influencers.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {influencers.map((inf, i) => (
                <Card key={i}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {inf.username?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-bright font-medium text-sm">{inf.username || inf.name}</p>
                      <p className="text-slate-500 text-xs capitalize">{inf.platform}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-bright font-bold text-sm">{inf.followers?.toLocaleString() || '—'}</div>
                      <div className="text-slate-600 text-xs">Followers</div>
                    </div>
                    <div>
                      <div className="text-bright font-bold text-sm">{inf.engagement_rate != null ? `${inf.engagement_rate}%` : '—'}</div>
                      <div className="text-slate-600 text-xs">Engagement</div>
                    </div>
                    <div>
                      <div className="text-bright font-bold text-sm">{inf.avg_likes?.toLocaleString() || '—'}</div>
                      <div className="text-slate-600 text-xs">Avg Likes</div>
                    </div>
                  </div>
                  {inf.niche && <div className="mt-3"><Badge variant="info" label={inf.niche} /></div>}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
}
