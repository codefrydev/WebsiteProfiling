import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getPipelineSpawnEnv, getRepoRoot } from '@/server/pipelineSpawnEnv';

export const runtime = 'nodejs';

const DEFAULT_PYTHON = process.env.PYTHON || 'python';

/**
 * POST /api/integrations/google/test
 * Spawns `python -m src google --test` (config from report.db pipeline_config).
 */
export async function POST(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const repoRoot = getRepoRoot();
  const pythonExe = String(process.env.PYTHON || DEFAULT_PYTHON).trim() || DEFAULT_PYTHON;

  return new Promise((resolve) => {
    let log = '';
    const proc = spawn(pythonExe, ['-m', 'src', 'google', '--test'], {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(),
      shell: false,
    });

    const append = (chunk) => {
      log += chunk.toString();
      if (log.length > 32_000) log = log.slice(-28_000);
    };
    proc.stdout?.on('data', append);
    proc.stderr?.on('data', append);

    proc.on('error', (err) => {
      resolve(
        NextResponse.json({ ok: false, log, error: err.message }, { status: 500 })
      );
    });

    proc.on('close', (code) => {
      resolve(NextResponse.json({ ok: code === 0, log, exitCode: code }));
    });

    // Safety timeout: 30s
    setTimeout(() => {
      try { proc.kill(); } catch {}
      resolve(
        NextResponse.json({ ok: false, log, error: 'Test timed out after 30s' }, { status: 504 })
      );
    }, 30_000);
  });
}
