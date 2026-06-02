import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getPublicStatus } from '@/server/googleSecrets';
import { withDb } from '@/server/db';
import type { ApiRouteHandler } from '@/types/api';
import type { PoolClient } from 'pg';

export const runtime = 'nodejs';

async function getLastFetchedAt(): Promise<string | null> {
  try {
    return await withDb(async (client: PoolClient) => {
      const { rows } = await client.query(
        'SELECT fetched_at FROM google_data ORDER BY id DESC LIMIT 1',
      );
      return rows.length ? String(rows[0].fetched_at) : null;
    });
  } catch {
    return null;
  }
}

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const status = getPublicStatus();
  const lastFetchedAt = await getLastFetchedAt();

  return NextResponse.json({ ...status, lastFetchedAt });
};
