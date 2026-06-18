import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import { buildPipelineJobErrorMessage } from '@/lib/pipelineJobErrorMessage';
import { logPipelineDbError } from '@/lib/pipelineDebug';
import {
  appendPipelineJobLog,
  cancelPipelineJobInDb,
  finishPipelineJob,
  getActiveRunningJob,
  getPipelineJobFromDb,
  listRecentPipelineJobs,
  markRunningJobOrphaned,
  PIPELINE_LOG_MAX,
  PIPELINE_LOG_TRIM,
  reconcileStaleRunningJobs,
  tryClaimRunningPipelineJob,
  type PipelineJobListItem,
} from '@/server/pipelineJobsDb';
import type { PipelineJob, PipelineJobEntry, PipelineJobStore } from '@/types/api';

function isDbJobsEnabled(): boolean {
  return Boolean((process.env.DATABASE_URL || '').trim());
}

const WEB_CWD = process.cwd();
const DEFAULT_REPO_ROOT = process.env.WEBSITE_PROFILING_ROOT || path.resolve(WEB_CWD, '..');
const ORPHAN_JOB_MINUTES = Number(process.env.PIPELINE_JOB_ORPHAN_MINUTES || '5');

const ALLOWED_COMMANDS = new Set<string | null | undefined>([
  null,
  undefined,
  '',
  'crawl',
  'report',
  'plot',
  'lighthouse',
  'keywords',
  'keywords --enrich-google',
  'warnings',
  'enrich',
  'google',
]);

function getStore(): PipelineJobStore {
  if (!globalThis.__websiteProfilingPipelineJobs) {
    globalThis.__websiteProfilingPipelineJobs = {
      jobs: new Map<string, PipelineJobEntry>(),
      running: false,
    };
  }
  return globalThis.__websiteProfilingPipelineJobs;
}

function getProcessMap(): Map<string, ChildProcess> {
  if (!globalThis.__websiteProfilingPipelineProcesses) {
    globalThis.__websiteProfilingPipelineProcesses = new Map<string, ChildProcess>();
  }
  return globalThis.__websiteProfilingPipelineProcesses;
}

const CANCELLED_MESSAGE = 'Cancelled by user';

function trimInMemoryLog(entry: PipelineJobEntry, chunk: string): void {
  entry.log += chunk;
  if (entry.log.length > PIPELINE_LOG_MAX) {
    entry.log = entry.log.slice(-PIPELINE_LOG_TRIM);
    entry.logTruncated = true;
  }
}

function markJobFinished(
  id: string,
  entry: PipelineJobEntry,
  status: 'success' | 'error' | 'paused',
  exitCode: number | null,
  error?: string,
): void {
  if (entry.finished) return;
  entry.finished = true;
  entry.status = status;
  entry.exitCode = exitCode;
  if (error) entry.error = error;
  getStore().running = false;
  getProcessMap().delete(id);
  if (isDbJobsEnabled()) {
    void finishPipelineJob(id, status, exitCode, error, entry.logTruncated).catch((err) =>
      logPipelineDbError('finishPipelineJob', err),
    );
  }
}

function sanitizePython(py: string | undefined | null, repoRoot: string): string {
  const resolved = resolvePythonExecutable(py, repoRoot);
  if (resolved.length > 256) throw new Error('Python path too long');
  if (/[\r\n;|&`$<>]/.test(resolved)) throw new Error('Invalid python executable');
  return resolved;
}

function resolveRepoRoot(override: string | undefined | null): string {
  if (override == null || String(override).trim() === '') {
    return DEFAULT_REPO_ROOT;
  }
  const raw = String(override).trim();
  if (raw.includes('..')) throw new Error('Invalid repo root');
  const abs = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(DEFAULT_REPO_ROOT, raw);
  const normalized = path.resolve(abs);
  const marker = path.join(normalized, 'src', '__main__.py');
  if (!fs.existsSync(marker)) {
    throw new Error('Repo root must contain src/__main__.py');
  }
  return normalized;
}

function validateConfigPath(absPath: string, repoRoot: string): string {
  const normalized = path.resolve(absPath);

  if (normalized.startsWith(path.resolve(repoRoot))) return normalized;

  const dataDir = (process.env.DATA_DIR || '').trim();
  if (dataDir && normalized.startsWith(path.resolve(dataDir))) return normalized;

  throw new Error(`Config path not in an allowed directory: ${normalized}`);
}

export interface StartPipelineJobOptions {
  python?: string;
  repoRoot?: string;
  propertyId?: number | null;
}

function hasLiveProcess(jobId: string): boolean {
  const proc = getProcessMap().get(jobId);
  return Boolean(proc && !proc.killed);
}

async function reconcileOrphanedActiveJob(active: PipelineJobListItem): Promise<boolean> {
  if (hasLiveProcess(active.id)) return false;
  const started = new Date(active.startedAt).getTime();
  if (Number.isNaN(started) || Date.now() - started < ORPHAN_JOB_MINUTES * 60 * 1000) {
    return false;
  }
  const updated = await markRunningJobOrphaned(active.id);
  if (updated) {
    getStore().running = false;
    const entry = getStore().jobs.get(active.id);
    if (entry && !entry.finished) {
      markJobFinished(active.id, entry, 'error', -1, 'Job process not found (server restarted)');
    }
  }
  return updated;
}

export interface PipelineJobsListResult {
  jobs: PipelineJobListItem[];
  active: PipelineJobListItem | null;
  reconciled: number;
}

/** List jobs for GET /api/jobs with stale + orphan reconciliation. */
export async function listPipelineJobsForApi(limit: number): Promise<PipelineJobsListResult> {
  let reconciled = await reconcileStaleRunningJobs();
  let active = await getActiveRunningJob();
  if (active) {
    const orphanReconciled = await reconcileOrphanedActiveJob(active);
    if (orphanReconciled) {
      reconciled += 1;
      active = await getActiveRunningJob();
    }
  }
  const jobs = await listRecentPipelineJobs(limit);
  return { jobs, active, reconciled };
}

/**
 * Start a pipeline job. When configAbsPath is omitted (the normal UI flow),
 * Python picks up settings from the pipeline_config table via DATABASE_URL.
 */
export async function startPipelineJobAsync(
  command: string | null | undefined,
  configAbsPath: string | null | undefined,
  options: StartPipelineJobOptions = {},
): Promise<string> {
  if (command != null && command !== '' && !ALLOWED_COMMANDS.has(command)) {
    throw new Error('Invalid command');
  }

  const store = getStore();
  if (store.running) {
    throw new Error('An audit job is already running');
  }

  const repoRoot = resolveRepoRoot(options.repoRoot);
  const pythonExe = sanitizePython(options.python, repoRoot);

  let cfgPath: string | null = null;
  if (configAbsPath != null && String(configAbsPath).trim() !== '') {
    cfgPath = validateConfigPath(String(configAbsPath), repoRoot);
    if (!fs.existsSync(cfgPath)) {
      throw new Error(`Config file not found: ${cfgPath}`);
    }
  }

  const id = randomUUID();
  const jobType = command?.split(/\s+/)[0] || 'full';

  if (isDbJobsEnabled()) {
    const claimed = await tryClaimRunningPipelineJob(
      id,
      jobType,
      options.propertyId ?? null,
      null,
    );
    if (!claimed) {
      throw new Error('An audit job is already running');
    }
  }

  const entry: PipelineJobEntry = {
    status: 'running',
    exitCode: null,
    log: '',
    logTruncated: false,
  };
  store.jobs.set(id, entry);
  store.running = true;

  const args = ['-m', 'src'];
  if (cfgPath) args.push('--config', cfgPath);
  if (command) args.push(...command.split(/\s+/).filter(Boolean));

  const proc = spawn(pythonExe, args, {
    cwd: repoRoot,
    env: getPipelineSpawnEnv(repoRoot),
    shell: false,
  });
  getProcessMap().set(id, proc);

  const append = (chunk: Buffer | string): void => {
    const text = chunk.toString();
    trimInMemoryLog(entry, text);
    if (isDbJobsEnabled()) {
      void appendPipelineJobLog(id, text)
        .then((truncated) => {
          if (truncated) entry.logTruncated = true;
        })
        .catch((err) => logPipelineDbError('appendPipelineJobLog', err));
    }
  };

  proc.stdout?.on('data', append);
  proc.stderr?.on('data', append);

  proc.on('error', (err: Error) => {
    if (entry.finished) return;
    const message = formatPythonSpawnError(err, pythonExe, repoRoot);
    markJobFinished(id, entry, 'error', -1, message);
  });

  proc.on('close', (code: number | null) => {
    if (entry.finished) return;
    if (entry.cancelled) {
      markJobFinished(id, entry, 'error', code ?? -1, CANCELLED_MESSAGE);
      return;
    }
    if (code === 2) {
      // Python crawler paused — extract crawl_run_id from log for resume
      const match = /\[PAUSE\] crawl_run_id=(\d+)/.exec(entry.log);
      entry.pausedCrawlRunId = match ? Number(match[1]) : null;
      markJobFinished(id, entry, 'paused', code);
      return;
    }
    const status = code === 0 ? 'success' : 'error';
    let error: string | undefined;
    if (code !== 0) {
      error = buildPipelineJobErrorMessage(entry.log, code);
    }
    markJobFinished(id, entry, status, code, error);
  });

  return id;
}

/** @deprecated Use startPipelineJobAsync */
export async function assertNoRunningJob(): Promise<void> {
  if (isDbJobsEnabled()) {
    await reconcileStaleRunningJobs();
    const active = await getActiveRunningJob();
    if (active) {
      await reconcileOrphanedActiveJob(active);
      const stillActive = await getActiveRunningJob();
      if (stillActive) throw new Error('An audit job is already running');
    }
    return;
  }
  if (getStore().running) {
    throw new Error('An audit job is already running');
  }
}

export async function getJob(id: string): Promise<PipelineJob | null> {
  const memory = getStore().jobs.get(id);
  if (isDbJobsEnabled()) {
    const fromDb = await getPipelineJobFromDb(id);
    if (fromDb) {
      if (memory) {
        return {
          ...fromDb,
          log: memory.log.length >= fromDb.log.length ? memory.log : fromDb.log,
          logTruncated: memory.logTruncated || fromDb.logTruncated,
          status: memory.finished ? memory.status : fromDb.status,
          exitCode: memory.finished ? memory.exitCode : fromDb.exitCode,
          error: memory.error ?? fromDb.error,
        };
      }
      return fromDb;
    }
    return memory ?? null;
  }
  return memory ?? null;
}

export function getJobSync(id: string): PipelineJob | null {
  return getStore().jobs.get(id) ?? null;
}

export interface CancelPipelineJobResult {
  ok: boolean;
  status: PipelineJob['status'];
  error?: string;
}

export async function cancelPipelineJob(id: string): Promise<CancelPipelineJobResult> {
  const trimmed = id.trim();
  if (!trimmed) {
    return { ok: false, status: 'error', error: 'Job id is required' };
  }

  const store = getStore();
  const entry = store.jobs.get(trimmed);
  const proc = getProcessMap().get(trimmed);

  if (entry?.status === 'running' && proc && !proc.killed) {
    entry.cancelled = true;
    entry.error = CANCELLED_MESSAGE;
    const cancelLine = `\n[Cancelled] ${CANCELLED_MESSAGE}\n`;
    trimInMemoryLog(entry, cancelLine);
    if (isDbJobsEnabled()) {
      void appendPipelineJobLog(trimmed, cancelLine)
        .then((truncated) => {
          if (truncated) entry.logTruncated = true;
        })
        .catch((err) => logPipelineDbError('appendPipelineJobLog', err));
    }
    try {
      proc.kill();
    } catch {
      /* process may already be gone */
    }
    return { ok: true, status: 'running' };
  }

  if (entry?.status === 'running') {
    entry.cancelled = true;
    markJobFinished(trimmed, entry, 'error', -1, CANCELLED_MESSAGE);
    return { ok: true, status: 'error', error: CANCELLED_MESSAGE };
  }

  if (isDbJobsEnabled()) {
    const fromDb = await getPipelineJobFromDb(trimmed);
    if (!fromDb) {
      return { ok: false, status: 'error', error: 'Job not found' };
    }
    if (fromDb.status !== 'running') {
      return { ok: false, status: fromDb.status, error: 'Job is not running' };
    }
    const updated = await cancelPipelineJobInDb(trimmed, CANCELLED_MESSAGE);
    if (!updated) {
      return { ok: false, status: fromDb.status, error: 'Job is not running' };
    }
    store.running = false;
    return { ok: true, status: 'error', error: CANCELLED_MESSAGE };
  }

  if (!entry) {
    return { ok: false, status: 'error', error: 'Job not found' };
  }
  return { ok: false, status: entry.status, error: 'Job is not running' };
}

export interface PausePipelineJobResult {
  ok: boolean;
  error?: string;
}

/** Send SIGUSR1 (Unix) or write a PID-keyed pause file (Windows) to the running job. */
export async function pausePipelineJob(id: string): Promise<PausePipelineJobResult> {
  const trimmed = id.trim();
  const entry = getStore().jobs.get(trimmed);
  const proc = getProcessMap().get(trimmed);

  if (!entry || entry.status !== 'running') {
    return { ok: false, error: 'Job is not running' };
  }
  if (!proc || proc.killed || proc.pid == null) {
    return { ok: false, error: 'Process not found' };
  }

  try {
    // SIGUSR1 on Unix; fall back to a pause-flag file on Windows.
    process.kill(proc.pid, 'SIGUSR1' as NodeJS.Signals);
  } catch {
    // Windows fallback: write a file the Python process polls for.
    const os = await import('os');
    const nodePath = await import('path');
    const flagPath = nodePath.join(os.tmpdir(), `wp_pause_${proc.pid}.flag`);
    try {
      fs.writeFileSync(flagPath, '');
    } catch {
      return { ok: false, error: 'Could not send pause signal' };
    }
  }
  return { ok: true };
}

export interface ResumePipelineJobResult {
  ok: boolean;
  newJobId?: string;
  error?: string;
}

/** Start a new crawl job that resumes from the paused frontier of a previous job. */
export async function resumePipelineJob(
  id: string,
  options: StartPipelineJobOptions = {},
): Promise<ResumePipelineJobResult> {
  const trimmed = id.trim();
  const entry = getStore().jobs.get(trimmed);

  // Resolve the paused crawl_run_id from in-memory entry or the DB log.
  let pausedRunId: number | null = entry?.pausedCrawlRunId ?? null;
  if (pausedRunId == null) {
    const job = await getJob(trimmed);
    if (!job) return { ok: false, error: 'Job not found' };
    if (job.status !== 'paused') return { ok: false, error: 'Job is not paused' };
    const match = /\[PAUSE\] crawl_run_id=(\d+)/.exec(job.log);
    pausedRunId = match ? Number(match[1]) : null;
  }
  if (pausedRunId == null) {
    return { ok: false, error: 'No paused crawl run found for this job' };
  }

  // Start a new pipeline job with --resume-run-id flag appended to the crawl command.
  const repoRoot = resolveRepoRoot(options.repoRoot);
  const pythonExe = sanitizePython(options.python, repoRoot);
  const store = getStore();
  if (store.running) {
    return { ok: false, error: 'An audit job is already running' };
  }

  const newId = randomUUID();
  if (isDbJobsEnabled()) {
    const claimed = await tryClaimRunningPipelineJob(newId, 'crawl', options.propertyId ?? null, null);
    if (!claimed) {
      return { ok: false, error: 'An audit job is already running' };
    }
  }

  const newEntry: import('@/types/api').PipelineJobEntry = {
    status: 'running',
    exitCode: null,
    log: '',
    logTruncated: false,
  };
  store.jobs.set(newId, newEntry);
  store.running = true;

  const args = ['-m', 'src', '--resume-run-id', String(pausedRunId)];
  const proc = spawn(pythonExe, args, {
    cwd: repoRoot,
    env: getPipelineSpawnEnv(repoRoot),
    shell: false,
  });
  getProcessMap().set(newId, proc);

  const append = (chunk: Buffer | string): void => {
    const text = chunk.toString();
    trimInMemoryLog(newEntry, text);
    if (isDbJobsEnabled()) {
      void appendPipelineJobLog(newId, text)
        .then((truncated) => { if (truncated) newEntry.logTruncated = true; })
        .catch((err) => logPipelineDbError('appendPipelineJobLog', err));
    }
  };
  proc.stdout?.on('data', append);
  proc.stderr?.on('data', append);

  proc.on('error', (err: Error) => {
    if (newEntry.finished) return;
    markJobFinished(newId, newEntry, 'error', -1, formatPythonSpawnError(err, pythonExe, repoRoot));
  });

  proc.on('close', (code: number | null) => {
    if (newEntry.finished) return;
    if (code === 2) {
      const match = /\[PAUSE\] crawl_run_id=(\d+)/.exec(newEntry.log);
      newEntry.pausedCrawlRunId = match ? Number(match[1]) : null;
      markJobFinished(newId, newEntry, 'paused', code);
      return;
    }
    const status = code === 0 ? 'success' : 'error';
    const error = code !== 0 ? buildPipelineJobErrorMessage(newEntry.log, code) : undefined;
    markJobFinished(newId, newEntry, status, code, error);
  });

  return { ok: true, newJobId: newId };
}
