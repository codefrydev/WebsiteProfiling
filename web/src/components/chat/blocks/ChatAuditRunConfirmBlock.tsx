
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '@/components/Button';
import CrawlAuthorizeCheckbox from '@/components/pipeline/CrawlAuthorizeCheckbox';
import { usePipeline } from '@/context/PipelineContext';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import {
  crawlRenderModeUsesBrowser,
  fetchBrowserCrawlStatus,
} from '@/lib/browserCrawlStatus';
import { validatePipelineRun } from '@/lib/pipelineConfigSchema';
import { dispatchPipelineJobStarted, pollPipelineJob } from '@/lib/pipelineJobEvents';
import { strings } from '@/lib/strings';
import type { PipelineConfigState } from '@/types/api';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';

type AuditRunConfirmBlock = Extract<ChatBlock, { type: 'audit_run_confirm' }>;

const c = strings.components.chat.auditRunConfirm;

export default function ChatAuditRunConfirmBlock({ block }: { block: AuditRunConfirmBlock }) {
  const { unknownKeys } = usePipeline();
  const { readOnly } = useReadOnlySession();
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [jobStatus, setJobStatus] = useState<'idle' | 'starting' | 'running' | 'done' | 'error'>(
    'idle',
  );
  const [jobLog, setJobLog] = useState('');
  const pollStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      pollStopRef.current?.();
    };
  }, []);

  const pipelineLabel =
    block.pipelineMode === 'crawl-only' ? c.pipelineCrawlOnly : c.pipelineFullAudit;

  const handleRun = useCallback(async () => {
    if (!authorized || readOnly || busy) return;
    setError('');
    setBusy(true);
    setJobStatus('starting');

    try {
      let propertyId: number | null = null;
      const createProp = block.runSpec.create_property;

      if (createProp) {
        const propRes = await apiFetch(apiUrl('/properties'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: createProp.name,
            canonical_domain: createProp.canonical_domain,
            site_url: createProp.site_url,
          }),
        });
        const propData = (await propRes.json().catch(() => ({}))) as {
          id?: number;
          error?: string;
        };
        if (!propRes.ok) throw new Error(propData.error || propRes.statusText);
        propertyId = Number(propData.id);
        if (!Number.isFinite(propertyId)) throw new Error('Property creation did not return an id');
      }

      const mergedState = {
        ...block.runSpec.state,
      } as PipelineConfigState;
      if (propertyId != null) {
        mergedState.active_property_id = String(propertyId);
      }

      if (propertyId == null && mergedState.active_property_id) {
        const pid = Number(mergedState.active_property_id);
        if (Number.isFinite(pid)) propertyId = pid;
      }

      let browserStatus = null;
      if (crawlRenderModeUsesBrowser(mergedState)) {
        browserStatus = await fetchBrowserCrawlStatus();
      }

      const validationErrors = validatePipelineRun({
        state: mergedState,
        command: block.runSpec.command || null,
        browserStatus,
      });
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(' '));
      }

      const res = await apiFetch(apiUrl('/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: block.runSpec.command || null,
          state: mergedState,
          unknownKeys,
          propertyId: propertyId ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
      if (!res.ok) throw new Error(data.error || res.statusText);

      const jobId = data.jobId;
      if (!jobId) throw new Error('Server did not return a job id');

      dispatchPipelineJobStarted(jobId, { openRunner: false });
      setJobStatus('running');

      pollStopRef.current?.();
      pollStopRef.current = pollPipelineJob(jobId, (update) => {
        setJobLog(update.log || '');
        if (update.status === 'success') {
          setJobStatus('done');
          setBusy(false);
        } else if (update.status === 'error') {
          setJobStatus('error');
          setError(update.error || update.log || c.runFailed);
          setBusy(false);
        }
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setJobStatus('error');
      setBusy(false);
    }
  }, [authorized, readOnly, busy, block.runSpec, unknownKeys]);

  const runDisabled = !authorized || readOnly || busy || jobStatus === 'done';
  const showRunControls = jobStatus !== 'running' && jobStatus !== 'done';

  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {c.title}
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{block.startUrl}</p>
        <p className="text-xs text-muted-foreground">
          {c.presetLabel}: {block.crawlPreset} · {pipelineLabel}
        </p>
      </div>

      {block.highlights.length > 0 ? (
        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
          {block.highlights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {showRunControls ? (
        <>
          <CrawlAuthorizeCheckbox
            checked={authorized}
            onChange={setAuthorized}
            disabled={readOnly || busy}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={() => void handleRun()}
              disabled={runDisabled}
              className="inline-flex items-center gap-2"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              {busy ? c.starting : jobStatus === 'error' ? c.retryButton : c.runButton}
            </Button>
            <Link
              to="/pipeline"
              className="text-xs text-link hover:underline"
            >
              {c.editInRunner}
            </Link>
          </div>
        </>
      ) : null}

      {jobStatus === 'running' ? (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {c.running}
        </p>
      ) : null}

      {jobStatus === 'done' ? (
        <p className="text-xs text-green-700 dark:text-green-400">{c.done}</p>
      ) : null}

      {error ? (
        <p className="text-xs text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {jobLog && jobStatus === 'running' ? (
        <pre className="max-h-32 overflow-auto rounded border border-default bg-brand-900/80 p-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">
          {jobLog.slice(-2000)}
        </pre>
      ) : null}
    </div>
  );
}
