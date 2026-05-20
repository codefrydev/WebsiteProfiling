import { NextResponse } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getReportDbPath } from '@/server/reportSqlite';
import initSqlJs from 'sql.js';
import fs from 'fs';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/google/keywords/by-page?url=https://example.com/page
 *
 * Returns all keyword_data rows for a given page URL,
 * plus cannibalisation entries involving that URL.
 */
export async function GET(request) {
  const guard = forbiddenIfNotLocal(request);
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const pageUrl = (searchParams.get('url') || '').trim();

  if (!pageUrl) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
  }

  const dbPath = getReportDbPath();
  if (!dbPath || !fs.existsSync(dbPath)) {
    return NextResponse.json({ keywords: [], cannibalisation: [] });
  }

  try {
    const SQL = await initSqlJs();
    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(new Uint8Array(buf));

    try {
      const res = db.exec('SELECT data FROM keyword_data ORDER BY id DESC LIMIT 1');
      if (!res.length || !res[0].values.length) {
        return NextResponse.json({ keywords: [], cannibalisation: [] });
      }

      const data = JSON.parse(res[0].values[0][0]);
      const allRows = data.rows || [];

      const normalizedTarget = pageUrl.toLowerCase().replace(/\/$/, '');
      const pageKeywords = allRows.filter((r) => {
        const u = (r.gsc_url || '').toLowerCase().replace(/\/$/, '');
        return u === normalizedTarget || u.includes(normalizedTarget) || normalizedTarget.includes(u);
      });

      const cannib = (data.cannibalisation || []).filter((c) =>
        (c.pages || []).some((p) => {
          const u = (p.url || '').toLowerCase().replace(/\/$/, '');
          return u === normalizedTarget;
        }),
      );

      return NextResponse.json({
        url: pageUrl,
        keyword_count: pageKeywords.length,
        keywords: pageKeywords,
        cannibalisation: cannib,
        fetched_at: data.fetched_at,
      });
    } finally {
      db.close();
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
