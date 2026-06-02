import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getPipelineSpawnEnv, getRepoRoot } from '@/server/pipelineSpawnEnv';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/google/properties
 * Spawns `python -m src google --list-properties` (config from PostgreSQL).
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);

  return new Promise<Response>((resolve) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(
      pythonExe,
      ['-m', 'src', 'google', '--list-properties'],
      { cwd: repoRoot, env: getPipelineSpawnEnv(), shell: false },
    );

    proc.stdout?.on('data', (c: Buffer | string) => { stdout += c.toString(); });
    proc.stderr?.on('data', (c: Buffer | string) => { stderr += c.toString(); });

    proc.on('error', (err: Error) => {
      resolve(NextResponse.json({ error: formatPythonSpawnError(err, pythonExe, repoRoot) }, { status: 500 }));
    });

    proc.on('close', (code: number | null) => {
      if (code !== 0) {
        resolve(
          NextResponse.json(
            { error: stderr.trim() || 'Failed to list properties', exitCode: code },
            { status: 500 },
          ),
        );
        return;
      }
      try {
        const data: unknown = JSON.parse(stdout.trim());
        resolve(NextResponse.json(data));
      } catch {
        resolve(
          NextResponse.json(
            { error: 'Could not parse properties response from Python' },
            { status: 500 },
          ),
        );
      }
    });

    setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve(NextResponse.json({ error: 'Timed out listing properties' }, { status: 504 }));
    }, 30_000);
  });
};
