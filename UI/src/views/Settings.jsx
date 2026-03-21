import { useState, useEffect } from 'react';
import { Key, Plug, ScrollText, Download, Save, TestTube2, CheckCircle, XCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { PageLayout, PageHeader, Card, Button, Badge, Table, TableHead, TableBody, TableRow, TableCell } from '../components';
import { useApi } from '../context/ApiContext';
import { settingsApi } from '../lib/api';

const TABS = [
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'audit-log', label: 'Audit Log', icon: ScrollText },
  { id: 'export', label: 'Export / Import', icon: Download },
];

const API_KEY_FIELDS = [
  { key: 'dataforseo_login', label: 'DataForSEO Login', type: 'text', group: 'SERP Data', hint: 'https://dataforseo.com' },
  { key: 'dataforseo_password', label: 'DataForSEO Password', type: 'password', group: 'SERP Data' },
  { key: 'serp_api_key', label: 'SerpApi Key', type: 'password', group: 'SERP Data', hint: 'https://serpapi.com' },
  { key: 'openai_api_key', label: 'OpenAI API Key', type: 'password', group: 'AI / LLM', hint: 'https://platform.openai.com' },
  { key: 'anthropic_api_key', label: 'Anthropic API Key', type: 'password', group: 'AI / LLM', hint: 'https://console.anthropic.com' },
  { key: 'google_gemini_api_key', label: 'Google Gemini Key', type: 'password', group: 'AI / LLM' },
  { key: 'google_client_id', label: 'Google Client ID', type: 'text', group: 'Google OAuth2', hint: 'For GSC, GA4, GBP access' },
  { key: 'google_client_secret', label: 'Google Client Secret', type: 'password', group: 'Google OAuth2' },
  { key: 'slack_webhook_url', label: 'Slack Webhook URL', type: 'text', group: 'Notifications' },
  { key: 'smtp_host', label: 'SMTP Host', type: 'text', group: 'Email', placeholder: 'smtp.gmail.com' },
  { key: 'smtp_port', label: 'SMTP Port', type: 'text', group: 'Email', placeholder: '587' },
  { key: 'smtp_user', label: 'SMTP User', type: 'text', group: 'Email' },
  { key: 'smtp_password', label: 'SMTP Password', type: 'password', group: 'Email' },
  { key: 'alert_email', label: 'Alert Email', type: 'text', group: 'Email', hint: 'Email for alert notifications' },
];

const INTEGRATIONS = [
  { id: 'gsc', name: 'Google Search Console', icon: '🔍', description: 'Import GSC data for queries, pages, and performance metrics', setupHint: 'Set Google OAuth2 credentials above, then connect in GSC Insights' },
  { id: 'ga4', name: 'Google Analytics 4', icon: '📊', description: 'Import GA4 traffic data and audience insights', setupHint: 'Requires Google OAuth2 credentials' },
  { id: 'gbp', name: 'Google Business Profile', icon: '📍', description: 'Manage GBP listings, reviews, and local rankings', setupHint: 'Requires Google OAuth2 credentials' },
  { id: 'sheets', name: 'Google Sheets', icon: '📋', description: 'Export reports directly to Google Sheets', setupHint: 'Requires Google OAuth2 credentials' },
  { id: 'slack', name: 'Slack', icon: '💬', description: 'Send alert notifications and reports to Slack channels', setupHint: 'Set Slack Webhook URL above' },
  { id: 'dataforseo', name: 'DataForSEO', icon: '🔑', description: 'Keyword volumes, SERP data, backlinks, domain metrics', setupHint: 'Set DataForSEO credentials above' },
  { id: 'openai', name: 'OpenAI', icon: '🤖', description: 'AI content generation, SEO assistant, ad copy', setupHint: 'Set OpenAI API key above' },
  { id: 'anthropic', name: 'Anthropic Claude', icon: '🧠', description: 'AI assistant, content briefs, brand monitoring', setupHint: 'Set Anthropic API key above' },
];

function TestButton({ settingKey, value }) {
  const [state, setState] = useState('idle'); // idle | testing | ok | fail

  const test = async () => {
    if (!value) return;
    setState('testing');
    try {
      await settingsApi.setKey(`test_${settingKey}`, value);
      setState('ok');
    } catch {
      setState('fail');
    }
    setTimeout(() => setState('idle'), 3000);
  };

  return (
    <button
      onClick={test}
      disabled={!value || state === 'testing'}
      className="px-2 py-1 text-xs rounded border border-muted text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all disabled:opacity-40"
    >
      {state === 'testing' && <Loader2 className="h-3 w-3 animate-spin inline mr-1" />}
      {state === 'ok' && <CheckCircle className="h-3 w-3 inline mr-1 text-green-400" />}
      {state === 'fail' && <XCircle className="h-3 w-3 inline mr-1 text-red-400" />}
      Test
    </button>
  );
}

function PasswordField({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder || '••••••••••••'}
        className="w-full bg-brand-900 border border-default focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none transition-all pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function Settings() {
  const { isConnected } = useApi();
  const [activeTab, setActiveTab] = useState('api-keys');
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    if (isConnected) {
      loadSettings();
    }
  }, [isConnected]);

  useEffect(() => {
    if (activeTab === 'audit-log' && isConnected) {
      loadAuditLog();
    }
  }, [activeTab]);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await settingsApi.get();
      setSettings(data || {});
    } catch (e) {
      console.warn('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadAuditLog() {
    setAuditLoading(true);
    try {
      const data = await settingsApi.getAuditLog({ limit: 100 });
      setAuditLog(Array.isArray(data) ? data : data?.items || []);
    } catch (e) {
      console.warn('Failed to load audit log:', e);
    } finally {
      setAuditLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await settingsApi.bulkSet(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.warn('Failed to save settings:', e);
    } finally {
      setSaving(false);
    }
  }

  async function exportData(format) {
    try {
      await settingsApi.exportDownload(format);
    } catch (e) {
      alert('Export failed: ' + (e?.message || String(e)));
    }
  }

  const groups = [...new Set(API_KEY_FIELDS.map((f) => f.group))];

  if (!isConnected) {
    return (
      <PageLayout>
        <PageHeader title="Settings" subtitle="API keys, integrations, and configuration" />
        <Card shadow className="p-8 text-center">
          <Key className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Backend not connected</p>
          <p className="text-slate-500 text-sm mt-1">Settings are stored in the backend database. Start the backend first:</p>
          <code className="mt-3 inline-block bg-brand-900 px-4 py-2 rounded text-sm font-mono text-green-400">
            uvicorn backend.app.main:app --reload
          </code>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout className="space-y-6">
      <PageHeader title="Settings" subtitle="API keys, integrations, and configuration" />

      {/* Tabs */}
      <div className="flex gap-1 bg-brand-800 p-1 rounded-xl border border-muted">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* API Keys Tab */}
      {activeTab === 'api-keys' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Configure API credentials for external data sources and AI services. All keys are encrypted in the database.</p>
            <Button variant="primary" onClick={saveSettings} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : saved ? <CheckCircle className="h-4 w-4 mr-1 text-green-400" /> : <Save className="h-4 w-4 mr-1" />}
              {saved ? 'Saved!' : 'Save All'}
            </Button>
          </div>
          {groups.map((group) => (
            <Card key={group} shadow className="p-6">
              <h3 className="text-sm font-bold text-bright mb-4 pb-3 border-b border-muted">{group}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {API_KEY_FIELDS.filter((f) => f.group === group).map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      {field.label}
                      {field.hint && <span className="ml-2 text-slate-600 font-normal">({field.hint})</span>}
                    </label>
                    <div className="flex gap-2">
                      {field.type === 'password' ? (
                        <div className="flex-1">
                          <PasswordField
                            value={settings[field.key]}
                            onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
                            placeholder={field.placeholder}
                          />
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={settings[field.key] || ''}
                          onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
                          placeholder={field.placeholder || ''}
                          className="flex-1 bg-brand-900 border border-default focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none transition-all"
                        />
                      )}
                      <TestButton settingKey={field.key} value={settings[field.key]} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Integrations Tab */}
      {activeTab === 'integrations' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {INTEGRATIONS.map((integration) => {
            const isConfigured = integration.id === 'dataforseo'
              ? !!(settings.dataforseo_login && settings.dataforseo_password)
              : integration.id === 'openai'
              ? !!settings.openai_api_key
              : integration.id === 'anthropic'
              ? !!settings.anthropic_api_key
              : integration.id === 'slack'
              ? !!settings.slack_webhook_url
              : ['gsc', 'ga4', 'gbp', 'sheets'].includes(integration.id)
              ? !!(settings.google_client_id && settings.google_client_secret)
              : false;

            return (
              <Card key={integration.id} shadow className="p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{integration.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-bright">{integration.name}</h3>
                      <Badge
                        variant={isConfigured ? 'ok' : 'info'}
                        label={isConfigured ? 'Configured' : 'Not set'}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mb-2">{integration.description}</p>
                    {!isConfigured && (
                      <p className="text-xs text-blue-400/70 flex items-center gap-1">
                        <TestTube2 className="h-3 w-3" />
                        {integration.setupHint}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit-log' && (
        <Card shadow>
          <div className="p-4 border-b border-muted flex items-center justify-between">
            <h3 className="text-sm font-bold text-bright">Recent Actions</h3>
            <Button variant="ghost" onClick={loadAuditLog} className="text-xs">
              {auditLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refresh'}
            </Button>
          </div>
          {auditLoading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading audit log...</div>
          ) : auditLog.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No audit log entries yet.</div>
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <TableCell header>Time</TableCell>
                  <TableCell header>Action</TableCell>
                  <TableCell header>Resource</TableCell>
                  <TableCell header>Details</TableCell>
                </tr>
              </TableHead>
              <TableBody>
                {auditLog.map((entry, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="info" label={entry.action} />
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {entry.resource_type} {entry.resource_id ? `#${entry.resource_id}` : ''}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-xs truncate">
                      {typeof entry.details === 'object' ? JSON.stringify(entry.details) : entry.details}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div className="space-y-4">
          <Card shadow className="p-6">
            <h3 className="text-sm font-bold text-bright mb-1">Export settings</h3>
            <p className="text-xs text-slate-500 mb-4">
              Download the key/value settings stored in the backend (API keys and other saved preferences) as a file in your browser. This is not a full PostgreSQL dump.
            </p>
            <div className="flex gap-3">
              <Button variant="primary" onClick={() => exportData('json')}>
                <Download className="h-4 w-4 mr-1" />
                Export as JSON
              </Button>
              <Button variant="ghost" onClick={() => exportData('csv')}>
                <Download className="h-4 w-4 mr-1" />
                Export as CSV
              </Button>
            </div>
          </Card>
          <Card shadow className="p-6">
            <h3 className="text-sm font-bold text-bright mb-1">Import Data</h3>
            <p className="text-xs text-slate-500 mb-4">Import previously exported data. This will merge with existing data.</p>
            <div className="border-2 border-dashed border-muted rounded-xl p-8 text-center">
              <Download className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Drag & drop a JSON export file here, or click to browse</p>
              <Button variant="ghost" className="mt-3 text-xs">Browse File</Button>
            </div>
          </Card>
          <Card shadow className="p-6">
            <h3 className="text-sm font-bold text-bright mb-1">Google Sheets Export</h3>
            <p className="text-xs text-slate-500 mb-4">Export data directly to Google Sheets. Requires Google OAuth2 credentials in API Keys tab.</p>
            <div className="flex gap-3 items-center">
              <input
                type="text"
                placeholder="Google Spreadsheet ID"
                className="flex-1 bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none"
              />
              <Button variant="ghost" disabled={!settings.google_client_id}>
                Export to Sheets
              </Button>
            </div>
            {!settings.google_client_id && (
              <p className="text-xs text-yellow-500/70 mt-2">⚠ Set Google OAuth2 credentials in API Keys first</p>
            )}
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
