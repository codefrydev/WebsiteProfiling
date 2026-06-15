import { NextResponse, type NextRequest } from 'next/server';
import { requireApiAuth } from '@/server/auth';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { withDb } from '@/server/db';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/logs/upload — parse access log and store analysis (Phase 6).
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  const form = await request.formData();
  const file = form.get('file');
  const propertyId = Number(form.get('propertyId') || '0');
  if (!propertyId || !(file instanceof File)) {
    return NextResponse.json({ error: 'propertyId and file required' }, { status: 400 });
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/);

  try {
    const { spawn } = await import('child_process');
    const path = await import('path');
    const repoRoot = process.env.WEBSITE_PROFILING_ROOT || path.resolve(process.cwd(), '..');
    const analysis = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const startUrl = String(form.get('startUrl') || '');
      const crawlUrlsRaw = String(form.get('crawlUrls') || '');
      const crawlUrls = crawlUrlsRaw ? crawlUrlsRaw.split('\n').filter(Boolean) : [];
      const script = `
import json, sys
from website_profiling.analysis.log_parser import parse_access_log_lines, compare_log_to_crawl
lines = sys.stdin.read().splitlines()
analysis = parse_access_log_lines(lines)
meta = json.loads(sys.argv[1])
start = meta.get("start_url") or ""
crawl_urls = meta.get("crawl_urls") or []
if start and crawl_urls:
    analysis["crawl_compare"] = compare_log_to_crawl(analysis, crawl_urls, start)
print(json.dumps(analysis))
`;
      const meta = JSON.stringify({ start_url: startUrl, crawl_urls: crawlUrls });
      const proc = spawn('python3', ['-c', script, meta], { cwd: repoRoot, shell: false });
      let out = '';
      let errOut = '';
      proc.stdout?.on('data', (c: Buffer) => { out += c.toString(); });
      proc.stderr?.on('data', (c: Buffer) => { errOut += c.toString(); });
      proc.stdin?.write(text);
      proc.stdin?.end();
      proc.on('error', (e) => reject(e));
      proc.on('close', (code) => {
        if (code !== 0) reject(new Error(errOut || out || 'parse failed'));
        else {
          try {
            resolve(JSON.parse(out.trim() || '{}') as Record<string, unknown>);
          } catch {
            reject(new Error('Invalid JSON response from log parser'));
          }
        }
      });
    });
    await withDb(async (client) => {
      await client.query(
        `INSERT INTO log_file_uploads (property_id, filename, line_count, analysis)
         VALUES ($1, $2, $3, $4)`,
        [propertyId, file.name, lines.length, JSON.stringify(analysis)],
      );
    });
    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
