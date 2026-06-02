/**
 * Atomic read/write helpers for .secrets/google.json.
 *
 * Path resolution order (Docker-aware):
 *   1. $GOOGLE_SECRETS_PATH env var (explicit override, e.g. /data/.secrets/google.json in Docker)
 *   2. $DATA_DIR/.secrets/google.json  (Docker: /data/.secrets/google.json)
 *   3. WEBSITE_PROFILING_ROOT + /.secrets/google.json    (local dev default)
 */
import fs from 'fs';
import path from 'path';
import { getDataDir } from '@/server/db';
import type { GooglePublicStatus, GoogleSecrets } from '@/types/api';

const WEB_CWD = process.cwd();
const DEFAULT_REPO_ROOT =
  process.env.WEBSITE_PROFILING_ROOT || path.resolve(WEB_CWD, '..');

function resolveSecretsPath(): string {
  // 1. Explicit env override
  const explicit = (process.env.GOOGLE_SECRETS_PATH || '').trim();
  if (explicit) return explicit;

  // 2. DATA_DIR (Docker volume /data)
  const dataDir = (process.env.DATA_DIR || getDataDir()).trim();
  if (dataDir) {
    return path.join(path.resolve(dataDir), '.secrets', 'google.json');
  }

  // 3. Repo root (local dev)
  return path.join(DEFAULT_REPO_ROOT, '.secrets', 'google.json');
}

export function getSecretsPath(): string {
  return resolveSecretsPath();
}

function isGoogleSecrets(value: unknown): value is GoogleSecrets {
  return value != null && typeof value === 'object';
}

/**
 * Read and parse the secrets file.
 * Returns null if the file does not exist or cannot be parsed.
 */
export function readSecrets(): GoogleSecrets | null {
  const p = resolveSecretsPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isGoogleSecrets(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Atomically merge `patch` into the existing secrets file.
 * Creates parent directories if needed.
 * Uses write-to-temp-then-rename to prevent corruption from concurrent access.
 */
export function writeSecrets(patch: Partial<GoogleSecrets>): void {
  const p = resolveSecretsPath();
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });

  const existing = readSecrets() || {};
  const merged: GoogleSecrets = { ...existing, ...patch };
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

/**
 * Overwrite the secrets file entirely with `data`.
 * Atomic: write-to-temp-then-rename.
 */
export function overwriteSecrets(data: GoogleSecrets): void {
  const p = resolveSecretsPath();
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

/** Return a safe status object (no secrets) for the frontend. */
export function getPublicStatus(): GooglePublicStatus {
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
    hasClientId: !!s.clientId,
    gscSiteUrl: s.gscSiteUrl || null,
    ga4PropertyId: s.ga4PropertyId || null,
    dateRangeDays: s.dateRangeDays || 28,
    authMode: s.authMode || null,
  };
}
