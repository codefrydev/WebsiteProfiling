import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import {
  appendPipelineJobLog,
  finishPipelineJob,
  getPipelineJobFromDb,
  insertPipelineJob,
  isAnyPipelineJobRunning,
  reconcileStaleRunningJobs,
} from '@/server/pipelineJobsDb';
import type { PipelineJob, PipelineJobStore } from '@/types/api';

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
      jobs: new Map<string, PipelineJob>(),
      running: false,
    };
  }
  return globalThis.__websiteProfilingPipelineJobs;
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
  const entry: PipelineJob = {
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
    entry.status = 'error';
    entry.error = formatPythonSpawnError(err, pythonExe, repoRoot);
    entry.exitCode = -1;
    store.running = false;
    if (isDbJobsEnabled()) {
      void finishPipelineJob(id, 'error', -1, entry.error).catch(() => {});
    }
  });

  proc.on('close', (code: number | null) => {
    entry.exitCode = code;
    entry.status = code === 0 ? 'success' : 'error';
    if (code !== 0 && !entry.error) {
      const tail = entry.log.trim().slice(-500);
      entry.error = tail
        ? `Process exited with code ${code ?? 'unknown'}`
        : `Process exited with code ${code ?? 'unknown'} (no output captured)`;
    }
    store.running = false;
    if (isDbJobsEnabled()) {
      void finishPipelineJob(id, entry.status, code, entry.error).catch(() => {});
    }
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
