import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuthForChat } from '@/server/auth';
import { resolvePythonExecutable, formatPythonSpawnError } from '@/server/resolvePython';
import type { ApiRouteHandlerWithParams } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REPO_ROOT = process.env.WEBSITE_PROFILING_ROOT || path.resolve(process.cwd(), '..');

const ARTIFACT_SCRIPT = `
import json
import sys
from website_profiling.tools.export_artifacts import read_artifact_bytes
aid = sys.argv[1]
result = read_artifact_bytes(aid)
if not result:
    print(json.dumps({"error": "not found"}))
else:
    meta, data = result
    import base64
    print(json.dumps({
        "filename": meta.get("filename"),
        "mime_type": meta.get("mime_type"),
        "data_base64": base64.b64encode(data).decode("ascii"),
    }))
`;

export const GET: ApiRouteHandlerWithParams<{ id: string }> = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuthForChat(request);
  if (authDenied) return authDenied;

  const { id } = await context.params;
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid artifact id' }, { status: 400 });
  }

  const python = resolvePythonExecutable(process.env.PYTHON, REPO_ROOT);

  return new Promise((resolve) => {
    const proc = spawn(python, ['-c', ARTIFACT_SCRIPT, id], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PYTHONPATH: path.join(REPO_ROOT, 'src'),
        PYTHONIOENCODING: 'utf-8',
      },
    });
    let out = '';
    let err = '';
    proc.stdout.on('data', (c: Buffer | string) => {
      out += c.toString();
    });
    proc.stderr.on('data', (c) => {
      err += c.toString();
    });
    proc.on('error', (spawnErr: Error) => {
      resolve(NextResponse.json({ error: formatPythonSpawnError(spawnErr, python, REPO_ROOT) }, { status: 500 }));
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(NextResponse.json({ error: err.trim() || 'Artifact read failed' }, { status: 500 }));
        return;
      }
      try {
        const parsed = JSON.parse(out.trim()) as {
          error?: string;
          filename?: string;
          mime_type?: string;
          data_base64?: string;
        };
        if (parsed.error || !parsed.data_base64) {
          resolve(NextResponse.json({ error: 'Artifact not found' }, { status: 404 }));
          return;
        }
        const body = Buffer.from(parsed.data_base64, 'base64');
        const rawName = parsed.filename || 'export.bin';
        // Sanitize the ASCII fallback (strip non-printable/quote/slash chars so
        // a CR/LF or quote can't break or inject the header) and provide an
        // RFC 5987 filename* for the full UTF-8 name.
        const asciiName =
          rawName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\/]/g, '_') || 'export.bin';
        const mime = parsed.mime_type || 'application/octet-stream';
        resolve(
          new NextResponse(body, {
            headers: {
              'Content-Type': mime,
              'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
            },
          }),
        );
      } catch {
        resolve(NextResponse.json({ error: 'Invalid artifact response' }, { status: 500 }));
      }
    });
  });
};
