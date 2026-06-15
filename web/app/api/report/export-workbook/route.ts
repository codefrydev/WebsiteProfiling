import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { resolvePythonExecutable } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REPO_ROOT = process.env.WEBSITE_PROFILING_ROOT || path.resolve(process.cwd(), '..');

const WORKBOOK_SCRIPT = `
import sys
from website_profiling.db import db_session
from website_profiling.db.report_store import read_report_payload
from website_profiling.tools.export_crawl_workbook import build_crawl_workbook_zip

rid = int(sys.argv[1]) if sys.argv[1] != 'latest' else None
with db_session() as conn:
    payload = read_report_payload(conn, report_id=rid)
if not payload:
    raise SystemExit('no report found')
sys.stdout.buffer.write(build_crawl_workbook_zip(payload))
`;

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const reportId = request.nextUrl.searchParams.get('reportId');
  const python = resolvePythonExecutable(process.env.PYTHON, REPO_ROOT);
  const ridArg = reportId && /^\d+$/.test(reportId) ? reportId : 'latest';

  return new Promise((resolve) => {
    const proc = spawn(python, ['-c', WORKBOOK_SCRIPT, ridArg], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PYTHONPATH: path.join(REPO_ROOT, 'src'),
        PYTHONIOENCODING: 'utf-8',
      },
    });
    const chunks: Buffer[] = [];
    let err = '';
    proc.stdout.on('data', (c: Buffer | string) => {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    });
    proc.stderr.on('data', (c) => {
      err += c.toString();
    });
    proc.on('error', () => {
      resolve(NextResponse.json({ error: 'Workbook export failed: could not start Python process' }, { status: 500 }));
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(NextResponse.json({ error: 'Workbook export failed' }, { status: 500 }));
        return;
      }
      const body = Buffer.concat(chunks);
      resolve(
        new NextResponse(body, {
          status: 200,
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename="crawl-workbook.zip"',
          },
        }),
      );
    });
  });
};
