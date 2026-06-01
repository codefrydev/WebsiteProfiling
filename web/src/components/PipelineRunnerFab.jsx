'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Maximize2, Minimize2, Terminal, X, Save } from 'lucide-react';
import { apiUrl } from '@/lib/publicBase';
import { PIPELINE_JOB_STARTED, pollPipelineJob } from '@/lib/pipelineJobEvents';
import { useReport } from '@/context/useReport';
import { strings } from '@/lib/strings';
import {
  PIPELINE_CONFIG_SECTIONS,
  buildInitialPipelineConfigState,
  validatePipelineRun,
} from '@/lib/pipelineConfigSchema';
import {
  LLM_CONFIG_SECTIONS,
  buildInitialLlmConfigState,
} from '@/lib/llmConfigSchema';

const COMMANDS = [
  { value: '', label: 'Full pipeline (per form config)' },
  { value: 'crawl', label: 'crawl' },
  { value: 'report', label: 'report' },
  { value: 'plot', label: 'plot' },
  { value: 'lighthouse', label: 'lighthouse' },
  { value: 'keywords', label: 'keywords' },
  { value: 'warnings', label: 'warnings' },
  { value: 'enrich', label: 'enrich (analysis + AI)' },
  { value: 'google', label: 'google (fetch GSC & GA4)' },
  { value: 'keywords --enrich-google', label: 'keywords --enrich-google (Keywords Explorer)' },
];

const TAB_RUN = 'run';
const TAB_AI = 'ai';
const TAB_OTHER = 'other';

// Build tab list: de-dupe section ids (safety), AI tab, then Run
function buildMainTabs(unknownKeys) {
  const seen = new Set();
  const tabs = [];
  for (const s of PIPELINE_CONFIG_SECTIONS) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      tabs.push({ id: s.id, label: s.label });
    }
  }
  tabs.push({ id: TAB_AI, label: 'AI' });
  tabs.push({ id: TAB_RUN, label: 'Run' });
  if (unknownKeys.length > 0) {
    tabs.push({ id: TAB_OTHER, label: 'Other' });
  }
  return tabs;
}

// ─── ConfigField ─────────────────────────────────────────────────────────────

/** Single config row for any field type. */
function ConfigField({ field: f, value, disabled, onChange }) {
  const id = `pipe-cfg-${f.key}`;

  const helpEl = f.help ? (
    <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>
  ) : null;

  if (f.type === 'select') {
    const strVal = value == null ? String(f.defaultValue ?? '') : String(value);
    return (
      <div className="min-w-0 sm:col-span-2">
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
          {f.label}
        </label>
        <select
          id={id}
          value={strVal}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
        >
          {(f.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {helpEl}
      </div>
    );
  }

  if (f.type === 'secret') {
    const strVal = value == null ? '' : String(value);
    const placeholder = strVal.startsWith('••••') ? strVal : 'Paste API key (optional if env var set)';
    return (
      <div className="min-w-0 sm:col-span-2">
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
          {f.label}
        </label>
        <input
          id={id}
          type="password"
          autoComplete="off"
          placeholder={placeholder}
          value={strVal.startsWith('••••') ? '' : strVal}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground font-mono"
        />
        {helpEl}
      </div>
    );
  }

  if (f.type === 'bool') {
    const checked = value === true;
    return (
      <div className="sm:col-span-2">
        <label
          htmlFor={id}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-default bg-brand-900/50 px-3 py-2"
        >
          <input
            id={id}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-default text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-foreground">{f.label}</span>
        </label>
        {helpEl}
      </div>
    );
  }

  if (f.type === 'tristate') {
    const strVal = value == null ? 'auto' : String(value);
    return (
      <div className="min-w-0 sm:col-span-2">
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
          {f.label}
        </label>
        <select
          id={id}
          value={strVal}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
        >
          <option value="auto">Auto (follow Enable Search Console)</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
        {helpEl}
      </div>
    );
  }

  if (f.type === 'textarea') {
    const strVal = value == null ? '' : String(value);
    return (
      <div className="min-w-0 sm:col-span-2">
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
          {f.label}
        </label>
        <textarea
          id={id}
          rows={4}
          value={strVal}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground font-mono resize-y"
        />
        {helpEl}
      </div>
    );
  }

  // text / number / float
  const strVal = value == null ? '' : String(value);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
        {f.label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={f.type === 'number' || f.type === 'float' ? 'decimal' : undefined}
        placeholder={f.placeholder || undefined}
        value={strVal}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground font-mono"
      />
      {helpEl}
    </div>
  );
}

// ─── PipelineRunnerFab ────────────────────────────────────────────────────────

/**
 * Floating action button + modal.
 * Settings are loaded from report.db (pipeline_config table) on open
 * (via GET /api/pipeline-config) and persisted back on Save or Run
 * (via PUT /api/pipeline-config or POST /api/run).
 * A shadow pipeline-config.txt is also written next to report.db for CLI use.
 */
export default function PipelineRunnerFab() {
  const { loadReport } = useReport();
  const [showModal, setShowModal] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState(PIPELINE_CONFIG_SECTIONS[0].id);
  const [configState, setConfigState] = useState(buildInitialPipelineConfigState);
  const [llmConfigState, setLlmConfigState] = useState(buildInitialLlmConfigState);
  const [llmConfigMasked, setLlmConfigMasked] = useState({});
  const [unknownKeys, setUnknownKeys] = useState([]);
  const [configPath, setConfigPath] = useState('');
  const [configSource, setConfigSource] = useState(null); // 'store'|'legacy'|'defaults'
  const [legacyBannerDismissed, setLegacyBannerDismissed] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [command, setCommand] = useState('');
  const [pythonExe, setPythonExe] = useState('python');
  const [repoRoot, setRepoRoot] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('');
  const [status, setStatus] = useState('');
  const pollRef = useRef(null);
  const panelRef = useRef(null);
  const firstTabRef = useRef(null);

  const mainTabs = useMemo(() => buildMainTabs(unknownKeys), [unknownKeys]);

  const activeSection = useMemo(
    () => PIPELINE_CONFIG_SECTIONS.find((s) => s.id === activeTab),
    [activeTab],
  );

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (pollRef.stopWatch) {
      pollRef.stopWatch();
      pollRef.stopWatch = null;
    }
  }, []);

  const watchJob = useCallback((jobId, { openModal = false, setCommandFromJob = false, command: jobCommand = '' } = {}) => {
    if (!jobId) return;
    stopPoll();
    setBusy(true);
    setLog('');
    setStatus('running');
    const runCommand = jobCommand || command;
    if (setCommandFromJob && jobCommand) setCommand(jobCommand);
    if (openModal) {
      setShowModal(true);
      setMinimized(false);
    }

    pollRef.stopWatch = pollPipelineJob(jobId, (job) => {
      setLog(job.log || '');
      setStatus(job.status);
      if (job.status === 'success' || job.status === 'error') {
        stopPoll();
        setBusy(false);
        if (job.status === 'success' && (runCommand === 'google' || runCommand.startsWith('google'))) {
          loadReport();
        }
      }
    });
  }, [stopPoll, command, loadReport]);

  useEffect(() => {
    const onJobStarted = (event) => {
      const detail = event.detail || {};
      if (!detail.jobId) return;
      watchJob(detail.jobId, {
        openModal: detail.openRunner !== false,
        setCommandFromJob: true,
        command: detail.command || '',
      });
    };
    window.addEventListener(PIPELINE_JOB_STARTED, onJobStarted);
    return () => window.removeEventListener(PIPELINE_JOB_STARTED, onJobStarted);
  }, [watchJob]);

  useEffect(() => () => stopPoll(), [stopPoll]);

  // Load config from server when modal opens
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [pipeRes, llmRes] = await Promise.all([
        fetch(apiUrl('/pipeline-config')),
        fetch(apiUrl('/llm-config')),
      ]);
      const data = await pipeRes.json().catch(() => ({}));
      const llmData = await llmRes.json().catch(() => ({}));
      if (!pipeRes.ok) throw new Error(data.error || pipeRes.statusText);
      setConfigState(data.state || buildInitialPipelineConfigState());
      setUnknownKeys(Array.isArray(data.unknownKeys) ? data.unknownKeys : []);
      setConfigPath(data.dbPath || data.configPath || '');
      setConfigSource(data.source || 'defaults');
      if (llmRes.ok && llmData.state) {
        setLlmConfigState(llmData.state);
        const masked = {};
        for (const [k, v] of Object.entries(llmData.state)) {
          if (k.endsWith('_masked')) masked[k] = v;
        }
        setLlmConfigMasked(masked);
      } else {
        setLlmConfigState(buildInitialLlmConfigState());
        setLlmConfigMasked({});
      }
      setLegacyBannerDismissed(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setConfigState(buildInitialPipelineConfigState());
      setLlmConfigState(buildInitialLlmConfigState());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showModal && !minimized) {
      loadConfig();
    }
  }, [showModal, minimized, loadConfig]);

  useEffect(() => {
    if (showModal && !minimized) {
      firstTabRef.current?.focus?.();
    }
  }, [showModal, minimized]);

  const setLlmField = useCallback((key, v) => {
    setLlmConfigState((prev) => ({ ...prev, [key]: v }));
    if (key === 'llm_api_key') {
      setLlmConfigMasked((prev) => {
        const next = { ...prev };
        delete next.llm_api_key_masked;
        return next;
      });
    }
  }, []);

  const buildLlmPayload = useCallback(() => ({ ...llmConfigState, ...llmConfigMasked }), [llmConfigState, llmConfigMasked]);

  const saveLlmSettings = useCallback(async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(apiUrl('/llm-config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: buildLlmPayload() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSaveMsg('AI settings saved.');
      setTimeout(() => setSaveMsg(''), 3000);
      const reload = await fetch(apiUrl('/llm-config'));
      const reloaded = await reload.json().catch(() => ({}));
      if (reload.ok && reloaded.state) {
        setLlmConfigState(reloaded.state);
      }
    } catch (e) {
      setSaveMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [buildLlmPayload]);

  const setField = useCallback((key, v) => {
    setConfigState((prev) => ({ ...prev, [key]: v }));
  }, []);

  const resetConfig = useCallback(() => {
    setConfigState(buildInitialPipelineConfigState());
    setSaveMsg('');
  }, []);

  // Save pipeline + AI settings to report.db (PUT)
  const saveSettings = useCallback(async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(apiUrl('/pipeline-config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: configState, unknownKeys }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      const llmRes = await fetch(apiUrl('/llm-config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: buildLlmPayload() }),
      });
      const llmData = await llmRes.json().catch(() => ({}));
      if (!llmRes.ok) throw new Error(llmData.error || llmRes.statusText);
      setConfigPath(data.configPath || data.dbPath || configPath);
      setConfigSource('store');
      setSaveMsg('Saved.');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      setSaveMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [configState, unknownKeys, configPath, buildLlmPayload]);

  // Run pipeline (save first, then spawn)
  const run = useCallback(async () => {
    const validationErrors = validatePipelineRun({ state: configState, command: command || null });
    if (validationErrors.length > 0) {
      setStatus('error');
      setLog(validationErrors.join(' '));
      return;
    }
    stopPoll();
    setBusy(true);
    setLog('');
    setStatus('starting');
    try {
      const res = await fetch(apiUrl('/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: command || null,
          state: configState,
          unknownKeys,
          llmState: buildLlmPayload(),
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
      setStatus('error');
      setLog(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }, [command, configState, unknownKeys, buildLlmPayload, pythonExe, repoRoot, stopPoll, watchJob]);

  const openFab = () => {
    if (minimized && !showModal) {
      setMinimized(false);
      setShowModal(true);
      return;
    }
    setShowModal(true);
  };

  const minimizeToDock = () => {
    setShowModal(false);
    setMinimized(true);
  };

  const showLegacyBanner = configSource === 'legacy' && !legacyBannerDismissed;

  return (
    <>
      <div className="print:hidden fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {minimized ? (
          <div
            role="status"
            aria-live="polite"
            className="flex max-w-[min(100vw-2rem,20rem)] items-center gap-3 rounded-xl border border-default bg-brand-800 px-3 py-2.5 shadow-xl"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-link" aria-hidden />
            ) : (
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${status === 'error' ? 'bg-red-500' : 'bg-muted-foreground'}`}
                aria-hidden
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-bright">Python pipeline</p>
              <p className="truncate text-[11px] text-muted-foreground" title={status || log || ''}>
                {busy
                  ? 'Running in background…'
                  : status === 'error'
                    ? 'Failed — expand for full log'
                    : status
                      ? `Status: ${status}`
                      : log
                        ? 'Expand for details'
                        : 'Idle'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMinimized(false);
                setShowModal(true);
              }}
              className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-brand-700 hover:text-foreground"
              aria-label="Expand pipeline window"
              title="Expand"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={openFab}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
          aria-label={minimized ? 'Expand Python pipeline runner' : 'Open Python pipeline runner'}
          title="Run Python pipeline"
        >
          <Terminal className="h-7 w-7" aria-hidden />
        </button>
      </div>

      {showModal ? (
        <div
          className="print:hidden fixed inset-0 z-[60] flex items-center justify-center"
          role="presentation"
        >
          <div
            className="absolute inset-0 bg-[color:var(--app-overlay)] backdrop-blur-[1px]"
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pipeline-dialog-title"
            className="relative z-[61] flex h-[80vh] max-h-[80vh] w-[80vw] max-w-[80vw] min-h-0 flex-col rounded-xl border border-default bg-brand-800 shadow-2xl"
          >
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-muted px-5 py-4">
              <div>
                <h2 id="pipeline-dialog-title" className="text-lg font-semibold text-bright">
                  Python pipeline
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Settings persist to{' '}
                  <code className="text-[10px]">report.db</code>
                  {' '}(shadow file:{' '}
                  <code className="text-[10px]">pipeline-config.txt</code>
                  ).{' '}
                  {configPath ? (
                    <span title={configPath}>Saved automatically before each run.</span>
                  ) : (
                    'Saved automatically before each run.'
                  )}{' '}
                  Localhost only; one job at a time.
                  {busy ? ' Use minimize to keep working while the job runs.' : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {busy ? (
                  <button
                    type="button"
                    onClick={minimizeToDock}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-brand-700 hover:text-foreground"
                    aria-label="Minimize and continue in background"
                    title="Minimize (job keeps running)"
                  >
                    <Minimize2 className="h-5 w-5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setMinimized(false);
                  }}
                  disabled={busy}
                  className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-brand-700 hover:text-foreground disabled:opacity-40"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Legacy import banner */}
            {showLegacyBanner && (
              <div className="shrink-0 flex items-center gap-3 border-b border-muted bg-brand-900/60 px-5 py-2.5">
                <p className="flex-1 text-xs text-muted-foreground">
                  Settings imported from{' '}
                  <code className="rounded bg-brand-700/50 px-1 py-0.5 text-[10px] text-foreground">
                    pipeline-config.txt
                  </code>
                  {' '}— click{' '}
                  <strong className="font-medium text-foreground">Save settings</strong> to persist to{' '}
                  <code className="rounded bg-brand-700/50 px-1 py-0.5 text-[10px] text-foreground">
                    report.db
                  </code>
                  .
                </p>
                <button
                  type="button"
                  onClick={() => setLegacyBannerDismissed(true)}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-brand-700 hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Load error banner */}
            {loadError && (
              <div className="shrink-0 bg-red-500/10 border-b border-red-500/30 px-5 py-2">
                <p className="text-xs text-red-700 dark:text-red-300">
                  Could not load saved config: {loadError}. Showing schema defaults.
                </p>
              </div>
            )}

            {/* Tabs */}
            <div
              className="flex shrink-0 gap-1 overflow-x-auto border-b border-muted px-3 pt-2"
              role="tablist"
              aria-label="Config sections"
            >
              {mainTabs.map((t, i) => {
                const selected = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    ref={i === 0 ? firstTabRef : undefined}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`pipe-tab-${t.id}`}
                    id={`pipe-tab-btn-${t.id}`}
                    disabled={busy}
                    onClick={() => setActiveTab(t.id)}
                    className={`shrink-0 rounded-t-md border border-b-0 px-3 py-2 text-xs font-medium transition sm:text-sm ${
                      selected
                        ? 'border-default bg-brand-900 text-foreground'
                        : 'border-transparent text-muted-foreground hover:bg-brand-700/80 hover:text-foreground'
                    } disabled:opacity-50`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading settings…</span>
                </div>
              ) : activeTab === TAB_RUN ? (
                <div
                  id={`pipe-tab-${TAB_RUN}`}
                  role="tabpanel"
                  aria-labelledby={`pipe-tab-btn-${TAB_RUN}`}
                  className="space-y-4"
                >
                  <div>
                    <label htmlFor="pipe-step" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Step
                    </label>
                    <select
                      id="pipe-step"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      disabled={busy}
                      className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
                    >
                      {COMMANDS.map((c) => (
                        <option key={c.value || 'full'} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    {command === 'crawl' && (
                      <p className="mt-2 text-xs text-amber-800 dark:text-amber-300/90">
                        {strings.reportSelector.crawlOnlyNote}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="pipe-python" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Python executable
                    </label>
                    <input
                      id="pipe-python"
                      type="text"
                      value={pythonExe}
                      onChange={(e) => setPythonExe(e.target.value)}
                      disabled={busy}
                      placeholder="python"
                      className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="pipe-repo" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Repo root (optional)
                    </label>
                    <input
                      id="pipe-repo"
                      type="text"
                      value={repoRoot}
                      onChange={(e) => setRepoRoot(e.target.value)}
                      disabled={busy}
                      placeholder="Default: parent folder of web/"
                      className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground font-mono"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={resetConfig}
                      disabled={busy}
                      className="rounded-lg border border-default bg-brand-900 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-brand-700 disabled:opacity-50"
                    >
                      Reset form defaults
                    </button>
                  </div>
                </div>
              ) : activeTab === TAB_AI ? (
                <div
                  id={`pipe-tab-${TAB_AI}`}
                  role="tabpanel"
                  aria-labelledby={`pipe-tab-btn-${TAB_AI}`}
                  className="space-y-6"
                >
                  <p className="text-xs text-muted-foreground">
                    AI enrichment settings are stored only in{' '}
                    <code className="text-[10px]">report.db</code> (llm_config) — never in
                    pipeline-config.txt. Configure provider and tasks here before running report.
                  </p>
                  {LLM_CONFIG_SECTIONS.map((section) => (
                    <div key={section.id}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {section.label}
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {section.fields.map((f) => (
                          <ConfigField
                            key={f.key}
                            field={f}
                            value={llmConfigState[f.key]}
                            disabled={busy}
                            onChange={(v) => setLlmField(f.key, v)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={saveLlmSettings}
                    disabled={busy || saving || loading}
                    className="flex items-center gap-1.5 rounded-lg border border-default bg-brand-900 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving ? 'Saving…' : 'Save AI settings'}
                  </button>
                </div>
              ) : activeTab === TAB_OTHER ? (
                <div
                  id={`pipe-tab-${TAB_OTHER}`}
                  role="tabpanel"
                  aria-labelledby={`pipe-tab-btn-${TAB_OTHER}`}
                  className="space-y-2"
                >
                  <p className="text-xs text-muted-foreground">
                    These keys are not in the UI schema but were found in your config file. They are
                    preserved on save.
                  </p>
                  <div className="rounded-lg border border-default bg-brand-900 p-3 font-mono text-xs text-foreground space-y-1">
                    {unknownKeys.map(({ key, value }) => (
                      <div key={key}>
                        <span className="text-link">{key}</span>
                        {' = '}
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeSection ? (
                <div
                  id={`pipe-tab-${activeSection.id}`}
                  role="tabpanel"
                  aria-labelledby={`pipe-tab-btn-${activeSection.id}`}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {activeSection.fields.map((f) => (
                    <ConfigField
                      key={f.key}
                      field={f}
                      value={configState[f.key]}
                      disabled={busy}
                      onChange={(v) => setField(f.key, v)}
                    />
                  ))}
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="shrink-0 space-y-3 border-t border-muted px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={run}
                  disabled={busy || loading}
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {busy ? 'Running…' : 'Run pipeline'}
                </button>
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={busy || saving || loading}
                  className="flex items-center gap-1.5 rounded-lg border border-default bg-brand-900 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-brand-700 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Saving…' : 'Save settings'}
                </button>
                {busy ? (
                  <button
                    type="button"
                    onClick={minimizeToDock}
                    className="rounded-lg border border-default bg-brand-900 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-brand-700"
                  >
                    Minimize
                  </button>
                ) : null}
                {status ? (
                  <span className="text-xs text-muted-foreground">
                    Status: <span className="font-medium text-foreground">{status}</span>
                  </span>
                ) : null}
                {saveMsg ? (
                  <span className={`text-xs ${saveMsg.startsWith('Save failed') ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                    {saveMsg}
                  </span>
                ) : null}
              </div>
              {log ? (
                <pre className="max-h-40 overflow-auto rounded-lg border border-default bg-brand-900 p-3 text-[11px] font-mono whitespace-pre-wrap break-all text-foreground">
                  {log}
                </pre>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
