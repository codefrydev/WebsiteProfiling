import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { withDb } from '@/server/db';
import { normalizeUrl } from '@/lib/urlNorm';
import { buildPageMetricsCompare } from '@/lib/pageMetricsCompare';
import {
  loadGoogleDataRow,
  parseJsonField,
  publicGa4Page,
  publicGscPage,
  sliceFromGoogleRow,
} from '@/server/pageGoogleData';
import type { ApiRouteHandler } from '@/types/api';
import type { PoolClient } from 'pg';

export const runtime = 'nodejs';

type SnapType = 'snapshot' | 'live';

async function loadLiveSlice(
  client: PoolClient,
  id: number,
): Promise<{ id: number; fetchedAt: string | null; gsc: ReturnType<typeof publicGscPage>; ga4: ReturnType<typeof publicGa4Page> } | null> {
  const { rows } = await client.query(
    'SELECT id, fetched_at, data FROM page_google_snapshots WHERE id = $1',
    [id],
  );
  if (!rows.length) return null;
  const data = parseJsonField(rows[0].data);
  if (!data) return null;
  const gsc =
    data.gsc && typeof data.gsc === 'object'
      ? publicGscPage(data.gsc as Record<string, unknown>)
      : null;
  const ga4 =
    data.ga4 && typeof data.ga4 === 'object'
      ? publicGa4Page(data.ga4 as Record<string, unknown>)
      : null;
  return {
    id: Number(rows[0].id),
    fetchedAt: rows[0].fetched_at ? String(rows[0].fetched_at) : null,
    gsc,
    ga4,
  };
}

async function loadSnapshotSlice(client: PoolClient, id: number, pageUrl: string) {
  const row = await loadGoogleDataRow(client, id);
  if (!row) return null;
  const slice = sliceFromGoogleRow(row.raw, pageUrl);
  return {
    id: row.id,
    fetchedAt: row.fetchedAt,
    gsc: slice.gsc,
    ga4: slice.ga4,
  };
}

async function defaultCurrent(
  client: PoolClient,
  pageUrl: string,
  urlNorm: string,
): Promise<{ type: SnapType; id: number; fetchedAt: string | null; gsc: ReturnType<typeof publicGscPage>; ga4: ReturnType<typeof publicGa4Page> } | null> {
  const live = await client.query(
    `SELECT id FROM page_google_snapshots WHERE url_norm = $1 ORDER BY fetched_at DESC, id DESC LIMIT 1`,
    [urlNorm],
  );
  if (live.rows.length) {
    return { type: 'live', ...(await loadLiveSlice(client, Number(live.rows[0].id)))! };
  }
  const snap = await loadGoogleDataRow(client, null);
  if (!snap) return null;
  const slice = sliceFromGoogleRow(snap.raw, pageUrl);
  return {
    type: 'snapshot',
    id: snap.id,
    fetchedAt: snap.fetchedAt,
    gsc: slice.gsc,
    ga4: slice.ga4,
  };
}

async function defaultBaseline(
  client: PoolClient,
  pageUrl: string,
  urlNorm: string,
  currentType: SnapType,
  currentId: number,
): Promise<{ type: SnapType; id: number; fetchedAt: string | null; gsc: ReturnType<typeof publicGscPage>; ga4: ReturnType<typeof publicGa4Page> } | null> {
  if (currentType === 'live') {
    const { rows } = await client.query(
      `
      SELECT id FROM page_google_snapshots
      WHERE url_norm = $1 AND id < $2
      ORDER BY fetched_at DESC, id DESC
      LIMIT 1
      `,
      [urlNorm, currentId],
    );
    if (rows.length) {
      const s = await loadLiveSlice(client, Number(rows[0].id));
      if (s) return { type: 'live', ...s };
    }
  }

  let maxGoogleId = currentId;
  if (currentType === 'live') {
    const latest = await loadGoogleDataRow(client, null);
    maxGoogleId = latest?.id ?? 0;
  }
  const { rows } = await client.query(
    `
    SELECT id FROM google_data
    WHERE id < $1
    ORDER BY id DESC
    LIMIT 5
    `,
    [maxGoogleId],
  );
  for (const row of rows) {
    const s = await loadSnapshotSlice(client, Number(row.id), pageUrl);
    if (s && (s.gsc || s.ga4)) return { type: 'snapshot', ...s };
  }
  return null;
}

/**
 * GET /api/integrations/google/page-compare?url=...&currentType=&currentId=&baselineType=&baselineId=
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
  }

  const urlNorm = normalizeUrl(url);
  const currentType = (request.nextUrl.searchParams.get('currentType') || '') as SnapType;
  const baselineType = (request.nextUrl.searchParams.get('baselineType') || '') as SnapType;
  const currentIdParam = request.nextUrl.searchParams.get('currentId');
  const baselineIdParam = request.nextUrl.searchParams.get('baselineId');

  try {
    return await withDb(async (client: PoolClient) => {
      let current = await defaultCurrent(client, url, urlNorm);
      if (currentIdParam && currentType) {
        const id = parseInt(currentIdParam, 10);
        if (currentType === 'live') {
          const s = await loadLiveSlice(client, id);
          if (s) current = { type: 'live', ...s };
        } else {
          const s = await loadSnapshotSlice(client, id, url);
          if (s) current = { type: 'snapshot', ...s };
        }
      }

      if (!current) {
        return NextResponse.json({ error: 'No current metrics found for this URL' }, { status: 404 });
      }

      let baseline =
        baselineIdParam && baselineType
          ? null
          : await defaultBaseline(client, url, urlNorm, current.type, current.id);

      if (baselineIdParam && baselineType) {
        const id = parseInt(baselineIdParam, 10);
        if (baselineType === 'live') {
          const s = await loadLiveSlice(client, id);
          if (s) baseline = { type: 'live', ...s };
        } else {
          const s = await loadSnapshotSlice(client, id, url);
          if (s) baseline = { type: 'snapshot', ...s };
        }
      }

      const metrics = baseline
        ? buildPageMetricsCompare(
            { gsc: current.gsc, ga4: current.ga4 },
            { gsc: baseline.gsc, ga4: baseline.ga4 },
            {
              gscClicks: 'Clicks',
              gscImpressions: 'Impressions',
              gscCtr: 'CTR %',
              gscPosition: 'Avg position',
              ga4Sessions: 'Sessions',
              ga4Users: 'Users',
              ga4Views: 'Page views',
              ga4Engagement: 'Engagement rate',
              ga4Duration: 'Avg session (s)',
            },
          )
        : [];

      return NextResponse.json({
        url,
        current: {
          type: current.type,
          id: current.id,
          fetchedAt: current.fetchedAt,
          gsc: current.gsc,
          ga4: current.ga4,
        },
        baseline: baseline
          ? {
              type: baseline.type,
              id: baseline.id,
              fetchedAt: baseline.fetchedAt,
              gsc: baseline.gsc,
              ga4: baseline.ga4,
            }
          : null,
        metrics,
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
