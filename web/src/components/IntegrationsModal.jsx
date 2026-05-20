'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { apiUrl } from '@/lib/publicBase';
import { dispatchPipelineJobStarted, pollPipelineJob } from '@/lib/pipelineJobEvents';
import { useReport } from '@/context/useReport';

const GCP_GUIDE_URL =
  'https://developers.google.com/workspace/guides/get-started';

function StatusPill({ connected }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <AlertCircle className="h-3.5 w-3.5" />
      Not connected
    </span>
  );
}

function InputField({ label, id, type = 'text', value, onChange, placeholder, helper, disabled }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground mb-1">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground font-mono disabled:opacity-50"
      />
      {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

/**
 * Integrations modal for Google Search Console + GA4.
 * Two-phase wizard:
 *   Phase 1: Paste GCP Client ID + Client Secret (one-time)
 *   Phase 2: Connect with Google button + property pickers
 */
export default function IntegrationsModal({ open, onClose, initialToast }) {
  const { loadReport } = useReport();
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Phase 1 fields
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsSaved, setCredsSaved] = useState(false);

  // Phase 2 fields
  const [gscSiteUrl, setGscSiteUrl] = useState('');
  const [ga4PropertyId, setGa4PropertyId] = useState('');
  const [dateRangeDays, setDateRangeDays] = useState('28');
  const [savingProps, setSavingProps] = useState(false);

  // Properties dropdowns
  const [properties, setProperties] = useState(null);
  const [loadingProps, setLoadingProps] = useState(false);

  // Test / Fetch
  const [testLog, setTestLog] = useState('');
  const [testing, setTesting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchLog, setFetchLog] = useState('');
  const [fetchJobStatus, setFetchJobStatus] = useState('');
  const fetchPollStopRef = useRef(null);

  // Advanced accordion (paste refresh token)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [refreshToken, setRefreshToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  // Toast from OAuth callback
  const [toast, setToast] = useState(initialToast || null);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch(apiUrl('/integrations/google/status'));
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.gscSiteUrl) setGscSiteUrl(data.gscSiteUrl);
        if (data.ga4PropertyId) setGa4PropertyId(data.ga4PropertyId);
        if (data.dateRangeDays) setDateRangeDays(String(data.dateRangeDays));
      }
    } catch {
      // ignore
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchStatus();
    }
  }, [open, fetchStatus]);

  useEffect(() => {
    if (initialToast) setToast(initialToast);
  }, [initialToast]);

  // Auto-dismiss toast after 6s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadProperties = async () => {
    setLoadingProps(true);
    try {
      const res = await fetch(apiUrl('/integrations/google/properties'));
      if (res.ok) {
        const data = await res.json();
        setProperties(data);
        if (data.ga4ListError) {
          setToast({ type: 'error', message: data.ga4ListError });
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingProps(false);
    }
  };

  const handleSaveClientCreds = async () => {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSavingCreds(true);
    try {
      const res = await fetch(apiUrl('/integrations/google/credentials'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ type: 'error', message: data.error || 'Save failed' });
      } else {
        setStatus(data.status);
        setCredsSaved(true);
        setClientSecret(''); // clear secret from UI after save
        setToast({ type: 'success', message: 'Client credentials saved.' });
      }
    } catch (e) {
      setToast({ type: 'error', message: e.message });
    } finally {
      setSavingCreds(false);
    }
  };

  const handleSaveProperties = async () => {
    if (ga4PropertyId && !/^\d+$/.test(ga4PropertyId.trim())) {
      setToast({
        type: 'error',
        message:
          'Analytics property ID must be a numeric ID (e.g. 123456789). The G-XXXXXXX code is a Measurement ID -- find the numeric ID in GA4 Admin > Property Settings.',
      });
      return;
    }
    setSavingProps(true);
    try {
      const res = await fetch(apiUrl('/integrations/google/credentials'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gscSiteUrl: gscSiteUrl.trim() || null,
          ga4PropertyId: ga4PropertyId.trim() || null,
          dateRangeDays: Number(dateRangeDays) || 28,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ type: 'error', message: data.error || 'Save failed' });
      } else {
        setStatus(data.status);
        setToast({ type: 'success', message: 'Settings saved.' });
      }
    } catch (e) {
      setToast({ type: 'error', message: e.message });
    } finally {
      setSavingProps(false);
    }
  };

  const handleSaveRefreshToken = async () => {
    if (!refreshToken.trim()) return;
    setSavingToken(true);
    try {
      const res = await fetch(apiUrl('/integrations/google/credentials'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ type: 'error', message: data.error || 'Save failed' });
      } else {
        setStatus(data.status);
        setRefreshToken('');
        setToast({ type: 'success', message: 'Connection token saved.' });
      }
    } catch (e) {
      setToast({ type: 'error', message: e.message });
    } finally {
      setSavingToken(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await fetch(apiUrl('/integrations/google/credentials/upload'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileContent: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ type: 'error', message: data.error || 'Upload failed' });
      } else {
        setStatus(data.status);
        setToast({ type: 'success', message: 'Service account key uploaded.' });
      }
    } catch (e) {
      setToast({ type: 'error', message: e.message });
    }
    e.target.value = '';
  };

  const handleTest = async () => {
    setTesting(true);
    setTestLog('');
    try {
      const res = await fetch(apiUrl('/integrations/google/test'), { method: 'POST' });
      const data = await res.json();
      const log = data.log || (data.ok ? 'Test passed.' : 'Test failed.');
      setTestLog(log);
      const hasIssues = log.includes('Google test completed with issues:');
      if (!data.ok) {
        setToast({
          type: 'error',
          message: hasIssues
            ? 'Connection test found configuration issues — see log below.'
            : 'Connection test failed — see log below.',
        });
      } else {
        setToast({ type: 'success', message: 'Connection test passed — GSC and GA4 are reachable.' });
      }
    } catch (e) {
      setTestLog(e.message);
      setToast({ type: 'error', message: e.message });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    return () => {
      fetchPollStopRef.current?.();
      fetchPollStopRef.current = null;
    };
  }, []);

  const handleFetch = async () => {
    setFetching(true);
    setFetchLog('Starting Google data fetch…');
    setFetchJobStatus('running');
    fetchPollStopRef.current?.();
    fetchPollStopRef.current = null;
    try {
      const res = await fetch(apiUrl('/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'google' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFetchLog(`Error: ${data.error}`);
        setFetchJobStatus('error');
        setToast({ type: 'error', message: data.error || 'Fetch failed' });
      } else {
        const jobId = data.jobId;
        setFetchLog(`Job ${jobId}\nStatus: running\n\nWaiting for output…`);
        setToast({
          type: 'success',
          message: 'Google fetch started — live log below and in Pipeline Runner (bottom-right).',
        });
        dispatchPipelineJobStarted(jobId, { command: 'google', openRunner: true });
        fetchPollStopRef.current = pollPipelineJob(jobId, (job) => {
          const header = `Job ${jobId}\nStatus: ${job.status}\n`;
          setFetchJobStatus(job.status);
          setFetchLog(job.log ? `${header}\n${job.log}` : `${header}\nWaiting for output…`);
          if (job.status === 'success') {
            setToast({ type: 'success', message: 'Google data fetch completed.' });
            fetchStatus();
            loadReport();
          } else if (job.status === 'error') {
            setToast({ type: 'error', message: 'Google data fetch failed — see log below.' });
          }
        });
      }
    } catch (e) {
      setFetchLog(e.message);
      setFetchJobStatus('error');
      setToast({ type: 'error', message: e.message });
    } finally {
      setFetching(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch(apiUrl('/integrations/google/disconnect'), { method: 'POST' });
      await fetchStatus();
      setToast({ type: 'success', message: 'Disconnected.' });
    } catch (e) {
      setToast({ type: 'error', message: e.message });
    }
  };

  if (!open) return null;

  const hasClientId = status?.hasClientId;
  const connected = status?.connected;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="presentation"
    >
      <div className="w-full max-w-lg bg-brand-800 border border-default rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-muted shrink-0">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-link" />
            <h2 className="font-semibold text-foreground">Google Integrations</h2>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill connected={connected} />
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-brand-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`mx-6 mt-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loadingStatus ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <>
              {/* ── Phase 1: GCP client credentials ── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-foreground">
                    Step 1: Google Cloud credentials <span className="text-muted-foreground font-normal">(one time)</span>
                  </h3>
                  {hasClientId && (
                    <span className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  You need a{' '}
                  <a
                    href={GCP_GUIDE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link underline inline-flex items-center gap-0.5"
                  >
                    Google Cloud project <ExternalLink className="h-3 w-3" />
                  </a>{' '}
                  with Search Console API and Analytics Data API enabled. Ask your developer or follow the guide.
                </p>
                <div className="space-y-3">
                  <InputField
                    id="clientId"
                    label="Client ID"
                    value={clientId}
                    onChange={setClientId}
                    placeholder={hasClientId ? '••••••••••••.apps.googleusercontent.com' : 'xxxxxxxx.apps.googleusercontent.com'}
                    disabled={savingCreds}
                  />
                  <InputField
                    id="clientSecret"
                    type="password"
                    label="Client Secret"
                    value={clientSecret}
                    onChange={setClientSecret}
                    placeholder={hasClientId ? '(saved -- enter to replace)' : 'GOCSPX-...'}
                    disabled={savingCreds}
                  />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={savingCreds || (!clientId.trim() && !clientSecret.trim())}
                    onClick={handleSaveClientCreds}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    {savingCreds && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Save
                  </button>
                  <span className="text-xs text-muted-foreground">OR</span>
                  <label className="px-4 py-2 rounded-lg border border-default hover:bg-brand-700 text-sm text-foreground cursor-pointer flex items-center gap-2 transition-colors">
                    Upload JSON key file
                    <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              </section>

              {/* ── Phase 2: Connect + properties ── */}
              <section>
                <h3 className="font-semibold text-sm text-foreground mb-3">
                  Step 2: Connect your Google account
                </h3>
                {connected ? (
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-400" />
                    <span className="text-sm text-green-700 dark:text-green-400">Connected</span>
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="ml-auto text-xs text-red-700 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <a
                    href="/api/integrations/google/auth"
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      hasClientId
                        ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                        : 'bg-brand-700 text-muted-foreground cursor-not-allowed pointer-events-none opacity-50'
                    }`}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Connect with Google
                  </a>
                )}
                {!hasClientId && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Complete Step 1 first to enable this button.
                  </p>
                )}
              </section>

              {/* Properties + date range (shown when connected) */}
              {connected && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm text-foreground">Properties</h3>
                    <button
                      type="button"
                      onClick={loadProperties}
                      disabled={loadingProps}
                      className="text-xs text-link hover:underline flex items-center gap-1"
                    >
                      {loadingProps && <Loader2 className="h-3 w-3 animate-spin" />}
                      Load from account
                    </button>
                  </div>

                  {/* GSC site */}
                  <div>
                    <label htmlFor="gscSiteUrl" className="block text-xs font-medium text-muted-foreground mb-1">
                      Website in Search Console
                    </label>
                    {properties?.gscSites?.length > 0 ? (
                      <select
                        id="gscSiteUrl"
                        value={gscSiteUrl}
                        onChange={(e) => setGscSiteUrl(e.target.value)}
                        className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
                      >
                        <option value="">Select site...</option>
                        {properties.gscSites.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="gscSiteUrl"
                        type="text"
                        value={gscSiteUrl}
                        onChange={(e) => setGscSiteUrl(e.target.value)}
                        placeholder="https://www.example.com/"
                        className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground font-mono"
                      />
                    )}
                  </div>

                  {/* GA4 property */}
                  <div>
                    <label htmlFor="ga4PropertyId" className="block text-xs font-medium text-muted-foreground mb-1">
                      Analytics property
                    </label>
                    {properties?.ga4Properties?.length > 0 ? (
                      <select
                        id="ga4PropertyId"
                        value={ga4PropertyId}
                        onChange={(e) => setGa4PropertyId(e.target.value)}
                        className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
                      >
                        <option value="">Select property...</option>
                        {properties.ga4Properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.displayName} ({p.id})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="ga4PropertyId"
                        type="text"
                        value={ga4PropertyId}
                        onChange={(e) => setGa4PropertyId(e.target.value)}
                        placeholder="123456789"
                        className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground font-mono"
                      />
                    )}
                    {properties?.ga4ListError && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        {properties.ga4ListError}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Numeric ID from GA4 Admin &gt; Property Settings (not the G-XXXXXXX Measurement ID).
                    </p>
                  </div>

                  {/* Date range */}
                  <div>
                    <label htmlFor="dateRange" className="block text-xs font-medium text-muted-foreground mb-1">
                      Date range
                    </label>
                    <select
                      id="dateRange"
                      value={dateRangeDays}
                      onChange={(e) => setDateRangeDays(e.target.value)}
                      className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
                    >
                      <option value="7">Last 7 days</option>
                      <option value="28">Last 28 days</option>
                      <option value="90">Last 90 days</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    disabled={savingProps}
                    onClick={handleSaveProperties}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    {savingProps && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Save settings
                  </button>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      disabled={testing}
                      onClick={handleTest}
                      className="px-4 py-2 rounded-lg border border-default hover:bg-brand-700 text-sm text-foreground flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Test connection
                    </button>
                    <button
                      type="button"
                      disabled={fetching}
                      onClick={handleFetch}
                      className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {fetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Fetch data now
                    </button>
                  </div>

                  {testLog && (
                    <pre className="mt-2 text-xs text-muted-foreground bg-brand-900 border border-default rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap">
                      {testLog}
                    </pre>
                  )}
                  {fetchLog && (
                    <div className="mt-2">
                      {fetchJobStatus && (
                        <p className="text-xs text-muted-foreground mb-1">
                          Status:{' '}
                          <span
                            className={
                              fetchJobStatus === 'success'
                                ? 'text-green-700 dark:text-green-400 font-medium'
                                : fetchJobStatus === 'error'
                                  ? 'text-red-700 dark:text-red-400 font-medium'
                                  : 'text-link font-medium'
                            }
                          >
                            {fetchJobStatus}
                          </span>
                          {fetchJobStatus === 'running' && (
                            <span className="ml-2 inline-flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              running
                            </span>
                          )}
                        </p>
                      )}
                      <pre className="text-xs text-muted-foreground bg-brand-900 border border-default rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                        {fetchLog}
                      </pre>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Full live log also opens in Pipeline Runner (blue terminal button, bottom-right).
                      </p>
                    </div>
                  )}
                </section>
              )}

              {/* Last fetched */}
              {status?.lastFetchedAt && (
                <p className="text-xs text-muted-foreground">
                  Last fetched: {new Date(status.lastFetchedAt).toLocaleString()}
                </p>
              )}

              {/* ── Advanced: paste refresh token ── */}
              <div className="border border-muted rounded-lg">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  <span>Advanced: paste connection token</span>
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showAdvanced && (
                  <div className="px-4 pb-4 space-y-3 border-t border-muted">
                    <InputField
                      id="refreshToken"
                      label="Refresh token"
                      value={refreshToken}
                      onChange={setRefreshToken}
                      placeholder="1//0g..."
                      helper="Paste a refresh token obtained outside this app (e.g. from another OAuth tool)."
                      disabled={savingToken}
                    />
                    <button
                      type="button"
                      disabled={savingToken || !refreshToken.trim()}
                      onClick={handleSaveRefreshToken}
                      className="px-4 py-2 rounded-lg border border-default hover:bg-brand-700 text-sm text-foreground flex items-center gap-2 disabled:opacity-50 transition-colors"
                    >
                      {savingToken && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Save token
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
