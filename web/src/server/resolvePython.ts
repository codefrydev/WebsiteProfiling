import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const WEB_CWD = process.cwd();
export const DEFAULT_REPO_ROOT =
  process.env.WEBSITE_PROFILING_ROOT || path.resolve(WEB_CWD, '..');

function isExecutableFile(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function whichOnPath(command: string): string | null {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('where', [command], { encoding: 'utf8' }).trim();
      const first = out.split(/\r?\n/).find((line) => line.trim());
      return first?.trim() || null;
    }
    const out = execFileSync('/usr/bin/env', ['which', command], { encoding: 'utf8' }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/**
 * Resolve a Python binary for spawning `python -m src`.
 * Prefers explicit paths, PYTHON env, repo .venv, then python3 on PATH.
 */
export function resolvePythonExecutable(
  override: string | undefined | null,
  repoRoot: string = DEFAULT_REPO_ROOT,
): string {
  const trimmed = String(override ?? '').trim();

  if (trimmed && (path.isAbsolute(trimmed) || trimmed.includes(path.sep))) {
    if (isExecutableFile(trimmed)) return trimmed;
    throw new Error(`Python executable not found: ${trimmed}`);
  }

  const generic = !trimmed || trimmed === 'python' || trimmed === 'python3';

  if (!generic) {
    const onPath = whichOnPath(trimmed);
    if (onPath && isExecutableFile(onPath)) return onPath;
    throw new Error(`Python executable not found on PATH: ${trimmed}`);
  }

  const envPy = String(process.env.PYTHON || '').trim();
  if (envPy && isExecutableFile(envPy)) return envPy;

  const venvCandidates = [
    path.join(repoRoot, '.venv', 'bin', 'python'),
    path.join(repoRoot, '.venv', 'bin', 'python3'),
    path.join(repoRoot, '.venv', 'Scripts', 'python.exe'),
    path.join(repoRoot, 'activate', 'bin', 'python'),
    path.join(repoRoot, 'activate', 'bin', 'python3'),
  ];
  for (const candidate of venvCandidates) {
    if (isExecutableFile(candidate)) return candidate;
  }

  const pathNames = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  for (const name of pathNames) {
    const found = whichOnPath(name);
    if (found && isExecutableFile(found)) return found;
  }

  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Parse JSON from Python CLI stdout when log lines may precede the payload.
 * Tries each non-empty line from the bottom; also handles `{...}` suffix on a line.
 */
export function parsePythonJsonStdout(stdout: string): Record<string, unknown> | null {
  const lines = stdout.trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    const candidates = [line];
    const jsonStart = line.lastIndexOf('{');
    if (jsonStart > 0) {
      candidates.push(line.slice(jsonStart));
    }
    for (const candidate of candidates) {
      if (!candidate.startsWith('{') && !candidate.startsWith('[')) continue;
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        /* try next candidate */
      }
    }
  }
  return null;
}

export function formatPythonSpawnError(err: Error, resolvedPython: string, repoRoot: string): string {
  if (!/ENOENT/i.test(err.message)) {
    return err.message;
  }
  const venvHint = path.join(repoRoot, '.venv', 'bin', 'python');
  return (
    `${err.message} — could not run "${resolvedPython}". ` +
    `On macOS/Linux use python3 or set PYTHON to your venv, e.g. ${venvHint}. ` +
    'Update Pipeline → Advanced → Python executable, or export PYTHON before starting the web app.'
  );
}
