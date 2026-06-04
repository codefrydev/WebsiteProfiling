import path from 'path';
import pg from 'pg';
import type { Pool, PoolClient } from 'pg';

const { Pool: PgPool } = pg;

let pool: Pool | null = null;

function getDatabaseUrl(): string {
  const url = (process.env.DATABASE_URL || '').trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL is required. Example: postgres://user:pass@localhost:5432/website_profiling',
    );
  }
  return url;
}

export function getPool(): Pool {
  if (!pool) {
    const max = parseInt(process.env.PGPOOL_MAX || '20', 10);
    pool = new PgPool({
      connectionString: getDatabaseUrl(),
      max: Number.isFinite(max) && max > 0 ? max : 20,
    });
  }
  return pool;
}

export async function withDb<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Data volume for secrets and shadow pipeline config (default: <repo>/data). */
export function getDataDir(): string {
  const explicit = (process.env.DATA_DIR || '').trim();
  if (explicit) return explicit;
  const repoRoot =
    (process.env.WEBSITE_PROFILING_ROOT || '').trim() ||
    path.resolve(process.cwd(), '..');
  return path.join(repoRoot, 'data');
}
