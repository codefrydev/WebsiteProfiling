import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { resolvePythonExecutable } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REPO_ROOT = process.env.WEBSITE_PROFILING_ROOT || path.resolve(process.cwd(), '..');

type ExportFormat = 'csv' | 'json' | 'html' | 'pdf';

const FORMATS: ExportFormat[] = ['csv', 'json', 'html', 'pdf'];

function exportScript(format: ExportFormat): string {
  const fn =
    format === 'csv'
      ? 'export_audit_csv'
      : format === 'json'
        ? 'export_audit_json'
        : format === 'html'
          ? 'export_audit_html'
          : 'export_audit_pdf';
  if (format === 'pdf') {
    return `
import sys
from website_profiling.tools.export_audit import export_audit_pdf
rid = int(sys.argv[1]) if sys.argv[1] != 'latest' else None
sys.stdout.buffer.write(export_audit_pdf(rid))
`;
  }
  return `
import sys
from website_profiling.tools.export_audit import ${fn}
rid = int(sys.argv[1]) if sys.argv[1] != 'latest' else None
print(${fn}(rid), end='')
`;
}

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const format = (request.nextUrl.searchParams.get('format') || 'csv').toLowerCase() as ExportFormat;
  const reportId = request.nextUrl.searchParams.get('reportId');
  const dispositionParam = request.nextUrl.searchParams.get('disposition');
  if (!FORMATS.includes(format)) {
    return NextResponse.json(
      { error: 'format must be csv, json, html, or pdf' },
      { status: 400 },
    );
  }

  const python = resolvePythonExecutable(process.env.PYTHON, REPO_ROOT);
  const script = exportScript(format);
  const ridArg = reportId && /^\d+$/.test(reportId) ? reportId : 'latest';
  const isBinary = format === 'pdf';

  return new Promise((resolve) => {
    const proc = spawn(python, ['-c', script, ridArg], {
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
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(NextResponse.json({ error: err.trim() || 'Export failed' }, { status: 500 }));
        return;
      }
      const body = Buffer.concat(chunks);
      const inline = dispositionParam === 'inline' || format === 'html';
      const disposition = inline ? 'inline' : 'attachment';
      const filenames: Record<ExportFormat, string> = {
        csv: 'audit-export.csv',
        json: 'audit-export.json',
        html: 'audit-export.html',
        pdf: 'audit-export.pdf',
      };
      const contentTypes: Record<ExportFormat, string> = {
        csv: 'text/csv; charset=utf-8',
        json: 'application/json; charset=utf-8',
        html: 'text/html; charset=utf-8',
        pdf: 'application/pdf',
      };
      resolve(
        new NextResponse(isBinary ? body : body.toString('utf-8'), {
          headers: {
            'Content-Type': contentTypes[format],
            'Content-Disposition': `${disposition}; filename="${filenames[format]}"`,
          },
        }),
      );
    });
  });
};
