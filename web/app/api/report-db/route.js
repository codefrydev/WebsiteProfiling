import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = process.env.WEBSITE_PROFILING_ROOT || path.resolve(process.cwd(), '..');

function forbiddenIfNotLocal(request) {
  const host = (request.headers.get('host') || '').split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') {
    return NextResponse.json({ error: 'Only available on localhost' }, { status: 403 });
  }
  return null;
}

export async function GET(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const dbPath = process.env.REPORT_DB_PATH || path.join(REPO_ROOT, 'report.db');
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ error: 'report.db not found' }, { status: 404 });
  }
  const buf = fs.readFileSync(dbPath);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/x-sqlite3',
      'Cache-Control': 'no-store',
    },
  });
}
