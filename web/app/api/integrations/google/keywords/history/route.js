import { NextResponse } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getReportDbPath } from '@/server/reportSqlite';
import initSqlJs from 'sql.js';
import fs from 'fs';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/google/keywords/history?keyword=seo+audit&limit=30
 *
 * Returns position history for a single keyword (for sparkline rendering).
 */
export async function GET(request) {
  const guard = forbiddenIfNotLocal(request);
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const keyword = (searchParams.get('keyword') || '').trim();
  const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 90);

  if (!keyword) {
    return NextResponse.json({ error: 'keyword parameter is required' }, { status: 400 });
  }

  const dbPath = getReportDbPath();
  if (!dbPath || !fs.existsSync(dbPath)) {
    return NextResponse.json({ keyword, history: [] });
  }

  try {
    const SQL = await initSqlJs();
    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(new Uint8Array(buf));

    try {
      // keyword_history table may not exist yet if no enrichment has run
      let rows = [];
      try {
        const res = db.exec(
          `SELECT fetched_at, position, clicks, impressions, ctr
           FROM keyword_history
           WHERE keyword = ?
           ORDER BY id DESC
           LIMIT ${limit}`,
          [keyword],
        );
        if (res.length && res[0].values.length) {
          const cols = res[0].columns;
          rows = res[0].values.map((vals) =>
            Object.fromEntries(cols.map((c, i) => [c, vals[i]])),
          );
          rows.reverse(); // oldest first for chart rendering
        }
      } catch {
        // Table doesn't exist yet
      }

      return NextResponse.json({ keyword, history: rows });
    } finally {
      db.close();
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
