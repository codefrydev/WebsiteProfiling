/**
 * Atomic read/write helpers for .secrets/google.json.
 *
 * Path resolution order (Docker-aware):
 *   1. $GOOGLE_SECRETS_PATH env var (explicit override, e.g. /data/.secrets/google.json in Docker)
 *   2. dirname($REPORT_DB_PATH) + /.secrets/google.json  (Docker: /data/.secrets/google.json)
 *   3. WEBSITE_PROFILING_ROOT + /.secrets/google.json    (local dev default)
 */
import fs from 'fs';
import path from 'path';

const WEB_CWD = process.cwd();
const DEFAULT_REPO_ROOT =
  process.env.WEBSITE_PROFILING_ROOT || path.resolve(WEB_CWD, '..');

function resolveSecretsPath() {
  // 1. Explicit env override
  const explicit = (process.env.GOOGLE_SECRETS_PATH || '').trim();
  if (explicit) return explicit;

  // 2. Sibling to REPORT_DB_PATH (works in Docker where /data is the volume)
  const dbPath = (process.env.REPORT_DB_PATH || '').trim();
  if (dbPath) {
    return path.join(path.dirname(dbPath), '.secrets', 'google.json');
  }

  // 3. Repo root (local dev)
  return path.join(DEFAULT_REPO_ROOT, '.secrets', 'google.json');
}

/** @returns {string} Absolute path to .secrets/google.json */
export function getSecretsPath() {
  return resolveSecretsPath();
}

/**
 * Read and parse the secrets file.
 * Returns null if the file does not exist or cannot be parsed.
 * @returns {object | null}
 */
export function readSecrets() {
  const p = resolveSecretsPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Atomically merge `patch` into the existing secrets file.
 * Creates parent directories if needed.
 * Uses write-to-temp-then-rename to prevent corruption from concurrent access.
 * @param {object} patch
 */
export function writeSecrets(patch) {
  const p = resolveSecretsPath();
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });

  const existing = readSecrets() || {};
  const merged = { ...existing, ...patch };
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

/**
 * Overwrite the secrets file entirely with `data`.
 * Atomic: write-to-temp-then-rename.
 * @param {object} data
 */
export function overwriteSecrets(data) {
  const p = resolveSecretsPath();
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

/**
 * Return a safe status object (no secrets) for the frontend.
 * @returns {{ connected: boolean, hasClientId: boolean, gscSiteUrl: string | null, ga4PropertyId: string | null, dateRangeDays: number, authMode: string | null }}
 */
export function getPublicStatus() {
  const s = readSecrets();
  if (!s) {
    return {
      connected: false,
      hasClientId: false,
      gscSiteUrl: null,
      ga4PropertyId: null,
      dateRangeDays: 28,
      authMode: null,
    };
  }
  return {
    connected: !!(s.refreshToken || s.serviceAccount),
    hasClientId: !!(s.clientId),
    gscSiteUrl: s.gscSiteUrl || null,
    ga4PropertyId: s.ga4PropertyId || null,
    dateRangeDays: s.dateRangeDays || 28,
    authMode: s.authMode || null,
  };
}
