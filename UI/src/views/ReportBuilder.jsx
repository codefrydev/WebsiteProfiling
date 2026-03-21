import { useState, useEffect } from 'react';
import {
  FileBarChart, Plus, X, RefreshCw, Download, Calendar,
  Clock, FileText, Layers, Check,
} from 'lucide-react';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { reportingApi } from '../lib/api';
import { useApi } from '../context/ApiContext';
import ApiConnectPrompt from '../components/ApiConnectPrompt';

const TABS = ['Templates', 'Generated', 'Scheduled'];

const BUILTIN_TEMPLATES = [
  { id: 'monthly-seo', name: 'Monthly SEO Report', description: 'Rankings, traffic, backlinks, and key wins.', icon: '📊' },
  { id: 'technical-audit', name: 'Technical Audit', description: 'Crawl errors, Core Web Vitals, indexing issues.', icon: '🔧' },
  { id: 'keyword-report', name: 'Keyword Rankings', description: 'Position tracking and visibility trends.', icon: '🔑' },
  { id: 'backlink-report', name: 'Backlink Report', description: 'New, lost, and disavowed backlinks.', icon: '🔗' },
  { id: 'gsc-report', name: 'GSC Performance', description: 'Clicks, impressions, CTR, and positions.', icon: '📈' },
  { id: 'content-report', name: 'Content Performance', description: 'Top pages, decay detection, opportunities.', icon: '📝' },
];

export default function ReportBuilder() {
  const { isConnected, currentProject } = useApi();
  const [activeTab, setActiveTab] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [reports, setReports] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [reportName, setReportName] = useState('');
  const [scheduleFreq, setScheduleFreq] = useState('monthly');
  const [scheduleEmail, setScheduleEmail] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isConnected) {
      loadTemplates();
      loadReports();
      loadScheduled();
    }
  }, [isConnected]);

  async function loadTemplates() {
    try {
      let r = await reportingApi.getTemplates();
      let list = Array.isArray(r) ? r : r?.templates || [];
      if (list.length === 0) {
        await reportingApi.createTemplate({ name: 'Default SEO Report', description: 'Generated automatically' });
        r = await reportingApi.getTemplates();
        list = Array.isArray(r) ? r : r?.templates || [];
      }
      setTemplates(list);
    } catch { setTemplates([]); }
  }

  async function loadReports() {
    setLoading(true);
    try {
      const r = await reportingApi.getReports();
      setReports(r?.reports || r || []);
    } catch { setReports([]); } finally { setLoading(false); }
  }

  async function loadScheduled() {
    try {
      const r = await reportingApi.getScheduled();
      setScheduled(r?.schedules || r || []);
    } catch { setScheduled([]); }
  }

  async function generateReport() {
    if (!selectedTemplate) return;
    const tid = parseInt(String(selectedTemplate), 10);
    if (Number.isNaN(tid)) {
      alert('Choose a saved template (numeric id). Create one from the API or use the default template card after load.');
      return;
    }
    setGenerating(true);
    try {
      await reportingApi.generateReport({
        template_id: tid,
        title: reportName || 'Report',
        project_id: currentProject?.id,
      });
      setShowGenerate(false);
      setSelectedTemplate('');
      setReportName('');
      await loadReports();
      setActiveTab(1);
    } catch (e) { alert(e.message); } finally { setGenerating(false); }
  }

  async function createSchedule() {
    const tid = parseInt(String(selectedTemplate), 10);
    if (Number.isNaN(tid)) {
      alert('Select a saved template.');
      return;
    }
    try {
      await reportingApi.createScheduled({
        template_id: tid,
        frequency: scheduleFreq,
        project_id: currentProject?.id,
      });
      setShowSchedule(false);
      loadScheduled();
    } catch (e) { alert(e.message); }
  }

  const allTemplates = [
    ...BUILTIN_TEMPLATES,
    ...templates.map((t) => ({ ...t, custom: true, icon: t.icon || '📄' })),
  ];

  if (!isConnected) return (
    <PageLayout>
      <PageHeader title="Report Builder" subtitle="Generate and schedule SEO reports." />
      <ApiConnectPrompt feature="Report Builder" />
    </PageLayout>
  );

  return (
    <PageLayout>
      <PageHeader title="Report Builder" subtitle="Generate professional SEO reports from templates." />

      <div className="flex gap-1 border-b border-default mb-6">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === i ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Templates */}
      {activeTab === 0 && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowGenerate(true)}>
              <Plus className="h-4 w-4" /> Generate Report
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allTemplates.map((t) => (
              <Card key={t.id} className="cursor-pointer hover:border-blue-500/30 transition-colors" onClick={() => { setSelectedTemplate(t.id); setShowGenerate(true); }}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{t.icon || '📄'}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-bright font-medium text-sm">{t.name}</p>
                      {t.custom && <Badge variant="info" label="Custom" />}
                    </div>
                    <p className="text-slate-500 text-xs mt-1">{t.description}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="secondary" onClick={(e) => { e.stopPropagation(); setSelectedTemplate(t.id); setShowGenerate(true); }}>
                    <FileBarChart className="h-3.5 w-3.5" /> Generate
                  </Button>
                  <Button variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedTemplate(t.id); setShowSchedule(true); }}>
                    <Clock className="h-3.5 w-3.5" /> Schedule
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Generated Reports */}
      {activeTab === 1 && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : reports.length === 0 ? (
            <Card className="text-center py-12">
              <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">No Reports Generated Yet</p>
              <p className="text-slate-400 text-sm mt-1">Generate your first report from the Templates tab.</p>
              <Button className="mt-4" onClick={() => setActiveTab(0)}><FileBarChart className="h-4 w-4" /> Browse Templates</Button>
            </Card>
          ) : (
            <Card padding="none" overflowHidden>
              <Table>
                <TableHead sticky>
                  <tr>
                    <TableHeadCell>Report Name</TableHeadCell>
                    <TableHeadCell>Template</TableHeadCell>
                    <TableHeadCell>Generated</TableHeadCell>
                    <TableHeadCell>Status</TableHeadCell>
                    <TableHeadCell></TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {reports.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-bright font-medium">{r.name || r.title}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{r.template}</TableCell>
                      <TableCell className="text-slate-500 text-xs">{r.created_at || r.generated_at}</TableCell>
                      <TableCell><Badge variant={r.status === 'ready' ? 'success' : 'info'} label={r.status || 'ready'} /></TableCell>
                      <TableCell>
                        {r.download_url && (
                          <a href={r.download_url} download className="text-blue-400 hover:text-blue-300">
                            <Download className="h-4 w-4" />
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

      {/* Scheduled */}
      {activeTab === 2 && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowSchedule(true)}><Calendar className="h-4 w-4" /> Add Schedule</Button>
          </div>
          {scheduled.length === 0 ? (
            <Card className="text-center py-12">
              <Calendar className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-bright font-medium">No Scheduled Reports</p>
              <p className="text-slate-400 text-sm mt-1">Automate reports to be sent on a regular schedule.</p>
            </Card>
          ) : (
            <Card padding="none" overflowHidden>
              <Table>
                <TableHead sticky>
                  <tr>
                    <TableHeadCell>Template</TableHeadCell>
                    <TableHeadCell>Frequency</TableHeadCell>
                    <TableHeadCell>Recipients</TableHeadCell>
                    <TableHeadCell>Next Send</TableHeadCell>
                    <TableHeadCell>Status</TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {scheduled.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-bright font-medium">{s.template}</TableCell>
                      <TableCell><Badge variant="info" label={s.frequency} /></TableCell>
                      <TableCell className="text-slate-400 text-xs">{s.email || s.recipients?.join(', ')}</TableCell>
                      <TableCell className="text-slate-500 text-xs">{s.next_send_at}</TableCell>
                      <TableCell><Badge variant={s.active ? 'success' : 'low'} label={s.active ? 'Active' : 'Paused'} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-bright font-bold">Generate Report</h3>
              <button onClick={() => setShowGenerate(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 block">Template</label>
                <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none">
                  <option value="">Select template…</option>
                  {allTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 block">Report Name (optional)</label>
                <input value={reportName} onChange={(e) => setReportName(e.target.value)}
                  placeholder="e.g. January 2026 SEO Report"
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button className="flex-1" onClick={generateReport} disabled={!selectedTemplate || generating}>
                {generating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
                {generating ? 'Generating…' : 'Generate Report'}
              </Button>
              <Button variant="secondary" onClick={() => setShowGenerate(false)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Schedule Modal */}
      {showSchedule && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-bright font-bold">Schedule Report</h3>
              <button onClick={() => setShowSchedule(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 block">Template</label>
                <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none">
                  <option value="">Select template…</option>
                  {allTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 block">Frequency</label>
                <select value={scheduleFreq} onChange={(e) => setScheduleFreq(e.target.value)}
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 block">Email Recipients</label>
                <input value={scheduleEmail} onChange={(e) => setScheduleEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button className="flex-1" onClick={createSchedule} disabled={!selectedTemplate}>
                <Calendar className="h-4 w-4" /> Schedule
              </Button>
              <Button variant="secondary" onClick={() => setShowSchedule(false)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
