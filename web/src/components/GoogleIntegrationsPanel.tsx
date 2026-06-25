
import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
  Settings2,
} from 'lucide-react';
import type { GooglePropertiesResponse, GoogleStatusResponse, IntegrationToast } from '@/types/api';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { strings, format } from '@/lib/strings';
import { dispatchPipelineJobStarted, pollPipelineJob } from '@/lib/pipelineJobEvents';
import { useOptionalReport } from '@/context/useReport';
import PropertyOpsSection from '@/components/integrations/PropertyOpsSection';
import BingWebmasterSection from '@/components/integrations/BingWebmasterSection';
import { useOptionalPipeline } from '@/context/PipelineContext';
import { useResolvedPropertyId } from '@/hooks/useResolvedPropertyId';
import { googlePropertyEndpoints } from '@/lib/googlePropertyEndpoints';
import { pickInitialPropertyId, siteUrlFromProperty } from '@/lib/googlePropertySelection';
import { deriveSiteNameFromStartUrl } from '@/lib/domainSlug';
import type { PropertyListItem } from '@/types/api';
import Button from '@/components/Button';
import ViewTabs from '@/components/ViewTabs';
import { ViewTabPanel } from '@/components/ViewTabPanel';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import { integrationGuideHref } from '@/lib/docs/integrationGuides';

type IntegrationsTabId = 'connect' | 'properties' | 'imports' | 'settings';

const s = strings.pipelineRunner;

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

type PropertiesSaveState =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'saved'; auto: boolean; savedAt: number }
  | { phase: 'error'; message: string };

function PropertiesSaveFeedback({
  state,
  dirty,
}: {
  state: PropertiesSaveState;
  dirty: boolean;
}) {
  if (state.phase === 'saving') {
    return (
      <p
        className="flex items-center gap-2 text-sm text-link"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        {s.googlePropertiesSaving}
      </p>
    );
  }
  if (state.phase === 'error') {
    return (
      <p
        className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400"
        role="alert"
        aria-live="assertive"
      >
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }
  if (state.phase === 'saved') {
    const label = state.auto ? s.googlePropertiesSavedAuto : s.googlePropertiesSaved;
    const time = new Date(state.savedAt).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return (
      <p
        className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-green-700 dark:text-green-400"
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        <span>{label}</span>
        <span className="text-xs text-green-700/80 dark:text-green-400/80">
          {format(s.googlePropertiesSavedAt, { time })}
        </span>
      </p>
    );
  }
  if (dirty) {
    return (
      <p
        className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300"
        role="status"
        aria-live="polite"
      >
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
        {s.googlePropertiesUnsaved}
      </p>
    );
  }
  return null;
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
  /** Tabbed layout for modal / large containers. */
  layout?: 'default' | 'tabbed';
  /** When omitted, resolved from pipeline/report Site URL. */
  propertyId?: number | null;
  /** Site URL used to resolve the property row when propertyId is omitted. */
  startUrl?: string;
}

/**
 * Inline Google Search Console + GA4 setup (credentials, connect, properties, fetch).
 */
export default function GoogleIntegrationsPanel({
  initialToast,
  showTitle = true,
  layout = 'default',
  propertyId: propertyIdProp,
  startUrl: startUrlProp = '',
}: GoogleIntegrationsPanelProps) {
  const report = useOptionalReport();
  const pipeline = useOptionalPipeline();
  const { readOnly } = useReadOnlySession();
  const startUrl =
    startUrlProp.trim() ||
    String(pipeline?.configState.start_url || report?.data?.start_url || report?.data?.links?.[0]?.url || '');
  const resolvedFromUrl = useResolvedPropertyId(propertyIdProp, startUrl);
  const [propertyRows, setPropertyRows] = useState<PropertyListItem[]>([]);
  const [loadingPropertyRows, setLoadingPropertyRows] = useState(true);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [syncingProperty, setSyncingProperty] = useState(false);

  const effectivePropertyId = useMemo(() => {
    if (selectedPropertyId != null && Number.isFinite(selectedPropertyId)) {
      return selectedPropertyId;
    }
    if (resolvedFromUrl != null && Number.isFinite(resolvedFromUrl)) {
      return resolvedFromUrl;
    }
    if (propertyIdProp != null && Number.isFinite(propertyIdProp)) {
      return propertyIdProp;
    }
    return null;
  }, [selectedPropertyId, resolvedFromUrl, propertyIdProp]);

  const selectedProperty = useMemo(
    () => propertyRows.find((p) => p.id === effectivePropertyId) ?? null,
    [propertyRows, effectivePropertyId],
  );
  const endpoints = googlePropertyEndpoints(effectivePropertyId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingPropertyRows(true);
      try {
        const res = await apiFetch(apiUrl('/properties'));
        if (!res.ok) return;
        const data = (await res.json()) as { properties?: PropertyListItem[] };
        if (!cancelled) setPropertyRows(data.properties ?? []);
      } catch {
        if (!cancelled) setPropertyRows([]);
      } finally {
        if (!cancelled) setLoadingPropertyRows(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (propertyRows.length === 0) {
      if (resolvedFromUrl != null) {
        setSelectedPropertyId(resolvedFromUrl);
      }
      return;
    }
    const next = pickInitialPropertyId(propertyRows, {
      explicitId: propertyIdProp ?? resolvedFromUrl,
      startUrl: String(pipeline?.configState.start_url || startUrl),
      activePropertyId: String(pipeline?.configState.active_property_id || ''),
    });
    setSelectedPropertyId((prev) => {
      if (prev != null && propertyRows.some((p) => p.id === prev)) return prev;
      return next;
    });
  }, [
    propertyRows,
    propertyIdProp,
    resolvedFromUrl,
    startUrl,
    pipeline?.configState.start_url,
    pipeline?.configState.active_property_id,
  ]);

  const handlePropertySelect = useCallback(
    async (id: number) => {
      if (readOnly) return;
      setSelectedPropertyId(id);
      const row = propertyRows.find((p) => p.id === id);
      if (!row || !pipeline) return;
      setSyncingProperty(true);
      try {
        const url = siteUrlFromProperty(row);
        pipeline.setField('start_url', url);
        pipeline.setField('active_property_id', String(id));
        pipeline.setField('site_name', deriveSiteNameFromStartUrl(url));
        await pipeline.saveSettings();
      } finally {
        setSyncingProperty(false);
      }
    },
    [propertyRows, pipeline, readOnly],
  );
  const [status, setStatus] = useState<GoogleStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [gscSiteUrl, setGscSiteUrl] = useState('');
  const [ga4PropertyId, setGa4PropertyId] = useState('');
  const [dateRangeDays, setDateRangeDays] = useState('28');
  const [savingProps, setSavingProps] = useState(false);
  const [propertiesSaveState, setPropertiesSaveState] = useState<PropertiesSaveState>({
    phase: 'idle',
  });
  const [savedPropertiesSnapshot, setSavedPropertiesSnapshot] = useState<{
    gsc: string;
    ga4: string;
    days: string;
  } | null>(null);

  // GSC / GA4 list from Google APIs
  const [googleLists, setGoogleLists] = useState<GooglePropertiesResponse | null>(null);
  const [loadingGoogleLists, setLoadingGoogleLists] = useState(false);

  // Test / Fetch
  const [testLog, setTestLog] = useState('');
  const [testing, setTesting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchLog, setFetchLog] = useState('');
  const [fetchJobStatus, setFetchJobStatus] = useState('');
  const fetchPollStopRef = useRef<(() => void) | null>(null);

  const [linksStatus, setLinksStatus] = useState<{
    hasData?: boolean;
    lastImportedAt?: string;
    exportTypes?: string[];
    rowCounts?: Record<string, number>;
    referringDomainCount?: number;
    topLinkedPageCount?: number;
    sampleLinkCount?: number;
    latestLinkCount?: number;
  } | null>(null);
  const [loadingLinksStatus, setLoadingLinksStatus] = useState(false);
  const [uploadingLinks, setUploadingLinks] = useState(false);
  const [linksUploadMessage, setLinksUploadMessage] = useState('');
  const linksFileInputRef = useRef<HTMLInputElement | null>(null);

  // Advanced accordion (paste refresh token)
  const [activeTab, setActiveTab] = useState<IntegrationsTabId>('connect');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [refreshToken, setRefreshToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  // Toast from OAuth callback
  const [toast, setToast] = useState<IntegrationToast | null>(initialToast || null);

  const ensurePropertyIdForOAuth = useCallback(async (): Promise<number | null> => {
    if (effectivePropertyId != null) return effectivePropertyId;
    const url = startUrl.trim();
    if (!url || !url.includes('.')) return null;
    try {
      const resolveRes = await apiFetch(apiUrl(`/properties/resolve?startUrl=${encodeURIComponent(url)}`));
      if (resolveRes.ok) {
        const resolved = (await resolveRes.json()) as { id?: number | null };
        if (resolved.id != null && Number.isFinite(resolved.id)) {
          setSelectedPropertyId(resolved.id);
          return resolved.id;
        }
      }
      const ensureRes = await apiFetch(apiUrl('/properties/ensure'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUrl: url }),
      });
      if (!ensureRes.ok) return null;
      const ensured = (await ensureRes.json()) as { id?: number };
      if (ensured.id == null || !Number.isFinite(ensured.id)) return null;
      setSelectedPropertyId(ensured.id);
      return ensured.id;
    } catch {
      return null;
    }
  }, [effectivePropertyId, startUrl]);

  const fetchStatus = useCallback(async (isCancelled?: () => boolean) => {
    if (effectivePropertyId == null) return;
    setLoadingStatus(true);
    try {
      const res = await apiFetch(endpoints.status);
      if (res.ok) {
        const data = (await res.json()) as GoogleStatusResponse & {
          connected?: boolean;
          connectedEmail?: string | null;
          gscSiteUrl?: string | null;
          ga4PropertyId?: string | null;
        };
        const mapped: GoogleStatusResponse & { connectedEmail?: string | null } = {
          connected: Boolean(data.connected),
          hasClientId: data.hasClientId ?? true,
          gscSiteUrl: data.gscSiteUrl ?? null,
          ga4PropertyId: data.ga4PropertyId ?? null,
          dateRangeDays: data.dateRangeDays ?? 28,
          authMode: data.authMode ?? null,
          lastFetchedAt: data.lastFetchedAt ?? null,
          connectedEmail: data.connectedEmail ?? null,
        };
        // Guard against a stale response (property switched) clobbering newer data.
        if (!isCancelled?.()) {
          setStatus(mapped);
          const gsc = mapped.gscSiteUrl ?? '';
          const ga4 = mapped.ga4PropertyId ?? '';
          const days = mapped.dateRangeDays ? String(mapped.dateRangeDays) : '28';
          setGscSiteUrl(gsc);
          setGa4PropertyId(ga4);
          setDateRangeDays(days);
          setSavedPropertiesSnapshot({ gsc, ga4, days });
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingStatus(false);
    }
  }, [endpoints.status, effectivePropertyId]);

  useEffect(() => {
    let cancelled = false;
    void fetchStatus(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchStatus]);

  const fetchLinksStatus = useCallback(async (isCancelled?: () => boolean) => {
    if (effectivePropertyId == null || !endpoints.linksStatus) {
      setLinksStatus(null);
      return;
    }
    setLoadingLinksStatus(true);
    try {
      const res = await apiFetch(endpoints.linksStatus);
      if (res.ok) {
        const data = (await res.json()) as typeof linksStatus;
        if (!isCancelled?.()) setLinksStatus(data);
      }
    } catch {
      if (!isCancelled?.()) setLinksStatus(null);
    } finally {
      setLoadingLinksStatus(false);
    }
  }, [effectivePropertyId, endpoints.linksStatus]);

  useEffect(() => {
    let cancelled = false;
    void fetchLinksStatus(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchLinksStatus]);

  const handleLinksFile = useCallback(
    async (file: File) => {
      if (effectivePropertyId == null || !endpoints.linksImport) return;
      setUploadingLinks(true);
      setLinksUploadMessage('');
      try {
        const fileContent = await file.text();
        const res = await apiFetch(endpoints.linksImport, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileContent, fileName: file.name }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setLinksUploadMessage(
            format(s.gscLinksUploadFailed, { message: data.error || res.statusText }),
          );
          return;
        }
        setLinksUploadMessage(s.gscLinksUploadSuccess);
        await fetchLinksStatus();
      } catch (e) {
        setLinksUploadMessage(
          format(s.gscLinksUploadFailed, {
            message: e instanceof Error ? e.message : String(e),
          }),
        );
      } finally {
        setUploadingLinks(false);
        if (linksFileInputRef.current) linksFileInputRef.current.value = '';
      }
    },
    [effectivePropertyId, endpoints.linksImport, fetchLinksStatus, s.gscLinksUploadFailed, s.gscLinksUploadSuccess],
  );

  useEffect(() => {
    if (initialToast) setToast(initialToast);
  }, [initialToast]);

  // Auto-dismiss toast after 6s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadGoogleLists = async () => {
    setLoadingGoogleLists(true);
    try {
      const res = await apiFetch(endpoints.listProperties);
      if (res.ok) {
        const data = (await res.json()) as GooglePropertiesResponse;
        setGoogleLists(data);
        if (data.ga4ListError) {
          setToast({ type: 'error', message: data.ga4ListError });
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingGoogleLists(false);
    }
  };

  const propertiesDirty =
    savedPropertiesSnapshot !== null &&
    (gscSiteUrl !== savedPropertiesSnapshot.gsc ||
      ga4PropertyId !== savedPropertiesSnapshot.ga4 ||
      dateRangeDays !== savedPropertiesSnapshot.days);

  const handleSaveProperties = useCallback(
    async (options?: { auto?: boolean }): Promise<boolean> => {
      if (readOnly) return false;
      if (ga4PropertyId && !/^\d+$/.test(ga4PropertyId.trim())) {
        const msg =
          'Analytics property ID must be a numeric ID (e.g. 123456789). The G-XXXXXXX code is a Measurement ID — find the numeric ID in GA4 Admin > Property Settings.';
        setPropertiesSaveState({ phase: 'error', message: msg });
        setToast({ type: 'error', message: msg });
        return false;
      }
      setSavingProps(true);
      setPropertiesSaveState({ phase: 'saving' });
      try {
        const res = await apiFetch(endpoints.credentials, {
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
          const msg = data.error || s.googlePropertiesSaveFailed;
          setPropertiesSaveState({ phase: 'error', message: msg });
          setToast({ type: 'error', message: msg });
          return false;
        }
        if (data.status) setStatus(data.status);
        else await fetchStatus();
        const gsc = data.status?.gscSiteUrl ?? '';
        const ga4 = data.status?.ga4PropertyId ?? '';
        const days = String(data.status?.dateRangeDays ?? dateRangeDays);
        setGscSiteUrl(gsc);
        setGa4PropertyId(ga4);
        setDateRangeDays(days);
        setSavedPropertiesSnapshot({ gsc, ga4, days });
        const savedAt = Date.now();
        setPropertiesSaveState({ phase: 'saved', auto: !!options?.auto, savedAt });
        setToast({
          type: 'success',
          message: options?.auto ? s.googlePropertiesSavedAuto : s.googlePropertiesSaved,
        });
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : s.googlePropertiesSaveFailed;
        setPropertiesSaveState({ phase: 'error', message: msg });
        setToast({ type: 'error', message: msg });
        return false;
      } finally {
        setSavingProps(false);
      }
    },
    [gscSiteUrl, ga4PropertyId, dateRangeDays, endpoints.credentials, fetchStatus, readOnly],
  );

  const handlePropertiesBlur = useCallback(() => {
    if (readOnly || !status?.connected || savingProps) return;
    if (!gscSiteUrl.trim() && !ga4PropertyId.trim()) return;
    if (!propertiesDirty) return;
    void handleSaveProperties({ auto: true });
  }, [
    status?.connected,
    savingProps,
    gscSiteUrl,
    ga4PropertyId,
    propertiesDirty,
    handleSaveProperties,
    readOnly,
  ]);

  useEffect(() => {
    if (propertiesDirty && propertiesSaveState.phase === 'saved') {
      setPropertiesSaveState({ phase: 'idle' });
    }
  }, [propertiesDirty, propertiesSaveState.phase]);

  useEffect(() => {
    if (propertiesSaveState.phase !== 'saved') return;
    const t = setTimeout(() => {
      setPropertiesSaveState((prev) => (prev.phase === 'saved' ? { phase: 'idle' } : prev));
    }, 12000);
    return () => clearTimeout(t);
  }, [propertiesSaveState]);

  const handleSaveRefreshToken = async () => {
    if (readOnly || !refreshToken.trim() || effectivePropertyId == null) return;
    setSavingToken(true);
    try {
      const res = await apiFetch(endpoints.credentials, {
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
    if (readOnly) return;
    setTesting(true);
    setTestLog('');
    try {
      const res = await apiFetch(endpoints.test, { method: 'POST' });
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
    if (readOnly) return;
    setFetching(true);
    setFetchLog('Starting Google data fetch…');
    setFetchJobStatus('running');
    fetchPollStopRef.current?.();
    fetchPollStopRef.current = null;
    try {
      const res = await apiFetch(apiUrl('/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'google',
          propertyId: effectivePropertyId ?? undefined,
          state: startUrl.trim() ? { start_url: startUrl.trim() } : undefined,
        }),
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
    if (readOnly) return;
    try {
      await apiFetch(endpoints.disconnect, { method: 'POST' });
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

  const needsProperty = effectivePropertyId == null && !startUrl.trim();
  const isTabbed = layout === 'tabbed';

  const readOnlyBanner = readOnly ? (
    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
      {strings.app.readonlyBanner}
    </p>
  ) : null;

  const infoBannerText =
    'Google Client ID/Secret and service account JSON are stored app-wide in the database. Upload a service account for API access without per-site OAuth, or connect each site with OAuth for user-delegated access. Search Console and Analytics property IDs remain per site.';

  const infoBanner = (
    <p className="rounded-lg border border-default bg-brand-800/50 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
      {infoBannerText}
    </p>
  );

  const propertySelector = (
      <div className="rounded-xl border border-default bg-brand-800/60 px-4 py-4 sm:px-5 space-y-3">
        <label htmlFor="googlePropertySelect" className="block text-xs font-medium text-muted-foreground">
          {s.googlePropertySelectorLabel}
        </label>
        <p className="text-xs text-muted-foreground">{s.googlePropertySelectorHint}</p>
        {loadingPropertyRows ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading sites…
          </div>
        ) : propertyRows.length === 0 && effectivePropertyId == null ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">{s.googlePropertySelectorEmpty}</p>
        ) : propertyRows.length === 0 && startUrl.trim() ? (
          <p className="text-sm text-muted-foreground">
            Site: <span className="font-mono text-foreground">{startUrl.trim()}</span>
            {' — '}
            Connect will register this site automatically.
          </p>
        ) : (
          <select
            id="googlePropertySelect"
            value={String(selectedPropertyId ?? effectivePropertyId ?? '')}
            onChange={(e) => {
              const id = parseInt(e.target.value, 10);
              if (Number.isFinite(id)) void handlePropertySelect(id);
            }}
            disabled={syncingProperty || readOnly}
            className={selectClassName()}
          >
            {propertyRows.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.canonical_domain})
                {p.google_connected ? ` — ${s.googlePropertyConnected}` : ` — ${s.googlePropertyNotConnected}`}
              </option>
            ))}
          </select>
        )}
        {syncingProperty ? (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            {s.googlePropertySyncSaving}
          </p>
        ) : null}
        {selectedProperty && status ? (
          <div className="rounded-lg border border-muted/60 bg-brand-900/40 px-3 py-2.5 text-xs space-y-1">
            <p className="font-medium text-foreground">
              {format(s.googlePropertyContextTitle, { name: selectedProperty.name })}
            </p>
            <p className="text-muted-foreground">
              {format(s.googlePropertyContextDomain, { domain: selectedProperty.canonical_domain })}
            </p>
            {status.connected &&
            (status as GoogleStatusResponse & { connectedEmail?: string | null }).connectedEmail ? (
              <p className="text-green-700 dark:text-green-400">
                {format(s.googlePropertyContextEmail, {
                  email: String(
                    (status as GoogleStatusResponse & { connectedEmail?: string | null }).connectedEmail,
                  ),
                })}
              </p>
            ) : status.connected && selectedProperty.google_connected_email ? (
              <p className="text-green-700 dark:text-green-400">
                {format(s.googlePropertyContextEmail, {
                  email: selectedProperty.google_connected_email,
                })}
              </p>
            ) : (
              <p className="text-muted-foreground">{s.googlePropertyNotConnected}</p>
            )}
            <p className="text-muted-foreground">
              {format(s.googlePropertyGscGa4, {
                gsc: status.gscSiteUrl || '—',
                ga4: status.ga4PropertyId || '—',
              })}
            </p>
          </div>
        ) : null}
      </div>
  );

  const needsPropertyWarning = needsProperty ? (
    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
      Set a Site URL under Crawl settings so this audit can link Google Search Console and Analytics to the
      correct domain.
    </p>
  ) : null;

  const titleBlock = showTitle ? (
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
  ) : null;

  const compactContextBar = isTabbed ? (
    <div className="rounded-xl border border-default bg-brand-800/60 px-4 py-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-default bg-brand-900/80">
            <GoogleMark className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Site & connection</p>
            <p className="text-xs text-muted-foreground">Credentials are shared; OAuth is per site.</p>
          </div>
        </div>
        <StatusPill connected={connected} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
        <div className="min-w-0 space-y-1.5">
          <label htmlFor="googlePropertySelect" className="block text-xs font-medium text-muted-foreground">
            {s.googlePropertySelectorLabel}
          </label>
          {loadingPropertyRows ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sites…
            </div>
          ) : propertyRows.length === 0 && effectivePropertyId == null ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">{s.googlePropertySelectorEmpty}</p>
          ) : propertyRows.length === 0 && startUrl.trim() ? (
            <p className="text-sm text-muted-foreground">
              Site: <span className="font-mono text-foreground">{startUrl.trim()}</span>
            </p>
          ) : (
            <select
              id="googlePropertySelect"
              value={String(selectedPropertyId ?? effectivePropertyId ?? '')}
              onChange={(e) => {
                const id = parseInt(e.target.value, 10);
                if (Number.isFinite(id)) void handlePropertySelect(id);
              }}
              disabled={syncingProperty || readOnly}
              className={selectClassName()}
            >
              {propertyRows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.canonical_domain})
                  {p.google_connected ? ` — ${s.googlePropertyConnected}` : ` — ${s.googlePropertyNotConnected}`}
                </option>
              ))}
            </select>
          )}
        </div>
        {selectedProperty && status ? (
          <div className="rounded-lg border border-muted/60 bg-brand-900/40 px-3 py-2.5 text-xs space-y-1">
            <p className="font-medium text-foreground">
              {format(s.googlePropertyContextTitle, { name: selectedProperty.name })}
            </p>
            <p className="text-muted-foreground">
              {format(s.googlePropertyGscGa4, {
                gsc: status.gscSiteUrl || '—',
                ga4: status.ga4PropertyId || '—',
              })}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  const toastBlock = toast ? (
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
  ) : null;

  const credentialsStep = (
          <SetupStep
            step={1}
            title="Google Cloud credentials"
            description="One-time setup. Enable Search Console API and Analytics Data API in your GCP project."
            done={step1Done}
            icon={KeyRound}
          >
            <p className="text-xs text-muted-foreground">
              Need a project?{' '}
              <Link
                to={integrationGuideHref('google', { from: 'integrations', sectionId: 'oauthClient' })}
                className="inline-flex items-center gap-0.5 text-link underline"
              >
                {strings.docs.setupGuideLink}
              </Link>
            </p>
            <div className="rounded-lg border border-default bg-brand-900/40 px-4 py-3 text-sm">
              <p className="text-foreground">
                {hasClientId ? strings.secrets.googleConfigured : strings.secrets.googleNotConfigured}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {strings.secrets.googleCredentialsHint}{' '}
                <Link to="/secrets" className="text-link hover:underline">
                  {strings.secrets.pageTitle}
                </Link>
              </p>
            </div>
          </SetupStep>
  );

  const connectStep = (
          <SetupStep
            step={2}
            title="Connect Google account"
            description={step1Done ? 'Sign in to authorize Search Console and Analytics access.' : 'Configure Google Cloud credentials on the Secrets page first.'}
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
                  disabled={readOnly || !hasClientId || needsProperty}
                  onClick={() => {
                    void (async () => {
                      const pid = await ensurePropertyIdForOAuth();
                      if (pid == null) {
                        setToast({
                          type: 'error',
                          message:
                            'Set a Site URL under Crawl settings (or pick a site above), then try Connect again.',
                        });
                        return;
                      }
                      const returnTo = window.location.pathname + window.location.search;
                      window.location.href = googlePropertyEndpoints(pid).auth(returnTo);
                    })();
                  }}
                  className="shrink-0 px-5 py-2.5"
                >
                  <GoogleMark />
                  Connect with Google
                </Button>
              </div>
            )}
          </SetupStep>
  );

  const loadingBlock = (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-default bg-brand-800/40 py-12 text-sm text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin text-link" />
      Loading connection status…
    </div>
  );

  const connectNotReadyMessage = (
    <p className="rounded-lg border border-default bg-brand-800/50 px-4 py-6 text-center text-sm text-muted-foreground">
      Connect your Google account in the <span className="font-medium text-foreground">Connect</span> tab first.
    </p>
  );

  const propertiesStep = connected ? (
            <SetupStep
              step={3}
              title="Properties & sync"
              description="Choose Search Console site and Analytics property, then test or fetch data."
              done={Boolean(gscSiteUrl && ga4PropertyId)}
              icon={BarChart3}
            >
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100/90">
                {s.googleSavePropertiesHint}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Load sites from your connected account.</p>
                <Button variant="secondary" onClick={() => void loadGoogleLists()} disabled={loadingGoogleLists} className="py-2">
                  {loadingGoogleLists ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Load properties
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="gscSiteUrl" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Search Console site
                  </label>
                  {googleLists?.gscSites && googleLists.gscSites.length > 0 ? (
                    <select
                      id="gscSiteUrl"
                      value={gscSiteUrl}
                      onChange={(e) => setGscSiteUrl(e.target.value)}
                      onBlur={() => handlePropertiesBlur()}
                      className={selectClassName()}
                    >
                      <option value="">Select site…</option>
                      {gscSiteUrl && !googleLists.gscSites.includes(gscSiteUrl) ? (
                        <option value={gscSiteUrl}>{gscSiteUrl} (saved)</option>
                      ) : null}
                      {googleLists.gscSites.map((site: string) => (
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
                      onBlur={() => handlePropertiesBlur()}
                      placeholder="https://www.example.com/"
                      className={`${selectClassName()} font-mono`}
                    />
                  )}
                </div>

                <div>
                  <label htmlFor="ga4PropertyId" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    GA4 property ID
                  </label>
                  {googleLists?.ga4Properties && googleLists.ga4Properties.length > 0 ? (
                    <select
                      id="ga4PropertyId"
                      value={ga4PropertyId}
                      onChange={(e) => setGa4PropertyId(e.target.value)}
                      onBlur={() => handlePropertiesBlur()}
                      className={selectClassName()}
                    >
                      <option value="">Select property…</option>
                      {ga4PropertyId &&
                      !googleLists.ga4Properties.some((p) => p.id === ga4PropertyId) ? (
                        <option value={ga4PropertyId}>{ga4PropertyId} (saved)</option>
                      ) : null}
                      {googleLists.ga4Properties.map((p) => (
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
                      onBlur={() => handlePropertiesBlur()}
                      placeholder="123456789"
                      className={`${selectClassName()} font-mono`}
                    />
                  )}
                  {googleLists?.ga4ListError ? (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{googleLists.ga4ListError}</p>
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
                    onBlur={() => handlePropertiesBlur()}
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

              <div className="space-y-3 border-t border-muted/60 pt-4">
                <PropertiesSaveFeedback state={propertiesSaveState} dirty={propertiesDirty} />
                <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  onClick={() => void handleSaveProperties()}
                  disabled={readOnly || savingProps || !status?.connected}
                >
                  {savingProps ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {savingProps ? s.googlePropertiesSaving : 'Save properties'}
                </Button>
                <Button variant="secondary" onClick={() => void handleTest()} disabled={readOnly || testing}>
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Test connection
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void handleFetch()}
                  disabled={readOnly || fetching}
                  className="border-green-700/40 text-green-800 hover:bg-green-500/10 dark:text-green-300"
                >
                  {fetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Fetch data now
                </Button>
                </div>
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
  ) : null;

  const linksStep = effectivePropertyId != null && endpoints.linksImport ? (
            <SetupStep
              step={4}
              title={s.gscLinksTitle}
              description={s.gscLinksDescription}
              done={Boolean(linksStatus?.hasData)}
              icon={Link2}
            >
              <p className="text-xs text-muted-foreground">
                <a
                  href={s.gscLinksHelpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-link hover:underline"
                >
                  {s.gscLinksHelpLabel}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </p>
              <p className="text-xs text-muted-foreground">{s.gscLinksUploadHint}</p>

              {loadingLinksStatus ? (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Loading import status…
                </p>
              ) : linksStatus?.hasData && linksStatus.lastImportedAt ? (
                <p className="text-xs text-muted-foreground">
                  {format(s.gscLinksLastImport, {
                    date: new Date(String(linksStatus.lastImportedAt)).toLocaleString(),
                  })}
                  {' · '}
                  {format(s.gscLinksRowCounts, {
                    domains: linksStatus.referringDomainCount ?? 0,
                    pages: linksStatus.topLinkedPageCount ?? 0,
                    sample:
                      (linksStatus.sampleLinkCount ?? 0) + (linksStatus.latestLinkCount ?? 0),
                  })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{s.gscLinksNoData}</p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={linksFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleLinksFile(file);
                  }}
                />
                <Button
                  variant="secondary"
                  disabled={readOnly || uploadingLinks}
                  onClick={() => linksFileInputRef.current?.click()}
                >
                  {uploadingLinks ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  {uploadingLinks ? s.gscLinksUploading : s.gscLinksUploadLabel}
                </Button>
              </div>
              {linksUploadMessage ? (
                <p
                  className={`text-xs ${
                    linksUploadMessage === s.gscLinksUploadSuccess
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {linksUploadMessage}
                </p>
              ) : null}
            </SetupStep>
  ) : null;

  const advancedSection = effectivePropertyId != null ? (
            <div className="overflow-hidden rounded-xl border border-default bg-brand-800/40">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-brand-900/30 hover:text-foreground sm:px-5"
                aria-expanded={showAdvanced}
              >
                <span>Advanced: paste connection token for this site</span>
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
                    helper="For tokens obtained outside this app (e.g. another OAuth tool). Saved on this property only."
                    disabled={savingToken}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => void handleSaveRefreshToken()}
                    disabled={readOnly || savingToken || !refreshToken.trim()}
                  >
                    {savingToken ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    Save token
                  </Button>
                </div>
              ) : null}
            </div>
  ) : null;

  const integrationTabs = [
    { id: 'connect' as const, label: 'Connect', icon: <KeyRound className="h-3.5 w-3.5" aria-hidden /> },
    { id: 'properties' as const, label: 'Properties & sync', icon: <BarChart3 className="h-3.5 w-3.5" aria-hidden /> },
    { id: 'imports' as const, label: 'Imports', icon: <Link2 className="h-3.5 w-3.5" aria-hidden /> },
    { id: 'settings' as const, label: 'Settings', icon: <Settings2 className="h-3.5 w-3.5" aria-hidden /> },
  ];

  if (isTabbed) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 space-y-3 border-b border-muted pb-4">
          {readOnlyBanner}
          {compactContextBar}
          {needsPropertyWarning}
          {toastBlock}
          <ViewTabs
            tabs={integrationTabs}
            activeTab={activeTab}
            onChange={(tabId) => setActiveTab(tabId as IntegrationsTabId)}
            ariaLabel="Integration sections"
            idPrefix="integrations"
            className="border-t border-muted/60 pt-3"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pt-4">
          {loadingStatus ? (
            loadingBlock
          ) : (
            <>
              {activeTab === 'connect' ? (
                <ViewTabPanel idPrefix="integrations" tabId="connect" className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="rounded-lg border border-default bg-brand-800/50 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground flex-1 min-w-0">
                      {infoBannerText}
                    </p>
                    <Link
                      to={integrationGuideHref('google', { from: 'integrations' })}
                      className="shrink-0 text-xs font-medium text-link hover:underline sm:text-sm"
                    >
                      {strings.docs.setupGuideLink}
                    </Link>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {credentialsStep}
                    {connectStep}
                  </div>
                </ViewTabPanel>
              ) : null}
              {activeTab === 'properties' ? (
                <ViewTabPanel idPrefix="integrations" tabId="properties" className="space-y-4">
                  {propertiesStep ?? connectNotReadyMessage}
                </ViewTabPanel>
              ) : null}
              {activeTab === 'imports' ? (
                <ViewTabPanel idPrefix="integrations" tabId="imports" className="space-y-4">
                  {linksStep}
                  <BingWebmasterSection />
                </ViewTabPanel>
              ) : null}
              {activeTab === 'settings' ? (
                <ViewTabPanel idPrefix="integrations" tabId="settings" className="space-y-4">
                  {effectivePropertyId != null ? (
                    <PropertyOpsSection propertyId={effectivePropertyId} />
                  ) : (
                    <p className="rounded-lg border border-default bg-brand-800/50 px-4 py-6 text-center text-sm text-muted-foreground">
                      Select a site above to configure schedules and alerts.
                    </p>
                  )}
                  {advancedSection}
                </ViewTabPanel>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {readOnlyBanner}
      {infoBanner}
      {propertySelector}
      {needsPropertyWarning}
      {titleBlock}
      {toastBlock}
      {loadingStatus ? (
        loadingBlock
      ) : (
        <div className="space-y-4">
          {credentialsStep}
          {connectStep}
          {propertiesStep}
          {linksStep}
          <BingWebmasterSection />
          {effectivePropertyId != null ? (
            <PropertyOpsSection propertyId={effectivePropertyId} />
          ) : null}
          {advancedSection}
        </div>
      )}
    </div>
  );
}
