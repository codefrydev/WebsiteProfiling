import { NextResponse } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getReportDbPath } from '@/server/reportSqlite';
import initSqlJs from 'sql.js';
import fs from 'fs';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/google/page-data?url=https://example.com/path
 * Lazy-loads per-URL Google metrics from google_data SQLite table.
 * Used by Link Explorer to avoid bloating the initial payload.
 */
export async function GET(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
  }

  const dbPath = getReportDbPath();
  if (!dbPath || !fs.existsSync(dbPath)) {
    return NextResponse.json({ gsc: null, ga4: null });
  }

  try {
    const SQL = await initSqlJs();
    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(new Uint8Array(buf));
    try {
      const res = db.exec(
        'SELECT data FROM google_data ORDER BY id DESC LIMIT 1'
      );
      if (!res.length || !res[0].values.length) {
        return NextResponse.json({ gsc: null, ga4: null });
      }
      const raw = JSON.parse(res[0].values[0][0]);
      const byPage = raw?.gsc?.by_page || {};
      const byPath = raw?.ga4?.by_path || {};

      // Normalize URL to path for GA4 lookup
      let urlPath = url;
      try {
        urlPath = new URL(url).pathname;
      } catch {}

      return NextResponse.json({
        gsc: byPage[url] || null,
        ga4: byPath[urlPath] || byPath[url] || null,
      });
    } finally {
      db.close();
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
