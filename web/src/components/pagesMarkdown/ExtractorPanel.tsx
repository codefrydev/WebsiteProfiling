'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Play, RefreshCw, Wifi } from 'lucide-react';
import { apiUrl } from '@/lib/publicBase';
interface PageMarkdownRunRow {
  id: number;
  created_at: string | null;
  start_url: string;
  html_page_count: number;
  markdown_page_count: number;
}

interface ExtractorPanelProps {
  propertyId: number | null;
  selectedRunId: number | null;
  onRunSelect: (runId: number) => void;
  onExtracted: () => void;
  onCaptureStart: (jobId: string) => void;
  captureJobId: string | null;
  captureJobDone: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function ExtractorPanel({
  propertyId,
  selectedRunId,
  onRunSelect,
  onExtracted,
  onCaptureStart,
  captureJobId,
  captureJobDone,
}: ExtractorPanelProps) {
  const [runs, setRuns] = useState<PageMarkdownRunRow[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);

  const [strategy, setStrategy] = useState<'main_only' | 'full_body'>('main_only');
  const [overwrite, setOverwrite] = useState(true);

  const [extractJobId, setExtractJobId] = useState<string | null>(null);
  const [extractLog, setExtractLog] = useState('');
  const [extractStatus, setExtractStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [extractError, setExtractError] = useState<string | null>(null);

  const [captureLog, setCaptureLog] = useState('');
  const [captureStatus, setCaptureStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

  const loadRuns = useCallback(async () => {
    setLoadingRuns(true);
    setRunsError(null);
    try {
      const url = propertyId
        ? apiUrl(`/page-markdown/runs?propertyId=${propertyId}`)
        : apiUrl('/page-markdown/runs');
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load runs');
      const list = (data.runs ?? []) as PageMarkdownRunRow[];
      setRuns(list);
      if (!selectedRunId && list.length > 0) {
        onRunSelect(list[0].id);
      }
    } catch (e) {
      setRunsError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingRuns(false);
    }
  }, [propertyId, selectedRunId, onRunSelect]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // Poll extraction job
  useEffect(() => {
    if (!extractJobId || extractStatus !== 'running') return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/jobs/${encodeURIComponent(extractJobId)}`));
        const data = await res.json();
        setExtractLog(data.log ?? '');
        if (data.status === 'done' || data.exitCode === 0) {
          setExtractStatus('done');
          setExtractJobId(null);
          onExtracted();
          void loadRuns();
        } else if (data.status === 'error' || (data.exitCode != null && data.exitCode !== 0)) {
          setExtractStatus('error');
          setExtractError('Extraction failed. Check the log above.');
          setExtractJobId(null);
        }
      } catch {
        /* retry */
      }
    }, 2000);
    return () => clearInterval(id);
  }, [extractJobId, extractStatus, onExtracted, loadRuns]);

  // Poll capture (crawl) job
  useEffect(() => {
    if (!captureJobId || captureJobDone) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/jobs/${encodeURIComponent(captureJobId)}`));
        const data = await res.json();
        setCaptureLog(data.log ?? '');
        if (data.status === 'done' || data.exitCode === 0) {
          setCaptureStatus('done');
          void loadRuns();
        } else if (data.status === 'error' || (data.exitCode != null && data.exitCode !== 0)) {
          setCaptureStatus('error');
        }
      } catch {
        /* retry */
      }
    }, 2000);
    return () => clearInterval(id);
  }, [captureJobId, captureJobDone, loadRuns]);

  useEffect(() => {
    if (captureJobId) setCaptureStatus('running');
  }, [captureJobId]);

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

  const handleExtract = async () => {
    if (!selectedRunId) return;
    setExtractError(null);
    setExtractLog('');
    setExtractStatus('running');
    try {
      const res = await fetch(apiUrl('/page-markdown/extract'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crawlRunId: selectedRunId, strategy, overwrite }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start extraction');
      setExtractJobId(data.jobId);
    } catch (e) {
      setExtractStatus('error');
      setExtractError(e instanceof Error ? e.message : String(e));
    }
  };

  const htmlCount = selectedRun?.html_page_count ?? 0;
  const mdCount = selectedRun?.markdown_page_count ?? 0;

  return (
    <div className="space-y-6">
      {/* Run selector */}
      <div className="rounded-xl border border-default bg-brand-900/40 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Crawl run</h3>
          <button
            type="button"
            onClick={() => void loadRuns()}
            disabled={loadingRuns}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingRuns ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {runsError ? (
          <p className="text-xs text-red-400">{runsError}</p>
        ) : loadingRuns ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading runs…
          </div>
        ) : runs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No crawl runs found. Run a crawl first.</p>
        ) : (
          <select
            className="w-full rounded-md border border-default bg-brand-800 px-3 py-2 text-sm text-foreground"
            value={selectedRunId ?? ''}
            onChange={(e) => onRunSelect(Number(e.target.value))}
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} — {r.start_url} — {formatDate(r.created_at)} —
                HTML: {r.html_page_count} | MD: {r.markdown_page_count}
              </option>
            ))}
          </select>
        )}

        {/* Status banner */}
        {selectedRun ? (
          <div className="flex flex-wrap gap-3 text-xs">
            <span
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${
                htmlCount > 0
                  ? 'bg-green-500/15 text-green-400'
                  : 'bg-yellow-500/15 text-yellow-400'
              }`}
            >
              {htmlCount > 0 ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              {htmlCount > 0 ? `HTML ready (${htmlCount} pages)` : 'No HTML — capture required'}
            </span>
            {mdCount > 0 ? (
              <span className="flex items-center gap-1 rounded-full px-2.5 py-1 font-medium bg-blue-500/15 text-blue-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Markdown ready ({mdCount} pages)
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Capture HTML section */}
      <CaptureSection
        selectedRun={selectedRun}
        captureStatus={captureStatus}
        captureLog={captureLog}
        onCaptureStart={onCaptureStart}
      />

      {/* Extract options */}
      <div className="rounded-xl border border-default bg-brand-900/40 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Extract markdown</h3>

        {!selectedRun || htmlCount === 0 ? (
          <p className="text-xs text-muted-foreground">
            Select a run with stored HTML to enable extraction.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Strategy
                </label>
                <select
                  className="w-full rounded-md border border-default bg-brand-800 px-3 py-2 text-sm text-foreground"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as 'main_only' | 'full_body')}
                >
                  <option value="main_only">Main content only (default)</option>
                  <option value="full_body">Full body</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="overwrite-cb"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  className="rounded border-default"
                />
                <label htmlFor="overwrite-cb" className="text-sm text-foreground">
                  Overwrite existing markdown
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleExtract()}
              disabled={extractStatus === 'running'}
              className="flex items-center gap-2 rounded-lg bg-accent-warm px-4 py-2 text-sm font-medium text-white hover:bg-accent-warm/80 disabled:opacity-60"
            >
              {extractStatus === 'running' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {extractStatus === 'running' ? 'Extracting…' : 'Extract markdown'}
            </button>

            {extractStatus === 'done' ? (
              <p className="flex items-center gap-1.5 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Extraction complete — switch to Preview tab to view results.
              </p>
            ) : null}

            {extractError ? (
              <p className="flex items-center gap-1.5 text-sm text-red-400">
                <AlertCircle className="h-4 w-4" />
                {extractError}
              </p>
            ) : null}

            {extractLog ? (
              <pre className="max-h-48 overflow-y-auto text-[11px] text-muted-foreground bg-brand-950/60 rounded-lg p-3 font-mono whitespace-pre-wrap">
                {extractLog}
              </pre>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

interface CaptureSectionProps {
  selectedRun: PageMarkdownRunRow | null;
  captureStatus: 'idle' | 'running' | 'done' | 'error';
  captureLog: string;
  onCaptureStart: (jobId: string) => void;
}

function CaptureSection({ selectedRun, captureStatus, captureLog, onCaptureStart }: CaptureSectionProps) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const htmlCount = selectedRun?.html_page_count ?? 0;

  if (htmlCount > 0) return null;

  const handleCapture = async () => {
    if (!selectedRun) return;
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(apiUrl('/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'crawl',
          state: {
            start_url: selectedRun.start_url,
            store_page_html: true,
            run_content_analysis: false,
            crawl_stream_to_db: false,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start crawl');
      onCaptureStart(data.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5 space-y-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">No stored HTML for this run</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Capture HTML by re-crawling with <code className="text-yellow-300/80">store_page_html=true</code>.
            This will start a new crawl job for the same site.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleCapture()}
        disabled={starting || captureStatus === 'running' || !selectedRun}
        className="flex items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm font-medium text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-60"
      >
        {captureStatus === 'running' || starting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wifi className="h-4 w-4" />
        )}
        {captureStatus === 'running' ? 'Crawling…' : 'Capture HTML (re-crawl)'}
      </button>

      {captureStatus === 'done' ? (
        <p className="text-xs text-green-400 flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Crawl complete — HTML stored. You can now extract markdown.
        </p>
      ) : null}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {captureLog ? (
        <pre className="max-h-48 overflow-y-auto text-[11px] text-muted-foreground bg-brand-950/60 rounded-lg p-3 font-mono whitespace-pre-wrap">
          {captureLog}
        </pre>
      ) : null}
    </div>
  );
}
