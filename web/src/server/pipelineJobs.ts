import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import { buildPipelineJobErrorMessage } from '@/lib/pipelineJobErrorMessage';
import {
  appendPipelineJobLog,
  cancelPipelineJobInDb,
  finishPipelineJob,
  getPipelineJobFromDb,
  insertPipelineJob,
  isAnyPipelineJobRunning,
  reconcileStaleRunningJobs,
} from '@/server/pipelineJobsDb';
import type { PipelineJob, PipelineJobEntry, PipelineJobStore } from '@/types/api';

function isDbJobsEnabled(): boolean {
  return Boolean((process.env.DATABASE_URL || '').trim());
}

const WEB_CWD = process.cwd();
const DEFAULT_REPO_ROOT = process.env.WEBSITE_PROFILING_ROOT || path.resolve(WEB_CWD, '..');

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

/**
 * Next may bundle this module into separate server chunks per API route, so module-level
 * `Map` instances are not shared. Persist store on globalThis so POST /api/run and GET
 * /api/jobs/[id] always see the same jobs (also survives dev Fast Refresh better).
 */
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

function markJobFinished(
  id: string,
  entry: PipelineJobEntry,
  status: 'success' | 'error',
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
    void finishPipelineJob(id, status, exitCode, error).catch(() => {});
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

/**
 * Resolve and validate an absolute config file path.
 *
 * Allowed locations:
 *   - Under repoRoot (always)
 *   - Under DATA_DIR — the data volume (/data) in Docker
 */
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

/**
 * Start a pipeline job. When configAbsPath is omitted (the normal UI flow),
 * Python picks up settings from the pipeline_config table via DATABASE_URL.
 */
export async function assertNoRunningJob(): Promise<void> {
  if (isDbJobsEnabled()) {
    await reconcileStaleRunningJobs();
    if (await isAnyPipelineJobRunning()) {
      throw new Error('An audit job is already running');
    }
    return;
  }
  if (getStore().running) {
    throw new Error('An audit job is already running');
  }
}

export function startPipelineJob(
  command: string | null | undefined,
  configAbsPath: string | null | undefined,
  options: StartPipelineJobOptions = {},
): string {
  if (command != null && command !== '' && !ALLOWED_COMMANDS.has(command)) {
    throw new Error('Invalid command');
  }
  const store = getStore();
  if (!isDbJobsEnabled() && store.running) {
    throw new Error('An audit job is already running');
  }

  const repoRoot = resolveRepoRoot(options.repoRoot);
  const pythonExe = sanitizePython(options.python, repoRoot);

  // Validate config path only when explicitly provided
  let cfgPath: string | null = null;
  if (configAbsPath != null && String(configAbsPath).trim() !== '') {
    cfgPath = validateConfigPath(String(configAbsPath), repoRoot);
    if (!fs.existsSync(cfgPath)) {
      throw new Error(`Config file not found: ${cfgPath}`);
    }
  }

  const id = randomUUID();
  const entry: PipelineJobEntry = {
    status: 'running',
    exitCode: null,
    log: '',
  };
  store.jobs.set(id, entry);
  store.running = true;

  const jobType = command?.split(/\s+/)[0] || 'full';
  if (isDbJobsEnabled()) {
    void insertPipelineJob(id, jobType, options.propertyId ?? null, null).catch(() => {});
  }

  // When no explicit config path is given, Python reads from PostgreSQL via DATABASE_URL.
  const args = ['-m', 'src'];
  if (cfgPath) args.push('--config', cfgPath);
  // Support multi-word commands like "keywords --enrich-google"
  if (command) args.push(...command.split(/\s+/).filter(Boolean));

  const proc = spawn(pythonExe, args, {
    cwd: repoRoot,
    env: getPipelineSpawnEnv(repoRoot, options.propertyId ?? null),
    shell: false,
  });
  getProcessMap().set(id, proc);

  const append = (chunk: Buffer | string): void => {
    const text = chunk.toString();
    entry.log += text;
    if (entry.log.length > 256_000) {
      entry.log = entry.log.slice(-200_000);
    }
    if (isDbJobsEnabled()) {
      void appendPipelineJobLog(id, text).catch(() => {});
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
    const status = code === 0 ? 'success' : 'error';
    let error: string | undefined;
    if (code !== 0) {
      error = buildPipelineJobErrorMessage(entry.log, code);
    }
    markJobFinished(id, entry, status, code, error);
  });

  return id;
}

export async function getJob(id: string): Promise<PipelineJob | null> {
  if (isDbJobsEnabled()) {
    const fromDb = await getPipelineJobFromDb(id);
    if (fromDb) return fromDb;
    // Fall back to in-memory for jobs started in this process before DB insert completes.
    return getStore().jobs.get(id) ?? null;
  }
  return getStore().jobs.get(id) ?? null;
}

/** Sync read from in-memory cache only (legacy). */
export function getJobSync(id: string): PipelineJob | null {
  return getStore().jobs.get(id) ?? null;
}

export interface CancelPipelineJobResult {
  ok: boolean;
  status: PipelineJob['status'];
  error?: string;
}

/**
 * Stop a running pipeline job. Kills the child process when this server instance
 * spawned it; otherwise marks the DB row cancelled (best effort after restart).
 */
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
    entry.log += cancelLine;
    if (isDbJobsEnabled()) {
      void appendPipelineJobLog(trimmed, cancelLine).catch(() => {});
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
