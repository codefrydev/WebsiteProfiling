'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  KeyRound,
  Link2,
  BarChart3,
} from 'lucide-react';
import type { GooglePropertiesResponse, GoogleStatusResponse, IntegrationToast } from '@/types/api';
import { apiUrl } from '@/lib/publicBase';
import { dispatchPipelineJobStarted, pollPipelineJob } from '@/lib/pipelineJobEvents';
import { useOptionalReport } from '@/context/useReport';
import Button from '@/components/Button';

const GCP_GUIDE_URL =
  'https://developers.google.com/workspace/guides/get-started';

function StatusPill({ connected }: { connected?: boolean }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-default bg-brand-900/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <AlertCircle className="h-3.5 w-3.5" />
      Not connected
    </span>
  );
}

function GoogleMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function SetupStep({
  step,
  title,
  description,
  done,
  icon: Icon,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  done?: boolean;
  icon: typeof KeyRound;
  children: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border transition-colors ${
        done ? 'border-green-500/25 bg-brand-800/40' : 'border-default bg-brand-800/60'
      }`}
    >
      <div className="flex items-start gap-3 border-b border-muted/60 px-4 py-3.5 sm:px-5">
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
            done
              ? 'bg-green-500/15 text-green-700 dark:text-green-400'
              : 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
          }`}
        >
          {done ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : step}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

function selectClassName() {
  return 'w-full rounded-lg border border-default bg-brand-900 px-3 py-2.5 text-sm text-foreground focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
}

function InputField({
  label,
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  helper,
  disabled,
}: {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  helper?: string;
  disabled?: boolean;
}) {
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
        className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2.5 text-sm text-foreground font-mono focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
      />
      {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

export interface GoogleIntegrationsPanelProps {
  initialToast?: IntegrationToast | null;
  showTitle?: boolean;
}

/**
 * Inline Google Search Console + GA4 setup (credentials, connect, properties, fetch).
 */
export default function GoogleIntegrationsPanel({
  initialToast,
  showTitle = true,
}: GoogleIntegrationsPanelProps) {
  const report = useOptionalReport();
  const [status, setStatus] = useState<GoogleStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Phase 1 fields
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);

  // Phase 2 fields
  const [gscSiteUrl, setGscSiteUrl] = useState('');
  const [ga4PropertyId, setGa4PropertyId] = useState('');
  const [dateRangeDays, setDateRangeDays] = useState('28');
  const [savingProps, setSavingProps] = useState(false);

  // Properties dropdowns
  const [properties, setProperties] = useState<GooglePropertiesResponse | null>(null);
  const [loadingProps, setLoadingProps] = useState(false);

  // Test / Fetch
  const [testLog, setTestLog] = useState('');
  const [testing, setTesting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchLog, setFetchLog] = useState('');
  const [fetchJobStatus, setFetchJobStatus] = useState('');
  const fetchPollStopRef = useRef<(() => void) | null>(null);

  // Advanced accordion (paste refresh token)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [refreshToken, setRefreshToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  // Toast from OAuth callback
  const [toast, setToast] = useState<IntegrationToast | null>(initialToast || null);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch(apiUrl('/integrations/google/status'));
      if (res.ok) {
        const data = (await res.json()) as GoogleStatusResponse;
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
    void fetchStatus();
  }, [fetchStatus]);

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
        const data = (await res.json()) as GooglePropertiesResponse;
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
        setClientSecret(''); // clear secret from UI after save
        setToast({ type: 'success', message: 'Client credentials saved.' });
      }
    } catch (e) {
      setToast({ type: 'error', message: e instanceof Error ? e.message : String(e) });
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
      setToast({ type: 'error', message: e instanceof Error ? e.message : String(e) });
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
      setToast({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingToken(false);
    }
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
        setToast({ type: 'success', message: 'Connection test passed — Search Console and Analytics are reachable.' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestLog(msg);
      setToast({ type: 'error', message: msg });
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
          message: 'Google fetch started — live log below and on the Pipeline page.',
        });
        dispatchPipelineJobStarted(jobId, { command: 'google', openRunner: true });
        fetchPollStopRef.current = pollPipelineJob(jobId, (job) => {
          const header = `Job ${jobId}\nStatus: ${job.status}\n`;
          setFetchJobStatus(job.status);
          setFetchLog(job.log ? `${header}\n${job.log}` : `${header}\nWaiting for output…`);
          if (job.status === 'success') {
            setToast({ type: 'success', message: 'Google data fetch completed.' });
            fetchStatus();
            report?.loadReport();
          } else if (job.status === 'error') {
            setToast({ type: 'error', message: 'Google data fetch failed — see log below.' });
          }
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setFetchLog(msg);
      setFetchJobStatus('error');
      setToast({ type: 'error', message: msg });
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
      setToast({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const hasClientId = status?.hasClientId;
  const connected = status?.connected;
  const step1Done = Boolean(hasClientId);
  const step2Done = Boolean(connected);

  return (
    <div className="space-y-4">
      {showTitle ? (
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-default bg-brand-800/60 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-default bg-brand-900/80">
              <GoogleMark className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">Connect Search Console & Analytics</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Connect Search Console and Analytics 4, then choose properties to sync with your reports.
              </p>
            </div>
          </div>
          <StatusPill connected={connected} />
        </div>
      ) : null}

      {toast ? (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
            toast.type === 'success'
              ? 'border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
              : 'border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      ) : null}

      {loadingStatus ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-default bg-brand-800/40 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-link" />
          Loading connection status…
        </div>
      ) : (
        <>
          <SetupStep
            step={1}
            title="Google Cloud credentials"
            description="One-time setup. Enable Search Console API and Analytics Data API in your GCP project."
            done={step1Done}
            icon={KeyRound}
          >
            <p className="text-xs text-muted-foreground">
              Need a project?{' '}
              <a
                href={GCP_GUIDE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-link underline"
              >
                Google Cloud guide <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
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
                placeholder={hasClientId ? '(saved — enter to replace)' : 'GOCSPX-...'}
                disabled={savingCreds}
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Button
                variant="primary"
                onClick={() => void handleSaveClientCreds()}
                disabled={savingCreds || (!clientId.trim() && !clientSecret.trim())}
              >
                {savingCreds ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Save credentials
              </Button>
            </div>
          </SetupStep>

          <SetupStep
            step={2}
            title="Connect Google account"
            description={step1Done ? 'Sign in to authorize Search Console and Analytics access.' : 'Save credentials in step 1 first.'}
            done={step2Done}
            icon={Link2}
          >
            {connected ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-500/25 bg-green-500/10 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-700 dark:text-green-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">Account connected</p>
                  <p className="text-xs text-green-700/80 dark:text-green-400/80">You can configure properties in the next step.</p>
                </div>
                <Button variant="ghost" onClick={() => void handleDisconnect()} className="text-red-700 dark:text-red-400">
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                {!hasClientId ? (
                  <p className="min-w-0 flex-1 text-xs text-muted-foreground">Complete step 1 to enable sign-in.</p>
                ) : (
                  <span className="flex-1" aria-hidden="true" />
                )}
                <Button
                  variant="primary"
                  disabled={!hasClientId}
                  onClick={() => {
                    const returnTo = encodeURIComponent(
                      window.location.pathname + window.location.search,
                    );
                    window.location.href = apiUrl(
                      `/integrations/google/auth?returnTo=${returnTo}`,
                    );
                  }}
                  className="shrink-0 px-5 py-2.5"
                >
                  <GoogleMark />
                  Connect with Google
                </Button>
              </div>
            )}
          </SetupStep>

          {connected ? (
            <SetupStep
              step={3}
              title="Properties & sync"
              description="Choose Search Console site and Analytics property, then test or fetch data."
              done={Boolean(gscSiteUrl && ga4PropertyId)}
              icon={BarChart3}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Load sites from your connected account.</p>
                <Button variant="secondary" onClick={() => void loadProperties()} disabled={loadingProps} className="py-2">
                  {loadingProps ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Load properties
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="gscSiteUrl" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Search Console site
                  </label>
                  {properties?.gscSites && properties.gscSites.length > 0 ? (
                    <select
                      id="gscSiteUrl"
                      value={gscSiteUrl}
                      onChange={(e) => setGscSiteUrl(e.target.value)}
                      className={selectClassName()}
                    >
                      <option value="">Select site…</option>
                      {properties.gscSites.map((site: string) => (
                        <option key={site} value={site}>
                          {site}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="gscSiteUrl"
                      type="text"
                      value={gscSiteUrl}
                      onChange={(e) => setGscSiteUrl(e.target.value)}
                      placeholder="https://www.example.com/"
                      className={`${selectClassName()} font-mono`}
                    />
                  )}
                </div>

                <div>
                  <label htmlFor="ga4PropertyId" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    GA4 property ID
                  </label>
                  {properties?.ga4Properties && properties.ga4Properties.length > 0 ? (
                    <select
                      id="ga4PropertyId"
                      value={ga4PropertyId}
                      onChange={(e) => setGa4PropertyId(e.target.value)}
                      className={selectClassName()}
                    >
                      <option value="">Select property…</option>
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
                      className={`${selectClassName()} font-mono`}
                    />
                  )}
                  {properties?.ga4ListError ? (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{properties.ga4ListError}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Numeric ID from GA4 Admin → Property settings.</p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="dateRange" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Date range
                  </label>
                  <select
                    id="dateRange"
                    value={dateRangeDays}
                    onChange={(e) => setDateRangeDays(e.target.value)}
                    className={selectClassName()}
                  >
                    <option value="7">Last 7 days</option>
                    <option value="28">Last 28 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                </div>
              </div>

              {status?.lastFetchedAt ? (
                <p className="text-xs text-muted-foreground">
                  Last fetched: {new Date(status.lastFetchedAt).toLocaleString()}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-muted/60 pt-4">
                <Button variant="primary" onClick={() => void handleSaveProperties()} disabled={savingProps}>
                  {savingProps ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Save properties
                </Button>
                <Button variant="secondary" onClick={() => void handleTest()} disabled={testing}>
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Test connection
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void handleFetch()}
                  disabled={fetching}
                  className="border-green-700/40 text-green-800 hover:bg-green-500/10 dark:text-green-300"
                >
                  {fetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Fetch data now
                </Button>
              </div>

              {testLog ? (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-default bg-brand-900 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {testLog}
                </pre>
              ) : null}

              {fetchLog ? (
                <div className="space-y-1">
                  {fetchJobStatus ? (
                    <p className="text-xs text-muted-foreground">
                      Fetch status:{' '}
                      <span
                        className={
                          fetchJobStatus === 'success'
                            ? 'font-medium text-green-700 dark:text-green-400'
                            : fetchJobStatus === 'error'
                              ? 'font-medium text-red-700 dark:text-red-400'
                              : 'font-medium text-link'
                        }
                      >
                        {fetchJobStatus}
                      </span>
                      {fetchJobStatus === 'running' ? (
                        <Loader2 className="ml-1 inline h-3 w-3 animate-spin" aria-hidden />
                      ) : null}
                    </p>
                  ) : null}
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-default bg-brand-900 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                    {fetchLog}
                  </pre>
                </div>
              ) : null}
            </SetupStep>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-default bg-brand-800/40">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-brand-900/30 hover:text-foreground sm:px-5"
              aria-expanded={showAdvanced}
            >
              <span>Advanced: paste connection token</span>
              {showAdvanced ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
            </button>
            {showAdvanced ? (
              <div className="space-y-3 border-t border-muted/60 px-4 py-4 sm:px-5">
                <InputField
                  id="refreshToken"
                  label="Refresh token"
                  value={refreshToken}
                  onChange={setRefreshToken}
                  placeholder="1//0g..."
                  helper="For tokens obtained outside this app (e.g. another OAuth tool)."
                  disabled={savingToken}
                />
                <Button variant="secondary" onClick={() => void handleSaveRefreshToken()} disabled={savingToken || !refreshToken.trim()}>
                  {savingToken ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Save token
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
