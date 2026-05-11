import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

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
  'warnings',
  'enrich',
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
 * @param {string | undefined} configRelative
 * @param {string} repoRoot
 */
function resolveConfigPath(configRelative, repoRoot) {
  const rel = (configRelative || 'input.txt').replace(/\\/g, '/').replace(/^\/+/, '');
  if (rel.includes('..')) throw new Error('Invalid config path');
  const abs = path.resolve(repoRoot, rel);
  const normalizedRoot = path.resolve(repoRoot);
  if (!abs.startsWith(normalizedRoot)) throw new Error('Config must stay under repo root');
  return abs;
}

const MAX_INLINE_CONFIG_BYTES = 512 * 1024;

/**
 * @param {string} repoRoot
 * @param {string} content
 * @returns {string} absolute path to written file
 */
function writeInlineConfigFile(repoRoot, content) {
  // Python CLI resolves relative paths (e.g. sqlite_db = report.db) against the config file's
  // directory (see cli.py: cwd = dirname(cfg_path)). Config must live at repo root so report.db
  // matches REPORT_DB_PATH / Next.js reader (repo/report.db), not .web-pipeline/report.db.
  const name = `.website-profiling-ui-${Date.now()}-${randomUUID().slice(0, 8)}.txt`;
  const abs = path.join(repoRoot, name);
  const buf = Buffer.from(String(content), 'utf8');
  if (buf.length > MAX_INLINE_CONFIG_BYTES) {
    throw new Error('Config content too large');
  }
  if (buf.includes(0)) {
    throw new Error('Invalid config content');
  }
  fs.writeFileSync(abs, buf, { encoding: 'utf8' });
  return abs;
}

/**
 * @param {string | null | undefined} command
 * @param {string | undefined} configRelative
 * @param {{ python?: string, repoRoot?: string, configContent?: string }} [options]
 */
export function startPipelineJob(command, configRelative, options = {}) {
  if (command != null && command !== '' && !ALLOWED_COMMANDS.has(command)) {
    throw new Error('Invalid command');
  }
  const store = getStore();
  if (store.running) {
    throw new Error('A pipeline job is already running');
  }

  const repoRoot = resolveRepoRoot(options.repoRoot);
  const pythonExe = sanitizePython(options.python);
  const inline =
    options.configContent != null && String(options.configContent).trim() !== ''
      ? String(options.configContent)
      : null;
  const cfgPath = inline
    ? writeInlineConfigFile(repoRoot, inline)
    : resolveConfigPath(configRelative, repoRoot);
  if (!inline && !fs.existsSync(cfgPath)) {
    throw new Error(`Config file not found: ${cfgPath}`);
  }

  const id = randomUUID();
  const entry = { status: 'running', exitCode: null, log: '' };
  store.jobs.set(id, entry);
  store.running = true;

  const args = ['-m', 'src', '--config', cfgPath];
  if (command) args.push(command);

  const proc = spawn(pythonExe, args, {
    cwd: repoRoot,
    env: { ...process.env },
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
