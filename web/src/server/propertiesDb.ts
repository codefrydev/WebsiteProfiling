import { withDb } from '@/server/db';
import { deriveSiteNameFromStartUrl, extractHostname } from '@/lib/domainSlug';

export interface PropertyRow {
  id: number;
  name: string;
  canonical_domain: string;
  site_url: string | null;
  gsc_site_url: string | null;
  ga4_property_id: string | null;
  google_auth_mode: string | null;
  google_connected_at: string | null;
  google_connected_email: string | null;
  google_date_range_days: number | null;
  default_crawl_preset: string | null;
  crawl_authorized_at: string | null;
  google_connected?: boolean;
}

export interface PropertyGooglePublicStatus {
  connected: boolean;
  authMode: string | null;
  gscSiteUrl: string | null;
  ga4PropertyId: string | null;
  dateRangeDays: number;
  connectedEmail: string | null;
  connectedAt: string | null;
}

export function canonicalDomainFromStartUrl(startUrl: string): string {
  const raw = (startUrl || '').trim();
  if (!raw) return '';
  const href = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
  return extractHostname(href);
}

const PROPERTY_SELECT = `
  SELECT id, name, canonical_domain, site_url, gsc_site_url, ga4_property_id,
         google_auth_mode, google_connected_at::text, google_connected_email,
         google_date_range_days, default_crawl_preset, crawl_authorized_at::text
  FROM properties`;

function mapPropertyRow(row: PropertyRow): PropertyRow {
  return {
    ...row,
    google_connected: Boolean(row.google_connected_at),
  };
}

export async function listProperties(): Promise<PropertyRow[]> {
  return withDb(async (client) => {
    const cur = await client.query<PropertyRow>(
      `${PROPERTY_SELECT} ORDER BY name ASC`,
    );
    return cur.rows.map(mapPropertyRow);
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

export async function resolvePropertyIdFromStartUrl(startUrl: string): Promise<number | null> {
  const domain = canonicalDomainFromStartUrl(startUrl);
  if (!domain) return null;
  const existing = await getPropertyByDomain(domain);
  if (existing) return existing.id;
  const name = deriveSiteNameFromStartUrl(startUrl) || domain;
  return upsertPropertyByDomain(name, domain, startUrl.trim() || null);
}

export async function getPropertyById(propertyId: number): Promise<PropertyRow | null> {
  return withDb(async (client) => {
    const cur = await client.query<PropertyRow>(
      `${PROPERTY_SELECT} WHERE id = $1`,
      [propertyId],
    );
    const row = cur.rows[0];
    return row ? mapPropertyRow(row) : null;
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
      `${PROPERTY_SELECT} WHERE canonical_domain = $1`,
      [domain.toLowerCase()],
    );
    const row = cur.rows[0];
    return row ? mapPropertyRow(row) : null;
  });
}

export async function getPropertyGooglePublicStatus(
  propertyId: number,
): Promise<PropertyGooglePublicStatus> {
  const row = await getPropertyById(propertyId);
  if (!row) {
    return {
      connected: false,
      authMode: null,
      gscSiteUrl: null,
      ga4PropertyId: null,
      dateRangeDays: 28,
      connectedEmail: null,
      connectedAt: null,
    };
  }
  return {
    connected: Boolean(row.google_connected_at),
    authMode: row.google_auth_mode,
    gscSiteUrl: row.gsc_site_url,
    ga4PropertyId: row.ga4_property_id,
    dateRangeDays: row.google_date_range_days ?? 28,
    connectedEmail: row.google_connected_email,
    connectedAt: row.google_connected_at,
  };
}

export interface PropertyGoogleCredentialsPatch {
  refreshToken?: string | null;
  authMode?: 'oauth' | 'service_account' | null;
  gscSiteUrl?: string | null;
  ga4PropertyId?: string | null;
  dateRangeDays?: number;
  connectedEmail?: string | null;
}

export async function setPropertyGoogleCredentials(
  propertyId: number,
  patch: PropertyGoogleCredentialsPatch,
): Promise<void> {
  await withDb(async (client) => {
    const sets: string[] = ['updated_at = now()'];
    const vals: unknown[] = [];
    let n = 0;
    const add = (col: string, val: unknown) => {
      n += 1;
      sets.push(`${col} = $${n}`);
      vals.push(val);
    };

    if (patch.refreshToken !== undefined) {
      add('google_refresh_token', patch.refreshToken);
      if (patch.refreshToken) {
        sets.push('google_connected_at = now()');
      }
    }
    if (patch.authMode !== undefined) add('google_auth_mode', patch.authMode);
    if (patch.gscSiteUrl !== undefined) add('gsc_site_url', patch.gscSiteUrl);
    if (patch.ga4PropertyId !== undefined) add('ga4_property_id', patch.ga4PropertyId);
    if (patch.dateRangeDays !== undefined && patch.dateRangeDays > 0) {
      add('google_date_range_days', patch.dateRangeDays);
    }
    if (patch.connectedEmail !== undefined) add('google_connected_email', patch.connectedEmail);

    if (n === 0) return;

    n += 1;
    vals.push(propertyId);
    await client.query(
      `UPDATE properties SET ${sets.join(', ')} WHERE id = $${n}`,
      vals,
    );
  });
}
