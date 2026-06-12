import { spawn } from 'child_process';
import { NextResponse } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getPipelineSpawnEnv, getRepoRoot } from '@/server/pipelineSpawnEnv';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHECK_SCRIPT =
  'from website_profiling.crawl.fetchers import ensure_browser_deps; import json; print(json.dumps(ensure_browser_deps()))';

/** First-time Playwright/Chromium install can take a few minutes. */
const CHECK_TIMEOUT_MS = 180_000;

/**
 * GET /api/crawl/browser-status
 * Returns whether Playwright and Chromium are available for JS/auto crawls.
 */
export const GET: ApiRouteHandler = async (request): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);

  return new Promise<Response>((resolve) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(pythonExe, ['-c', CHECK_SCRIPT], {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(),
      shell: false,
    });

    const appendStdout = (chunk: Buffer | string): void => {
      stdout += chunk.toString();
    };
    const appendStderr = (chunk: Buffer | string): void => {
      stderr += chunk.toString();
    };
    proc.stdout?.on('data', appendStdout);
    proc.stderr?.on('data', appendStderr);

    const finish = (payload: { ok: boolean; message?: string; error?: string }, status = 200) => {
      resolve(NextResponse.json(payload, { status }));
    };

    proc.on('error', (err: Error) => {
      finish({
        ok: false,
        message: formatPythonSpawnError(err, pythonExe, repoRoot),
        error: err.message,
      });
    });

    proc.on('close', (code: number | null) => {
      if (code !== 0) {
        finish({
          ok: false,
          message:
            stderr.trim() ||
            'JavaScript crawl requires Playwright and Chromium. Install: pip install -r requirements.txt.',
          error: stderr.trim() || `exit ${code}`,
        });
        return;
      }
      try {
        const line = stdout.trim().split('\n').filter(Boolean).pop() || '{}';
        const parsed = JSON.parse(line) as { ok?: boolean; message?: string };
        finish({
          ok: Boolean(parsed.ok),
          message: parsed.message,
        });
      } catch {
        finish({
          ok: false,
          message: 'Could not parse browser status from Python.',
          error: stdout.slice(-500) || stderr.slice(-500),
        });
      }
    });

    setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      finish({
        ok: false,
        message: 'Browser status check timed out.',
        error: 'timeout',
      });
    }, CHECK_TIMEOUT_MS);
  });
};
