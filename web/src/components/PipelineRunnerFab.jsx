'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Maximize2, Minimize2, Terminal, X } from 'lucide-react';
import { apiUrl } from '@/lib/publicBase';
import {
  PIPELINE_CONFIG_SECTIONS,
  buildInitialPipelineConfigState,
  serializePipelineConfig,
} from '@/lib/pipelineConfigSchema';

const COMMANDS = [
  { value: '', label: 'Full pipeline (per form config)' },
  { value: 'crawl', label: 'crawl' },
  { value: 'report', label: 'report' },
  { value: 'plot', label: 'plot' },
  { value: 'lighthouse', label: 'lighthouse' },
  { value: 'keywords', label: 'keywords' },
  { value: 'warnings', label: 'warnings' },
  { value: 'enrich', label: 'enrich' },
];

const TAB_RUN = 'run';

const MAIN_TABS = [
  ...PIPELINE_CONFIG_SECTIONS.map((s) => ({ id: s.id, label: s.label })),
  { id: TAB_RUN, label: 'Run' },
];

/** Single config row: text/number/float or checkbox for bool. */
function ConfigField({ field: f, value, disabled, onChange }) {
  const id = `pipe-cfg-${f.key}`;
  if (f.type === 'bool') {
    const checked = value === true;
    return (
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-default bg-brand-900/50 px-3 py-2 sm:col-span-2"
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
    );
  }
  const strVal = value == null ? '' : String(value);
  const inputType = f.type === 'float' || f.type === 'number' ? 'text' : 'text';
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
        {f.label}
      </label>
      <input
        id={id}
        type={inputType}
        inputMode={f.type === 'number' || f.type === 'float' ? 'decimal' : undefined}
        value={strVal}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground font-mono"
      />
    </div>
  );
}

/**
 * Floating action button + modal: tabbed form for all `input.txt` keys, serialized and passed to Python via `--config` (temp file at repo root).
 */
export default function PipelineRunnerFab() {
  const [showModal, setShowModal] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState(PIPELINE_CONFIG_SECTIONS[0].id);
  const [configState, setConfigState] = useState(buildInitialPipelineConfigState);
  const [command, setCommand] = useState('');
  const [pythonExe, setPythonExe] = useState('python');
  const [repoRoot, setRepoRoot] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('');
  const [status, setStatus] = useState('');
  const pollRef = useRef(null);
  const panelRef = useRef(null);
  const firstTabRef = useRef(null);

  const activeSection = useMemo(
    () => PIPELINE_CONFIG_SECTIONS.find((s) => s.id === activeTab),
    [activeTab],
  );

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPoll();
  }, [stopPoll]);

  useEffect(() => {
    if (!showModal && !minimized) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (showModal && busy) {
        setShowModal(false);
        setMinimized(true);
      } else if (showModal && !busy) {
        setShowModal(false);
        setMinimized(false);
      } else if (minimized && !busy) {
        setMinimized(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showModal, minimized, busy]);

  useEffect(() => {
    if (showModal && !minimized) {
      firstTabRef.current?.focus?.();
    }
  }, [showModal, minimized]);

  const setField = useCallback((key, v) => {
    setConfigState((prev) => ({ ...prev, [key]: v }));
  }, []);

  const resetConfig = useCallback(() => {
    setConfigState(buildInitialPipelineConfigState());
  }, []);

  const run = async () => {
    stopPoll();
    setBusy(true);
    setLog('');
    setStatus('starting');
    const configContent = serializePipelineConfig(configState);
    try {
      const res = await fetch(apiUrl('/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: command || null,
          configContent,
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
      const jobPath = `/jobs/${encodeURIComponent(jobId)}`;
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(apiUrl(jobPath));
          const j = await r.json();
          if (!r.ok) {
            stopPoll();
            setBusy(false);
            setStatus('error');
            setLog(j.error || r.statusText);
            return;
          }
          setLog(j.log || '');
          setStatus(j.status);
          if (j.status === 'success' || j.status === 'error') {
            stopPoll();
            setBusy(false);
            if (j.status === 'success') {
              setShowModal(false);
              setMinimized(false);
              window.location.reload();
            }
          }
        } catch (e) {
          stopPoll();
          setBusy(false);
          setStatus('error');
          setLog(e instanceof Error ? e.message : String(e));
        }
      }, 1000);
    } catch (e) {
      setStatus('error');
      setLog(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

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
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-400" aria-hidden />
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
          className="print:hidden fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-[color:var(--app-overlay)] backdrop-blur-[1px]"
            aria-label="Close dialog"
            onClick={() => {
              if (!busy) {
                setShowModal(false);
                setMinimized(false);
              }
            }}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pipeline-dialog-title"
            className="relative z-[61] flex max-h-[min(92vh,44rem)] w-full max-w-3xl flex-col rounded-xl border border-default bg-brand-800 shadow-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-muted px-5 py-4">
              <div>
                <h2 id="pipeline-dialog-title" className="text-lg font-semibold text-bright">
                  Python pipeline
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Edit all settings (same keys as <code className="text-[10px]">input.txt</code>). On run, a temp config is
                  written at the <strong>repo root</strong> so <code className="text-[10px]">report.db</code> matches what this
                  app loads. Localhost only; one job at a time.
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

            <div
              className="flex shrink-0 gap-1 overflow-x-auto border-b border-muted px-3 pt-2"
              role="tablist"
              aria-label="Config sections"
            >
              {MAIN_TABS.map((t, i) => {
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

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {activeTab === TAB_RUN ? (
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

            <div className="shrink-0 space-y-3 border-t border-muted px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={run}
                  disabled={busy}
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {busy ? 'Running…' : 'Run pipeline'}
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

