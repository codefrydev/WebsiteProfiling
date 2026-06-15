import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getPipelineSpawnEnv, getRepoRoot } from '@/server/pipelineSpawnEnv';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

/**
 * POST /api/integrations/google/test
 * Spawns `python -m src google --test` (config from PostgreSQL pipeline_config).
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);

  return new Promise<Response>((resolve) => {
    let log = '';
    const proc = spawn(pythonExe, ['-m', 'src', 'google', '--test'], {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(),
      shell: false,
    });

    const append = (chunk: Buffer | string): void => {
      log += chunk.toString();
      if (log.length > 32_000) log = log.slice(-28_000);
    };
    proc.stdout?.on('data', append);
    proc.stderr?.on('data', append);

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      const message = formatPythonSpawnError(err, pythonExe, repoRoot);
      resolve(
        NextResponse.json({ ok: false, log, error: message }, { status: 500 }),
      );
    });

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      resolve(NextResponse.json({ ok: code === 0, log, exitCode: code }));
    });

    // Safety timeout: 30s
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve(
        NextResponse.json({ ok: false, log, error: 'Test timed out after 30s' }, { status: 504 }),
      );
    }, 30_000);
  });
};
