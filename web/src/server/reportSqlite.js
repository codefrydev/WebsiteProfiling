import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { listReportsFromDatabase, readReportPayloadFromDatabase, getCrawlRunsRows } from '@/lib/loadReportDb';

const REPO_ROOT = process.env.WEBSITE_PROFILING_ROOT || path.resolve(process.cwd(), '..');

export function getReportDbPath() {
  return process.env.REPORT_DB_PATH || path.join(REPO_ROOT, 'report.db');
}

/**
 * Open report.db with sql.js (Node only — no browser WASM).
 * Caller must db.close().
 */
export async function openReportDatabaseFile() {
  const file = getReportDbPath();
  if (!fs.existsSync(file)) {
    throw new Error(`report.db not found at ${file}`);
  }
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(file);
  return new SQL.Database(new Uint8Array(buf));
}

export async function withReportDb(fn) {
  const db = await openReportDatabaseFile();
  try {
    return await fn(db);
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

export async function getReportMeta() {
  return withReportDb((db) => ({
    reports: listReportsFromDatabase(db),
    crawlRuns: getCrawlRunsRows(db),
  }));
}

export async function getReportPayload(reportId) {
  return withReportDb((db) => readReportPayloadFromDatabase(db, reportId));
}
