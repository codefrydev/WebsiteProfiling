import { apiUrl } from '@/lib/publicBase';

/** @typedef {{ jobId: string, command?: string, openRunner?: boolean }} PipelineJobStartedDetail */

export const PIPELINE_JOB_STARTED = 'website-profiling:pipeline-job-started';

/**
 * Notify Pipeline Runner (and other listeners) that a background job started.
 * @param {string} jobId
 * @param {{ command?: string, openRunner?: boolean }} [options]
 */
export function dispatchPipelineJobStarted(jobId, options = {}) {
  if (typeof window === 'undefined' || !jobId) return;
  window.dispatchEvent(
    new CustomEvent(PIPELINE_JOB_STARTED, {
      detail: {
        jobId,
        command: options.command,
        openRunner: options.openRunner !== false,
      },
    }),
  );
}

/**
 * Poll GET /api/jobs/:id until the job finishes.
 * @param {string} jobId
 * @param {(job: { status: string, log: string, error?: string | null }) => void} onUpdate
 * @returns {() => void} cleanup
 */
export function pollPipelineJob(jobId, onUpdate) {
  if (!jobId) return () => {};

  let cancelled = false;
  let interval = null;
  const jobPath = apiUrl(`/jobs/${encodeURIComponent(jobId)}`);

  const finish = () => {
    cancelled = true;
    if (interval) clearInterval(interval);
    interval = null;
  };

  const tick = async () => {
    if (cancelled) return;
    try {
      const res = await fetch(jobPath);
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        onUpdate({
          status: 'error',
          log: data.error || res.statusText,
          error: data.error || res.statusText,
        });
        finish();
        return;
      }
      onUpdate({
        status: data.status,
        log: data.log || '',
        error: data.error ?? null,
      });
      if (data.status === 'success' || data.status === 'error') {
        finish();
      }
    } catch (e) {
      if (!cancelled) {
        onUpdate({
          status: 'error',
          log: e instanceof Error ? e.message : String(e),
          error: e instanceof Error ? e.message : String(e),
        });
        finish();
      }
    }
  };

  tick();
  interval = setInterval(tick, 1000);

  return finish;
}
