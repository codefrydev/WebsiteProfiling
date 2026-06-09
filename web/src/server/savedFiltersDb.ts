import { withDb } from '@/server/db';

export interface SavedCrawlFilterRow {
  id: number;
  propertyId: number;
  name: string;
  filterJson: Record<string, unknown>;
  createdAt: string;
}

export async function listSavedFilters(propertyId: number): Promise<SavedCrawlFilterRow[]> {
  return withDb(async (client) => {
    const res = await client.query<{
      id: number;
      property_id: number;
      name: string;
      filter_json: Record<string, unknown>;
      created_at: string;
    }>(
      `SELECT id, property_id, name, filter_json, created_at
       FROM saved_crawl_filters WHERE property_id = $1 ORDER BY name`,
      [propertyId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      name: r.name,
      filterJson: r.filter_json || {},
      createdAt: r.created_at,
    }));
  });
}

export async function upsertSavedFilter(
  propertyId: number,
  name: string,
  filterJson: Record<string, unknown>,
): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO saved_crawl_filters (property_id, name, filter_json)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (property_id, name) DO UPDATE SET filter_json = EXCLUDED.filter_json`,
      [propertyId, name, JSON.stringify(filterJson || {})],
    );
  });
}

export async function deleteSavedFilter(propertyId: number, name: string): Promise<void> {
  await withDb(async (client) => {
    await client.query(`DELETE FROM saved_crawl_filters WHERE property_id = $1 AND name = $2`, [
      propertyId,
      name,
    ]);
  });
}
