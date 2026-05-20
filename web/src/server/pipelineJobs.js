import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { getReportDbPath } from '@/server/pipelineConfig';

const WEB_CWD = process.cwd();
const DEFAULT_REPO_ROOT = process.env.WEBSITE_PROFILING_ROOT || path.resolve(WEB_CWD, '..');
const DEFAULT_PYTHON = process.env.PYTHON || 'python';

const ALLOWED_COMMANDS = new Set([
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

const STORE_KEY = '__websiteProfilingPipelineJobs';

/**
 * Next may bundle this module into separate server chunks per API route, so module-level
 * `Map` instances are not shared. Persist store on globalThis so POST /api/run and GET
 * /api/jobs/[id] always see the same jobs (also survives dev Fast Refresh better).
 */
function getStore() {
  const g = globalThis;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = {
      /** @type {Map<string, { status: string, exitCode: number | null, log: string, error?: string }>} */
      jobs: new Map(),
      running: false,
    };
  }
  return g[STORE_KEY];
}

function sanitizePython(py) {
  let s = String(py || DEFAULT_PYTHON).trim() || DEFAULT_PYTHON;
  const envPy = String(process.env.PYTHON || '').trim();
  // Docker Compose sets PYTHON=/opt/venv/bin/python; bare "python" often missing in slim images
  if (envPy && (s === 'python' || s === 'python3')) {
    s = envPy;
  }
  if (s.length > 256) throw new Error('Python path too long');
  if (/[\r\n;|&`$<>]/.test(s)) throw new Error('Invalid python executable');
  return s;
}

/**
 * @param {string | undefined | null} override
 * @returns {string}
 */
function resolveRepoRoot(override) {
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
 *   - Under dirname(REPORT_DB_PATH) — the data volume (/data) in Docker
 *
 * @param {string} absPath – already-absolute path to validate
 * @param {string} repoRoot
 * @returns {string} validated absolute path
 */
function validateConfigPath(absPath, repoRoot) {
  const normalized = path.resolve(absPath);

  if (normalized.startsWith(path.resolve(repoRoot))) return normalized;

  const dbPath = (process.env.REPORT_DB_PATH || '').trim();
  if (dbPath && normalized.startsWith(path.resolve(path.dirname(dbPath)))) return normalized;

  throw new Error(`Config path not in an allowed directory: ${normalized}`);
}

/**
 * Start a pipeline job. When configAbsPath is omitted (the normal UI flow),
 * Python picks up settings from the pipeline_config table in report.db via
 * the REPORT_DB_PATH environment variable. Pass configAbsPath only for an
 * explicit CLI-override scenario.
 *
 * @param {string | null | undefined} command
 * @param {string | null | undefined} configAbsPath – optional; when absent Python uses DB
 * @param {{ python?: string, repoRoot?: string }} [options]
 * @returns {string} job id
 */
export function startPipelineJob(command, configAbsPath, options = {}) {
  if (command != null && command !== '' && !ALLOWED_COMMANDS.has(command)) {
    throw new Error('Invalid command');
  }
  const store = getStore();
  if (store.running) {
    throw new Error('A pipeline job is already running');
  }

  const repoRoot = resolveRepoRoot(options.repoRoot);
  const pythonExe = sanitizePython(options.python);

  // Validate config path only when explicitly provided
  let cfgPath = null;
  if (configAbsPath != null && String(configAbsPath).trim() !== '') {
    cfgPath = validateConfigPath(String(configAbsPath), repoRoot);
    if (!fs.existsSync(cfgPath)) {
      throw new Error(`Config file not found: ${cfgPath}`);
    }
  }

  const id = randomUUID();
  const entry = { status: 'running', exitCode: null, log: '' };
  store.jobs.set(id, entry);
  store.running = true;

  // When no explicit config path is given, Python reads from report.db via REPORT_DB_PATH env.
  const args = ['-m', 'src'];
  if (cfgPath) args.push('--config', cfgPath);
  // Support multi-word commands like "keywords --enrich-google"
  if (command) args.push(...command.split(/\s+/).filter(Boolean));

  const proc = spawn(pythonExe, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      WEBSITE_PROFILING_ROOT: repoRoot,
      REPORT_DB_PATH: getReportDbPath(),
    },
    shell: false,
  });

  const append = (chunk) => {
    entry.log += chunk.toString();
    if (entry.log.length > 256_000) {
      entry.log = entry.log.slice(-200_000);
    }
  };

  proc.stdout?.on('data', append);
  proc.stderr?.on('data', append);

  proc.on('error', (err) => {
    entry.status = 'error';
    entry.error = err.message;
    entry.exitCode = -1;
    store.running = false;
  });

  proc.on('close', (code) => {
    entry.exitCode = code;
    entry.status = code === 0 ? 'success' : 'error';
    store.running = false;
  });

  return id;
}

export function getJob(id) {
  return getStore().jobs.get(id) ?? null;
}
