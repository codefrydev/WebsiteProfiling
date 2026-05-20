import { NextResponse } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getReportDbPath } from '@/server/reportSqlite';
import initSqlJs from 'sql.js';
import fs from 'fs';

export const runtime = 'nodejs';

const MAX_KEYWORDS = 100;
const MAX_LIMIT_PER_KEYWORD = 90;

/**
 * POST /api/integrations/google/keywords/history/batch
 * Body: { keywords: string[], limit?: number }
 * Returns: { histories: { [keyword]: HistoryPoint[] } }
 */
export async function POST(request) {
  const guard = forbiddenIfNotLocal(request);
  if (guard) return guard;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawKeywords = Array.isArray(body.keywords) ? body.keywords : [];
  const keywords = [...new Set(rawKeywords.map((k) => String(k || '').trim()).filter(Boolean))].slice(
    0,
    MAX_KEYWORDS,
  );
  const limit = Math.min(
    Math.max(parseInt(String(body.limit ?? '30'), 10) || 30, 1),
    MAX_LIMIT_PER_KEYWORD,
  );

  if (!keywords.length) {
    return NextResponse.json({ histories: {} });
  }

  const dbPath = getReportDbPath();
  if (!dbPath || !fs.existsSync(dbPath)) {
    return NextResponse.json({ histories: {} });
  }

  try {
    const SQL = await initSqlJs();
    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(new Uint8Array(buf));

    try {
      const histories = {};
      for (const keyword of keywords) {
        histories[keyword] = [];
      }

      try {
        const placeholders = keywords.map(() => '?').join(', ');
        const res = db.exec(
          `SELECT keyword, fetched_at, position, clicks, impressions, ctr
           FROM keyword_history
           WHERE keyword IN (${placeholders})
           ORDER BY keyword, id DESC`,
          keywords,
        );

        if (res.length && res[0].values.length) {
          const cols = res[0].columns;
          const kwIdx = cols.indexOf('keyword');
          const buckets = {};
          for (const kw of keywords) {
            buckets[kw] = [];
          }

          for (const vals of res[0].values) {
            const row = Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
            const kw = String(row.keyword ?? '');
            if (!buckets[kw]) continue;
            if (buckets[kw].length >= limit) continue;
            buckets[kw].push({
              fetched_at: row.fetched_at,
              position: row.position,
              clicks: row.clicks,
              impressions: row.impressions,
              ctr: row.ctr,
            });
          }

          for (const kw of keywords) {
            histories[kw] = (buckets[kw] || []).reverse();
          }
        }
      } catch {
        // keyword_history table may not exist yet
      }

      return NextResponse.json({ histories });
    } finally {
      db.close();
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
