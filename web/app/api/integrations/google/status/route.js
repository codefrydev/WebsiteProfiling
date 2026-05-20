import { NextResponse } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getPublicStatus } from '@/server/googleSecrets';
import { getReportDbPath } from '@/server/reportSqlite';
import initSqlJs from 'sql.js';
import fs from 'fs';

export const runtime = 'nodejs';

async function getLastFetchedAt() {
  const dbPath = getReportDbPath();
  if (!dbPath || !fs.existsSync(dbPath)) return null;
  try {
    const SQL = await initSqlJs();
    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(new Uint8Array(buf));
    try {
      const res = db.exec(
        'SELECT fetched_at FROM google_data ORDER BY id DESC LIMIT 1'
      );
      if (res.length > 0 && res[0].values.length > 0) {
        return res[0].values[0][0];
      }
      return null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function GET(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const status = getPublicStatus();
  const lastFetchedAt = await getLastFetchedAt();

  return NextResponse.json({ ...status, lastFetchedAt });
}
