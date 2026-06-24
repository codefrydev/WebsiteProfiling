import { apiUrl, apiFetch } from '@/lib/publicBase';
import type { PipelineJob } from '@/types/api';
import { logPipelineFailure } from '@/lib/pipelineDebug';

export interface PipelineJobStartedDetail {
  jobId: string;
  command?: string;
  openRunner?: boolean;
}

export const PIPELINE_JOB_STARTED = 'website-profiling:pipeline-job-started';
export const OPEN_INTEGRATIONS = 'website-profiling:open-integrations';

export function dispatchOpenIntegrations(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_INTEGRATIONS));
}

/**
 * Notify Pipeline Runner (and other listeners) that a background job started.
 */
export function dispatchPipelineJobStarted(
  jobId: string,
  options: { command?: string; openRunner?: boolean } = {},
): void {
  if (typeof window === 'undefined' || !jobId) return;
  window.dispatchEvent(
    new CustomEvent<PipelineJobStartedDetail>(PIPELINE_JOB_STARTED, {
      detail: {
        jobId,
        command: options.command,
        openRunner: options.openRunner !== false,
      },
    }),
  );
}

type JobPollUpdate = {
  status: PipelineJob['status'];
  log: string;
  error?: string | null;
  logTruncated?: boolean;
};

/**
 * Poll GET /api/jobs/:id until the job finishes.
 */
export function pollPipelineJob(
  jobId: string,
  onUpdate: (job: JobPollUpdate) => void,
): () => void {
  if (!jobId) return () => {};

  let cancelled = false;
  let interval: ReturnType<typeof setInterval> | null = null;
  const jobPath = apiUrl(`/jobs/${encodeURIComponent(jobId)}`);

  const finish = (): void => {
    cancelled = true;
    if (interval) clearInterval(interval);
    interval = null;
  };

  const tick = async (): Promise<void> => {
    if (cancelled) return;
    try {
      const res = await apiFetch(jobPath);
      const data: {
        status?: string;
        log?: string;
        error?: string | null;
        logTruncated?: boolean;
      } = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        const errMsg = data.error || res.statusText;
        logPipelineFailure('Job poll HTTP error', { jobId, status: res.status, error: errMsg, body: data });
        onUpdate({
          status: 'error',
          log: errMsg,
          error: errMsg,
        });
        finish();
        return;
      }
      const status = (data.status as PipelineJob['status']) || 'error';
      const log = data.log || '';
      const error = data.error ?? null;
      onUpdate({ status, log, error, logTruncated: Boolean(data.logTruncated) });
      if (status === 'success' || status === 'error') {
        finish();
      }
    } catch (e) {
      if (!cancelled) {
        const msg = e instanceof Error ? e.message : String(e);
        logPipelineFailure('Job poll failed', { jobId, message: msg, error: e });
        onUpdate({
          status: 'error',
          log: msg,
          error: msg,
        });
        finish();
      }
    }
  };

  void tick();
  interval = setInterval(() => {
    void tick();
  }, 1000);

  return finish;
}
