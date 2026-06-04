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

export function getDataDir(): string {
  return (process.env.DATA_DIR || process.cwd()).trim() || process.cwd();
}
