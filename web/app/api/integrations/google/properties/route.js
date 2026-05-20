import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getPipelineSpawnEnv, getRepoRoot } from '@/server/pipelineSpawnEnv';

export const runtime = 'nodejs';

const DEFAULT_PYTHON = process.env.PYTHON || 'python';

/**
 * GET /api/integrations/google/properties
 * Spawns `python -m src google --list-properties` (config from report.db).
 */
export async function GET(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const repoRoot = getRepoRoot();
  const pythonExe = String(process.env.PYTHON || DEFAULT_PYTHON).trim() || DEFAULT_PYTHON;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(
      pythonExe,
      ['-m', 'src', 'google', '--list-properties'],
      { cwd: repoRoot, env: getPipelineSpawnEnv(), shell: false }
    );

    proc.stdout?.on('data', (c) => { stdout += c.toString(); });
    proc.stderr?.on('data', (c) => { stderr += c.toString(); });

    proc.on('error', (err) => {
      resolve(NextResponse.json({ error: err.message }, { status: 500 }));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(
          NextResponse.json(
            { error: stderr.trim() || 'Failed to list properties', exitCode: code },
            { status: 500 }
          )
        );
        return;
      }
      try {
        const data = JSON.parse(stdout.trim());
        resolve(NextResponse.json(data));
      } catch {
        resolve(
          NextResponse.json(
            { error: 'Could not parse properties response from Python' },
            { status: 500 }
          )
        );
      }
    });

    setTimeout(() => {
      try { proc.kill(); } catch {}
      resolve(NextResponse.json({ error: 'Timed out listing properties' }, { status: 504 }));
    }, 30_000);
  });
}
