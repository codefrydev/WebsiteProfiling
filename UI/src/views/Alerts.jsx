import { useState, useEffect } from 'react';
import {
  Bell, Plus, X, RefreshCw, Trash2, Play,
  AlertTriangle, TrendingDown, TrendingUp, Link,
  CheckCircle, BellOff,
} from 'lucide-react';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { alertsApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';

const ALERT_TYPES = [
  { value: 'ranking_drop', label: 'Ranking Drop', icon: TrendingDown, color: 'text-red-400' },
  { value: 'ranking_gain', label: 'Ranking Gain', icon: TrendingUp, color: 'text-green-400' },
  { value: 'backlink_lost', label: 'Backlink Lost', icon: Link, color: 'text-orange-400' },
  { value: 'backlink_gained', label: 'Backlink Gained', icon: Link, color: 'text-blue-400' },
  { value: 'traffic_drop', label: 'Traffic Drop', icon: TrendingDown, color: 'text-red-400' },
  { value: 'site_down', label: 'Site Down', icon: AlertTriangle, color: 'text-red-500' },
  { value: 'core_update', label: 'Core Update', icon: Bell, color: 'text-yellow-400' },
];

export default function Alerts() {
  const { isConnected, currentProject } = useApi();
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [newAlert, setNewAlert] = useState({ type: 'ranking_drop', threshold: '', email: '', slack_webhook: '' });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState({});

  useEffect(() => {
    if (isConnected && currentProject?.id) {
      loadAlerts();
      loadHistory();
    }
  }, [isConnected, currentProject?.id]);

  async function loadAlerts() {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const r = await alertsApi.getAlerts(currentProject.id);
      setAlerts(r?.alerts || r || []);
    } catch { setAlerts([]); } finally { setLoading(false); }
  }

  async function loadHistory() {
    if (!currentProject?.id) return;
    try {
      const r = await alertsApi.getHistory(currentProject.id);
      setHistory(r?.history || r || []);
    } catch { setHistory([]); }
  }

  async function createAlert() {
    if (!currentProject?.id) return;
    try {
      const label = ALERT_TYPES.find((t) => t.value === newAlert.type)?.label || newAlert.type;
      await alertsApi.createAlert({
        project_id: currentProject.id,
        name: label,
        type: newAlert.type,
        config: { threshold: newAlert.threshold },
        channels: { email: newAlert.email, slack_webhook: newAlert.slack_webhook },
        is_active: true,
      });
      setShowCreate(false);
      setNewAlert({ type: 'ranking_drop', threshold: '', email: '', slack_webhook: '' });
      loadAlerts();
    } catch (e) { alert(e.message); }
  }

  async function toggleAlert(a) {
    try {
      await alertsApi.updateAlert(a.id, { is_active: !a.is_active });
      setAlerts((prev) => prev.map((al) => al.id === a.id ? { ...al, is_active: !al.is_active } : al));
    } catch (e) { alert(e.message); }
  }

  async function deleteAlert(id) {
    if (!confirm('Delete this alert?')) return;
    try {
      await alertsApi.deleteAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (e) { alert(e.message); }
  }

  async function testAlert(id) {
    setTesting((prev) => ({ ...prev, [id]: true }));
    try {
      await alertsApi.testAlert(id);
      alert('Test alert sent!');
    } catch (e) { alert(e.message); } finally {
      setTesting((prev) => ({ ...prev, [id]: false }));
    }
  }

  const activeCount = alerts.filter((a) => a.is_active !== false).length;
  const weeklyTriggers = history.filter((h) => {
    const d = new Date(h.triggered_at);
    return (Date.now() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
  }).length;

  if (!isConnected) return (
    <PageLayout>
      <PageHeader title="Alerts" subtitle="Get notified when important SEO changes occur." />
      <ApiConnectPrompt feature="Alerts" />
    </PageLayout>
  );

  if (!currentProject?.id) return (
    <PageLayout>
      <PageHeader title="Alerts" subtitle="Get notified when important SEO changes occur." />
      <Card className="text-center py-12 text-slate-400">Select a project to manage alerts.</Card>
    </PageLayout>
  );

  return (
    <PageLayout>
      <PageHeader title="Alerts" subtitle="Monitor rankings, traffic, and backlinks with automated alerts." />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><Bell className="h-3.5 w-3.5" />Active Alerts</div>
          <div className="text-2xl font-bold text-blue-400">{activeCount}</div>
        </Card>
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />Triggered (7d)</div>
          <div className="text-2xl font-bold text-yellow-400">{weeklyTriggers}</div>
        </Card>
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Total Configured</div>
          <div className="text-2xl font-bold text-bright">{alerts.length}</div>
        </Card>
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><BellOff className="h-3.5 w-3.5" />Paused</div>
          <div className="text-2xl font-bold text-slate-400">{alerts.length - activeCount}</div>
        </Card>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-bright font-bold">Configured Alerts</h3>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New Alert</Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>
      ) : alerts.length === 0 ? (
        <Card className="text-center py-12">
          <Bell className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-bright font-medium">No Alerts Configured</p>
          <p className="text-slate-400 text-sm mt-1">Create alerts to get notified about important SEO changes.</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create Alert</Button>
        </Card>
      ) : (
        <Card padding="none" overflowHidden className="mb-6">
          <Table>
            <TableHead sticky>
              <tr>
                <TableHeadCell>Type</TableHeadCell>
                <TableHeadCell>Threshold</TableHeadCell>
                <TableHeadCell>Channels</TableHeadCell>
                <TableHeadCell>Last Triggered</TableHeadCell>
                <TableHeadCell>Status</TableHeadCell>
                <TableHeadCell></TableHeadCell>
              </tr>
            </TableHead>
            <TableBody>
              {alerts.map((a, i) => {
                const type = ALERT_TYPES.find((t) => t.value === a.type);
                const Icon = type?.icon || Bell;
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${type?.color || 'text-slate-400'}`} />
                        <span className="text-bright font-medium text-sm">{type?.label || a.type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-300 text-xs">{a.threshold ? `${a.threshold} positions / %` : '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {a.email && <Badge variant="info" label="Email" />}
                        {a.slack_webhook && <Badge variant="success" label="Slack" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-500 text-xs">{a.last_triggered_at || 'Never'}</TableCell>
                    <TableCell>
                      <button onClick={() => toggleAlert(a)} className="flex items-center gap-1.5 text-xs font-medium transition-colors">
                        <div className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${a.is_active !== false ? 'bg-green-500' : 'bg-slate-600'}`}>
                          <div className={`w-3 h-3 rounded-full bg-white transition-transform ${a.is_active !== false ? 'translate-x-4' : ''}`} />
                        </div>
                        <span className={a.is_active !== false ? 'text-green-400' : 'text-slate-500'}>{a.is_active !== false ? 'Active' : 'Paused'}</span>
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button onClick={() => testAlert(a.id)} className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors" title="Test alert">
                          {testing[a.id] ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => deleteAlert(a.id)} className="p-1.5 text-slate-400 hover:text-red-400 transition-colors" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Alert History */}
      {history.length > 0 && (
        <div>
          <h3 className="text-bright font-bold mb-4">Alert History</h3>
          <Card padding="none" overflowHidden>
            <Table>
              <TableHead>
                <tr>
                  <TableHeadCell>Alert Type</TableHeadCell>
                  <TableHeadCell>Message</TableHeadCell>
                  <TableHeadCell>Triggered At</TableHeadCell>
                  <TableHeadCell>Severity</TableHeadCell>
                </tr>
              </TableHead>
              <TableBody>
                {history.slice(0, 20).map((h, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-bright font-medium text-sm">{h.alert_type || h.type}</TableCell>
                    <TableCell className="text-slate-400 text-xs max-w-sm truncate">{h.message}</TableCell>
                    <TableCell className="text-slate-500 text-xs">{h.triggered_at}</TableCell>
                    <TableCell><Badge variant={h.severity === 'critical' ? 'critical' : h.severity === 'high' ? 'high' : 'medium'} label={h.severity || 'info'} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Create Alert Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-bright font-bold">Create Alert</h3>
              <button onClick={() => setShowCreate(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 block">Alert Type</label>
                <select value={newAlert.type} onChange={(e) => setNewAlert((prev) => ({ ...prev, type: e.target.value }))}
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none">
                  {ALERT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 block">Threshold</label>
                <input value={newAlert.threshold} onChange={(e) => setNewAlert((prev) => ({ ...prev, threshold: e.target.value }))}
                  placeholder="e.g. 5 (positions drop), 20 (% traffic drop)"
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 block">Email</label>
                <input value={newAlert.email} onChange={(e) => setNewAlert((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="alerts@example.com"
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 block">Slack Webhook (optional)</label>
                <input value={newAlert.slack_webhook} onChange={(e) => setNewAlert((prev) => ({ ...prev, slack_webhook: e.target.value }))}
                  placeholder="https://hooks.slack.com/…"
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button className="flex-1" onClick={createAlert}>Create Alert</Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
