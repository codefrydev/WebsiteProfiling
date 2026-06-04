import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getPropertyById } from '@/server/propertiesDb';
import { getPipelineSpawnEnv, getRepoRoot } from '@/server/pipelineSpawnEnv';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import type { ApiRouteHandlerWithParams } from '@/types/api';

export const runtime = 'nodejs';

export const POST: ApiRouteHandlerWithParams<{ id: string }> = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const { id } = await params;
  const propertyId = parseInt(id, 10);
  if (!Number.isFinite(propertyId)) {
    return NextResponse.json({ error: 'Invalid property id' }, { status: 400 });
  }
  const row = await getPropertyById(propertyId);
  if (!row) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 });
  }

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);

  return new Promise<Response>((resolve) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(
      pythonExe,
      ['-m', 'src', 'google', '--test', '--property-id', String(propertyId)],
      { cwd: repoRoot, env: getPipelineSpawnEnv(repoRoot, propertyId), shell: false },
    );

    proc.stdout?.on('data', (c: Buffer | string) => {
      stdout += c.toString();
    });
    proc.stderr?.on('data', (c: Buffer | string) => {
      stderr += c.toString();
    });

    proc.on('error', (err: Error) => {
      resolve(
        NextResponse.json(
          { error: formatPythonSpawnError(err, pythonExe, repoRoot) },
          { status: 500 },
        ),
      );
    });

    proc.on('close', (code: number | null) => {
      const log = (stdout + stderr).trim();
      if (code === 0) {
        resolve(NextResponse.json({ ok: true, log }));
      } else {
        resolve(NextResponse.json({ ok: false, log, exitCode: code }, { status: 400 }));
      }
    });

    setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      resolve(NextResponse.json({ error: 'Timed out' }, { status: 504 }));
    }, 60_000);
  });
};
