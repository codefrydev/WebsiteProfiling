import { withDb } from '@/server/db';

export interface PropertyRow {
  id: number;
  name: string;
  canonical_domain: string;
  site_url: string | null;
  gsc_site_url: string | null;
  ga4_property_id: string | null;
  default_crawl_preset: string | null;
  crawl_authorized_at: string | null;
}

export async function listProperties(): Promise<PropertyRow[]> {
  return withDb(async (client) => {
    const cur = await client.query<PropertyRow>(
      `SELECT id, name, canonical_domain, site_url, gsc_site_url, ga4_property_id,
              default_crawl_preset, crawl_authorized_at::text
       FROM properties ORDER BY name ASC`,
    );
    return cur.rows;
  });
}

export async function upsertPropertyByDomain(
  name: string,
  canonicalDomain: string,
  siteUrl: string | null,
): Promise<number> {
  return withDb(async (client) => {
    const cur = await client.query<{ id: string }>(
      `INSERT INTO properties (name, canonical_domain, site_url, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (canonical_domain) DO UPDATE SET
         name = EXCLUDED.name,
         site_url = COALESCE(EXCLUDED.site_url, properties.site_url),
         updated_at = now()
       RETURNING id`,
      [name, canonicalDomain.toLowerCase(), siteUrl],
    );
    return Number(cur.rows[0]?.id);
  });
}

export async function setPropertyCrawlAuthorized(propertyId: number): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `UPDATE properties SET crawl_authorized_at = now(), updated_at = now() WHERE id = $1`,
      [propertyId],
    );
  });
}

export async function getPropertyByDomain(domain: string): Promise<PropertyRow | null> {
  return withDb(async (client) => {
    const cur = await client.query<PropertyRow>(
      `SELECT id, name, canonical_domain, site_url, gsc_site_url, ga4_property_id,
              default_crawl_preset, crawl_authorized_at::text
       FROM properties WHERE canonical_domain = $1`,
      [domain.toLowerCase()],
    );
    return cur.rows[0] ?? null;
  });
}
