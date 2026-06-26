
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { PipelineConfigSource, PipelineJobStatus } from '@/types/api';
import type { LlmConfigState, PipelineConfigState } from '@/types/api';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { PIPELINE_JOB_STARTED, pollPipelineJob } from '@/lib/pipelineJobEvents';
import { formatPipelineJobLog, logPipelineFailure } from '@/lib/pipelineDebug';
import { currentPathForReturn, readPipelineReturnPath, storePipelineReturnPath, buildPipelineHref } from '@/lib/pipelineReturn';
import { deriveSiteNameFromStartUrl } from '@/lib/domainSlug';
import { useOptionalReport } from '@/context/useReport';
import { strings, format } from '@/lib/strings';
import {
  type BrowserCrawlStatus,
  crawlRenderModeUsesBrowser,
  fetchBrowserCrawlStatus,
} from '@/lib/browserCrawlStatus';
import {
  buildInitialPipelineConfigState,
  validatePipelineRun,
  validateRequiredPipelineFields,
} from '@/lib/pipelineConfigSchema';
import { buildInitialLlmConfigState, normalizeLlmConfigState } from '@/lib/llmConfigSchema';
import { isLlmApiKeyMaskedStored, isLlmProviderApiKeyField } from '@/lib/llmProviderApiKeys';
import { resolvePipelineRunState } from '@/lib/pipelineRunPreview';
import { applyLlmModelChange, applyLlmProviderChange } from '@/lib/llmProviderModels';
import {
  flatStateToLlmSettingsPatch,
  llmSettingsDtoToFlatState,
  type LlmSettingsGetResponse,
} from '@/lib/llmSettingsMapper';
import {
  applyPreset,
  commandToPresetId,
  DEFAULT_PRESET_ID,
  getPresetById,
  type PipelinePresetId,
} from '@/components/pipeline/pipelinePresets';
import { applyCrawlPreset, isCrawlPresetId, type CrawlPresetId } from '@/lib/crawlPresets';
import { loadPipelineRunnerPrefs, savePipelineRunnerPrefs } from '@/lib/pipelineRunnerPrefs';
import { initClientPreferences } from '@/lib/clientPreferences';

const s = strings.pipelineRunner;

export type PipelineTab = 'run' | 'settings';

export interface PipelineContextValue {
  presetId: PipelinePresetId;
  customCommand: string;
  configState: PipelineConfigState;
  llmConfigState: LlmConfigState;
  /** Server truth: active cloud provider has API key in DB or env (from GET /llm-settings). */
  llmApiKeyConfigured: boolean;
  configSource: PipelineConfigSource | null;
  loadError: string;
  /** Non-fatal: pipeline loaded but GET /llm-settings failed. */
  llmLoadWarning: string;
  loading: boolean;
  /** True after the first pipeline/LLM config fetch completes. */
  configLoaded: boolean;
  saving: boolean;
  saveMsg: string;
  pythonExe: string;
  repoRoot: string;
  busy: boolean;
  stopping: boolean;
  activeJobId: string;
  log: string;
  logTruncated: boolean;
  status: PipelineJobStatus | '';
  backgroundMode: boolean;
  startUrl: string;
  browserCrawlStatus: BrowserCrawlStatus | null;
  browserCrawlChecking: boolean;
  refreshBrowserCrawlStatus: () => Promise<void>;
  setPresetId: (id: PipelinePresetId) => void;
  setCustomCommand: (value: string) => void;
  setField: (key: string, value: string | boolean) => void;
  setLlmField: (key: string, value: string | boolean) => void;
  setPythonExe: (value: string) => void;
  setRepoRoot: (value: string) => void;
  handleStartUrlChange: (value: string) => void;
  handlePresetChange: (id: PipelinePresetId) => void;
  crawlPresetId: CrawlPresetId | '';
  handleCrawlPresetChange: (id: CrawlPresetId) => void;
  resetConfig: () => void;
  loadConfig: () => Promise<void>;
  saveSettings: () => Promise<boolean>;
  saveLlmModel: (model: string) => Promise<boolean>;
  saveLlmProvider: (provider: string) => Promise<boolean>;
  saveLlmChatUnlimitedTools: (enabled: boolean) => Promise<boolean>;
  run: () => Promise<void>;
  cancelJob: () => Promise<boolean>;
  continueInBackground: () => void;
  openPipelinePage: (tab?: PipelineTab) => void;
}

const PipelineContext = createContext<PipelineContextValue | null>(null);

export function usePipeline(): PipelineContextValue {
  const ctx = useContext(PipelineContext);
  if (!ctx) {
    throw new Error('usePipeline must be used within PipelineProvider');
  }
  return ctx;
}

export function useOptionalPipeline(): PipelineContextValue | null {
  return useContext(PipelineContext);
}

export function PipelineProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const report = useOptionalReport();
  const [presetId, setPresetId] = useState<PipelinePresetId>(DEFAULT_PRESET_ID);
  const [customCommand, setCustomCommand] = useState('');
  const [configState, setConfigState] = useState(buildInitialPipelineConfigState);
  const [llmConfigState, setLlmConfigState] = useState(buildInitialLlmConfigState);
  const [llmApiKeyConfigured, setLlmApiKeyConfigured] = useState(false);
  const [llmConfigMasked, setLlmConfigMasked] = useState<Record<string, boolean>>({});
  const [configPath, setConfigPath] = useState('');
  const [configSource, setConfigSource] = useState<PipelineConfigSource | null>(null);
  const [loadError, setLoadError] = useState('');
  const [llmLoadWarning, setLlmLoadWarning] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [pythonExe, setPythonExe] = useState(() => loadPipelineRunnerPrefs().pythonExe);
  const [repoRoot, setRepoRoot] = useState(() => loadPipelineRunnerPrefs().repoRoot);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [log, setLog] = useState('');
  const [logTruncated, setLogTruncated] = useState(false);
  const [status, setStatus] = useState<PipelineJobStatus | ''>('');
  const [backgroundMode, setBackgroundMode] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [browserCrawlStatus, setBrowserCrawlStatus] = useState<BrowserCrawlStatus | null>(null);
  const [browserCrawlChecking, setBrowserCrawlChecking] = useState(false);
  const [crawlPresetId, setCrawlPresetId] = useState<CrawlPresetId | ''>('');
  const pollStopRef = useRef<(() => void) | null>(null);
  const activeJobIdRef = useRef('');
  const saveMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (saveMsgTimerRef.current) clearTimeout(saveMsgTimerRef.current);
  }, []);

  const refreshBrowserCrawlStatus = useCallback(async () => {
    setBrowserCrawlChecking(true);
    try {
      const status = await fetchBrowserCrawlStatus();
      setBrowserCrawlStatus(status);
    } finally {
      setBrowserCrawlChecking(false);
    }
  }, []);

  const crawlRenderMode = String(configState.crawl_render_mode ?? 'static');
  useEffect(() => {
    if (!crawlRenderModeUsesBrowser({ crawl_render_mode: crawlRenderMode })) {
      setBrowserCrawlStatus(null);
      return;
    }
    void refreshBrowserCrawlStatus();
  }, [crawlRenderMode, refreshBrowserCrawlStatus]);

  useEffect(() => {
    void initClientPreferences().then((prefs) => {
      setPythonExe(prefs.pipelinePythonExe);
      setRepoRoot(prefs.pipelineRepoRoot);
    });
  }, []);

  useEffect(() => {
    savePipelineRunnerPrefs({ pythonExe, repoRoot });
  }, [pythonExe, repoRoot]);

  const effectiveCommand = customCommand.trim() || getPresetById(presetId).command;

  const stopPoll = useCallback(() => {
    if (pollStopRef.current) {
      pollStopRef.current();
      pollStopRef.current = null;
    }
  }, []);

  const openPipelinePage = useCallback(
    (tab: PipelineTab = 'run') => {
      setBackgroundMode(false);
      navigate(buildPipelineHref({ tab }));
    },
    [navigate],
  );

  const watchJob = useCallback(
    (
      jobId: string,
      {
      openPipeline = false,
      jobCommand = '',
    }: {
      openPipeline?: boolean;
      jobCommand?: string;
    } = {},
  ) => {
      if (!jobId) return;
      stopPoll();
      activeJobIdRef.current = jobId;
      setBusy(true);
      setStopping(false);
      setLog('');
      setLogTruncated(false);
      setStatus('running');
      setBackgroundMode(false);
      if (jobCommand) {
        const matched = getPresetById(commandToPresetId(jobCommand));
        if (matched.command === jobCommand) {
          setPresetId(matched.id);
          setCustomCommand('');
        } else {
          setCustomCommand(jobCommand);
        }
      }
      if (openPipeline) {
        storePipelineReturnPath(currentPathForReturn());
        navigate('/pipeline');
      }

      pollStopRef.current = pollPipelineJob(jobId, (job) => {
        const displayLog = formatPipelineJobLog(job.log, job.error);
        setLog(displayLog);
        setLogTruncated(Boolean(job.logTruncated));
        setStatus(job.status);
        if (job.status === 'success' || job.status === 'error') {
          stopPoll();
          activeJobIdRef.current = '';
          setBusy(false);
          setStopping(false);
          if (job.status === 'error') {
            logPipelineFailure('Job finished with error', {
              jobId,
              command: jobCommand || null,
              error: job.error,
              logLength: job.log?.length ?? 0,
              log: job.log || displayLog,
            });
          } else {
            report?.refreshReports();
          }
        }
      });
    },
    [stopPoll, report, navigate],
  );

  useEffect(() => {
    const onJobStarted = (event: Event) => {
      const detail =
        (event as CustomEvent<{ jobId?: string; openRunner?: boolean; command?: string }>).detail ||
        {};
      if (!detail.jobId) return;
      watchJob(detail.jobId, {
        openPipeline: detail.openRunner !== false,
        jobCommand: detail.command || '',
      });
    };
    window.addEventListener(PIPELINE_JOB_STARTED, onJobStarted);
    return () => window.removeEventListener(PIPELINE_JOB_STARTED, onJobStarted);
  }, [watchJob]);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setLlmLoadWarning('');
    try {
      const [pipeRes, llmRes] = await Promise.all([
        apiFetch(apiUrl('/pipeline-settings')),
        apiFetch(apiUrl('/llm-settings')),
      ]);
      const data = await pipeRes.json().catch(() => ({}));
      const llmData = (await llmRes.json().catch(() => ({}))) as LlmSettingsGetResponse;
      if (!pipeRes.ok) throw new Error(data.error || pipeRes.statusText);
      const loaded = data.state || buildInitialPipelineConfigState();
      const siteName = String(loaded.site_name ?? '').trim();
      const startUrl = String(loaded.start_url ?? '').trim();
      if (!siteName && startUrl) {
        loaded.site_name = deriveSiteNameFromStartUrl(startUrl);
      } else if (!siteName) {
        loaded.site_name = 'Site';
      }
      setConfigState(loaded);
      setConfigPath(data.dbPath || data.configPath || '');
      setConfigSource(data.source || 'defaults');
      if (llmRes.ok && llmData.settings) {
        const flat = llmSettingsDtoToFlatState(llmData.settings);
        setLlmConfigState(normalizeLlmConfigState(flat));
        setLlmApiKeyConfigured(Boolean(llmData.apiKeyConfigured));
        const masked: Record<string, boolean> = {};
        for (const profile of llmData.settings.providers ?? []) {
          const provider = profile.provider?.trim().toLowerCase();
          if (provider && profile.apiKey === '*') {
            masked[`llm_api_key_${provider}_masked`] = true;
          }
        }
        setLlmConfigMasked(masked);
      } else {
        const llmBody = llmData as LlmSettingsGetResponse & { error?: string };
        const llmMsg = String(llmBody.error || llmRes.statusText || 'LLM settings unavailable');
        setLlmLoadWarning(format(s.llmLoadWarning, { message: llmMsg }));
        setLlmConfigState(buildInitialLlmConfigState());
        setLlmApiKeyConfigured(false);
        setLlmConfigMasked({});
      }
      setConfigLoaded(true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setLlmLoadWarning('');
      setConfigState(buildInitialPipelineConfigState());
      setLlmConfigState(buildInitialLlmConfigState());
      setLlmApiKeyConfigured(false);
      setConfigLoaded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!configLoaded) {
      void loadConfig();
    }
  }, [configLoaded, loadConfig]);

  useEffect(() => {
    const onLlmConfigChanged = () => {
      void loadConfig();
    };
    window.addEventListener('llm-settings-changed', onLlmConfigChanged);
    return () => window.removeEventListener('llm-settings-changed', onLlmConfigChanged);
  }, [loadConfig]);

  /** Resume polling the active DB-backed job after refresh or server restart. */
  useEffect(() => {
    if (!configLoaded || busy || status === 'running') return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(apiUrl('/jobs?limit=1'));
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          const errMsg = String(data.error || res.statusText || s.resumeJobFailed);
          setLoadError(errMsg);
          logPipelineFailure('Resume active job failed', { status: res.status, error: errMsg });
          return;
        }
        const active = data.active as { id?: string; jobType?: string; status?: string } | null;
        if (active?.id && active.status === 'running') {
          watchJob(active.id, { openPipeline: false, jobCommand: active.jobType || '' });
        }
      } catch (e) {
        if (!cancelled) {
          const errMsg = e instanceof Error ? e.message : s.resumeJobFailed;
          setLoadError(errMsg);
          logPipelineFailure('Resume active job failed', { error: e, message: errMsg });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configLoaded, busy, status, watchJob]);

  const setLlmField = useCallback((key: string, v: string | boolean) => {
    setLlmConfigState((prev) => {
      if (key === 'llm_provider') {
        return applyLlmProviderChange(prev, String(v));
      }
      if (key === 'llm_model') {
        return applyLlmModelChange(prev, String(v));
      }
      return { ...prev, [key]: v };
    });
    if (key === 'llm_api_key') {
      setLlmConfigMasked((prev) => {
        const next = { ...prev };
        delete next.llm_api_key_masked;
        return next;
      });
    }
  }, []);

  const buildLlmPayload = useCallback(
    (overrides?: Partial<LlmConfigState>) => {
      const merged = { ...llmConfigState, ...llmConfigMasked, ...overrides };
      const payload: Record<string, string | boolean> = {};

      for (const [key, value] of Object.entries(merged)) {
        if (key.endsWith('_masked')) {
          continue;
        }
        if (key === 'llm_api_key' || isLlmProviderApiKeyField(key)) {
          const trimmed = String(value ?? '').trim();
          if (!trimmed) {
            continue;
          }
          payload[key] = isLlmApiKeyMaskedStored(value) ? '*' : trimmed;
          continue;
        }
        if (value === undefined || value === null) {
          continue;
        }
        payload[key] = value;
      }

      return payload;
    },
    [llmConfigState, llmConfigMasked],
  );

  const setField = useCallback((key: string, v: string | boolean) => {
    setConfigState((prev) => ({ ...prev, [key]: v }));
  }, []);

  const handlePresetChange = useCallback((id: PipelinePresetId) => {
    setPresetId(id);
    setCustomCommand('');
    setConfigState((prev) => {
      const { configState: next } = applyPreset(id, prev);
      return next;
    });
  }, []);

  const applyPropertyCrawlPreset = useCallback(async (startUrlValue: string) => {
    const trimmed = startUrlValue.trim();
    if (!trimmed || !trimmed.includes('.')) return;
    try {
      const res = await apiFetch(apiUrl(`/properties/resolve?startUrl=${encodeURIComponent(trimmed)}`));
      const data = await res.json().catch(() => ({}));
      const preset = String(data.default_crawl_preset || '').trim();
      if (preset && isCrawlPresetId(preset)) {
        setCrawlPresetId(preset);
        setConfigState((prev) => applyCrawlPreset(preset, prev));
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  const handleStartUrlChange = useCallback((value: string) => {
    setConfigState((prev) => {
      const currentSiteName = String(prev.site_name ?? '').trim();
      const previousDerived = deriveSiteNameFromStartUrl(String(prev.start_url ?? ''));
      const shouldSyncSiteName =
        !currentSiteName ||
        currentSiteName === 'Site' ||
        currentSiteName === previousDerived;
      if (shouldSyncSiteName) {
        return {
          ...prev,
          start_url: value,
          site_name: deriveSiteNameFromStartUrl(value),
        };
      }
      return { ...prev, start_url: value };
    });
    void applyPropertyCrawlPreset(value);
  }, [applyPropertyCrawlPreset]);

  const handleCrawlPresetChange = useCallback((preset: CrawlPresetId) => {
    setCrawlPresetId(preset);
    setConfigState((prev) => applyCrawlPreset(preset, prev));
    const propertyId = Number(configState.active_property_id || 0);
    if (propertyId > 0) {
      void apiFetch(apiUrl(`/properties/${propertyId}/preset`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setSaveMsg(String(data.error || s.presetSaveFailed));
          }
        })
        .catch(() => setSaveMsg(s.presetSaveFailed));
    }
  }, [configState.active_property_id]);

  const resetConfig = useCallback(() => {
    setConfigState(buildInitialPipelineConfigState());
    setSaveMsg('');
  }, []);

  const saveSettings = useCallback(async (): Promise<boolean> => {
    const requiredErrors = validateRequiredPipelineFields(configState);
    if (requiredErrors.length > 0) {
      setSaveMsg(requiredErrors.join(' '));
      return false;
    }
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await apiFetch(apiUrl('/pipeline-settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: configState }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      const llmRes = await apiFetch(apiUrl('/llm-settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flatStateToLlmSettingsPatch(llmConfigState)),
      });
      const llmData = await llmRes.json().catch(() => ({}));
      if (!llmRes.ok) throw new Error(llmData.error || llmRes.statusText);
      if (typeof llmData.apiKeyConfigured === 'boolean') {
        setLlmApiKeyConfigured(llmData.apiKeyConfigured);
      }
      setConfigPath(data.configPath || data.dbPath || configPath);
      setConfigSource('store');
      setSaveMsg(s.saved);
      if (saveMsgTimerRef.current) clearTimeout(saveMsgTimerRef.current);
      saveMsgTimerRef.current = setTimeout(() => setSaveMsg(''), 3000);
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setSaveMsg(format(s.saveFailed, { message }));
      return false;
    } finally {
      setSaving(false);
    }
  }, [configState, configPath, buildLlmPayload]);

  const saveLlmModel = useCallback(
    async (model: string): Promise<boolean> => {
      const trimmed = model.trim();
      if (!trimmed) return false;
      const nextState = applyLlmModelChange(llmConfigState, trimmed);
      setLlmConfigState(nextState);
      setSaving(true);
      try {
        const res = await apiFetch(apiUrl('/llm-settings'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flatStateToLlmSettingsPatch(nextState)),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        if (typeof data.apiKeyConfigured === 'boolean') {
          setLlmApiKeyConfigured(data.apiKeyConfigured);
        }
        setLlmLoadWarning('');
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setSaveMsg(format(s.saveFailed, { message }));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [llmConfigState, llmConfigMasked],
  );

  const saveLlmProvider = useCallback(
    async (provider: string): Promise<boolean> => {
      const trimmed = provider.trim();
      if (!trimmed || trimmed === 'none') return false;
      const nextState = applyLlmProviderChange(llmConfigState, trimmed);
      setLlmConfigState(nextState);
      setSaving(true);
      try {
        const res = await apiFetch(apiUrl('/llm-settings'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flatStateToLlmSettingsPatch(nextState)),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        if (typeof data.apiKeyConfigured === 'boolean') {
          setLlmApiKeyConfigured(data.apiKeyConfigured);
        }
        setLlmLoadWarning('');
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setSaveMsg(format(s.saveFailed, { message }));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [llmConfigState, llmConfigMasked],
  );

  const saveLlmChatUnlimitedTools = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      setLlmConfigState((prev) => ({ ...prev, llm_chat_unlimited_tool_rounds: enabled }));
      setSaving(true);
      try {
        const res = await apiFetch(apiUrl('/llm-settings'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            flatStateToLlmSettingsPatch({
              ...llmConfigState,
              llm_chat_unlimited_tool_rounds: enabled,
            }),
          ),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        if (typeof data.apiKeyConfigured === 'boolean') {
          setLlmApiKeyConfigured(data.apiKeyConfigured);
        }
        return true;
      } catch {
        return false;
      } finally {
        setSaving(false);
      }
    },
    [buildLlmPayload],
  );

  const run = useCallback(async () => {
    const command = effectiveCommand || null;
    const runState = resolvePipelineRunState(presetId, configState, crawlPresetId);
    let browserStatus = browserCrawlStatus;
    if (crawlRenderModeUsesBrowser(runState)) {
      browserStatus = await fetchBrowserCrawlStatus();
      setBrowserCrawlStatus(browserStatus);
    }
    const validationErrors = validatePipelineRun({
      state: runState,
      command,
      browserStatus,
    });
    if (validationErrors.length > 0) {
      const message = validationErrors.join(' ');
      logPipelineFailure('Run validation failed', { command, errors: validationErrors });
      setStatus('error');
      setLog(message);
      return;
    }
    stopPoll();
    setBusy(true);
    setLog('');
    setLogTruncated(false);
    setStatus('starting');
    setBackgroundMode(false);
    try {
      const llmRes = await apiFetch(apiUrl('/llm-settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flatStateToLlmSettingsPatch(llmConfigState)),
      });
      const llmData = await llmRes.json().catch(() => ({}));
      if (!llmRes.ok) throw new Error(llmData.error || llmRes.statusText);
      if (typeof llmData.apiKeyConfigured === 'boolean') {
        setLlmApiKeyConfigured(llmData.apiKeyConfigured);
      }

      const res = await apiFetch(apiUrl('/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          state: runState,
          python: pythonExe.trim() || undefined,
          repoRoot: repoRoot.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      const jobId = data.jobId;
      if (typeof jobId !== 'string' || !jobId.trim()) {
        throw new Error('Server did not return a job id');
      }
      setConfigSource('store');
      watchJob(jobId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logPipelineFailure('Failed to start job', {
        command,
        message,
        error: e,
      });
      setStatus('error');
      setLog(message);
      activeJobIdRef.current = '';
      setBusy(false);
    }
  }, [
    effectiveCommand,
    presetId,
    configState,
    crawlPresetId,
    buildLlmPayload,
    pythonExe,
    repoRoot,
    browserCrawlStatus,
    stopPoll,
    watchJob,
  ]);

  const continueInBackground = useCallback(() => {
    setBackgroundMode(true);
    navigate(readPipelineReturnPath());
  }, [navigate]);

  const cancelJob = useCallback(async (): Promise<boolean> => {
    const jobId = activeJobIdRef.current;
    if (!jobId || stopping) return false;
    setStopping(true);
    try {
      const res = await apiFetch(apiUrl(`/jobs/${encodeURIComponent(jobId)}/cancel`), {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof data.error === 'string' ? data.error : res.statusText;
        logPipelineFailure('Cancel job failed', { jobId, message, status: res.status });
        setStatus('error');
        setLog(format(s.stopJobFailed, { message }));
        stopPoll();
        activeJobIdRef.current = '';
        setBusy(false);
        return false;
      }
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logPipelineFailure('Cancel job failed', { jobId, message, error: e });
      setStatus('error');
      setLog(format(s.stopJobFailed, { message }));
      stopPoll();
      activeJobIdRef.current = '';
      setBusy(false);
      return false;
    } finally {
      setStopping(false);
    }
  }, [stopPoll, stopping]);

  const value = useMemo<PipelineContextValue>(
    () => ({
      presetId,
      customCommand,
      configState,
      llmConfigState,
      llmApiKeyConfigured,
      configSource,
      loadError,
      llmLoadWarning,
      loading,
      configLoaded,
      saving,
      saveMsg,
      pythonExe,
      repoRoot,
      busy,
      stopping,
      activeJobId: activeJobIdRef.current,
      log,
      logTruncated,
      status,
      backgroundMode,
      startUrl: String(configState.start_url ?? ''),
      browserCrawlStatus,
      browserCrawlChecking,
      refreshBrowserCrawlStatus,
      setPresetId,
      setCustomCommand,
      setField,
      setLlmField,
      setPythonExe,
      setRepoRoot,
      handleStartUrlChange,
      handlePresetChange,
      crawlPresetId,
      handleCrawlPresetChange,
      resetConfig,
      loadConfig,
      saveSettings,
      saveLlmModel,
      saveLlmProvider,
      saveLlmChatUnlimitedTools,
      run,
      cancelJob,
      continueInBackground,
      openPipelinePage,
    }),
    [
      presetId,
      customCommand,
      configState,
      llmConfigState,
      llmApiKeyConfigured,
      configSource,
      loadError,
      llmLoadWarning,
      loading,
      configLoaded,
      saving,
      saveMsg,
      pythonExe,
      repoRoot,
      busy,
      stopping,
      log,
      logTruncated,
      status,
      backgroundMode,
      browserCrawlStatus,
      browserCrawlChecking,
      refreshBrowserCrawlStatus,
      setLlmField,
      handleStartUrlChange,
      handlePresetChange,
      crawlPresetId,
      handleCrawlPresetChange,
      resetConfig,
      loadConfig,
      saveSettings,
      saveLlmModel,
      saveLlmProvider,
      saveLlmChatUnlimitedTools,
      run,
      cancelJob,
      continueInBackground,
      openPipelinePage,
    ],
  );

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}
