import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getPropertyById } from '@/server/propertiesDb';
import { getPipelineSpawnEnv, getRepoRoot } from '@/server/pipelineSpawnEnv';
import {
  formatPythonSpawnError,
  parsePythonJsonStdout,
  resolvePythonExecutable,
} from '@/server/resolvePython';
import type { ApiRouteHandlerWithParams } from '@/types/api';

export const runtime = 'nodejs';

interface ImportBody {
  fileContent?: string;
  fileName?: string;
}

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

  const body = (await request.json().catch(() => ({}))) as ImportBody;
  const fileContent = body.fileContent;
  if (!fileContent || typeof fileContent !== 'string' || !fileContent.trim()) {
    return NextResponse.json({ error: 'fileContent is required' }, { status: 400 });
  }

  const fileName = typeof body.fileName === 'string' ? body.fileName : '';
  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);

  return new Promise<Response>((resolve) => {
    let stdout = '';
    let stderr = '';
    const args = [
      '-m',
      'src',
      'gsc-links-import',
      '--property-id',
      String(propertyId),
      '--csv-stdin',
    ];
    if (fileName) {
      args.push('--file-name', fileName);
    }

    const proc = spawn(pythonExe, args, {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(repoRoot, propertyId),
      shell: false,
    });

    proc.stdin?.write(fileContent);
    proc.stdin?.end();

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
      const parsed = parsePythonJsonStdout(stdout);
      if (parsed && code === 0 && parsed.ok) {
        resolve(NextResponse.json(parsed));
        return;
      }
      if (parsed) {
        const errMsg =
          typeof parsed.error === 'string'
            ? parsed.error
            : stdout.trim() || stderr.trim() || 'Import failed';
        resolve(NextResponse.json({ error: errMsg, detail: parsed }, { status: 400 }));
        return;
      }
      const raw = stdout.trim() || stderr.trim();
      resolve(
        NextResponse.json(
          { error: raw || 'Import failed', exitCode: code },
          { status: code === 0 ? 500 : 400 },
        ),
      );
    });

    setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      resolve(NextResponse.json({ error: 'Timed out' }, { status: 504 }));
    }, 120_000);
  });
};
