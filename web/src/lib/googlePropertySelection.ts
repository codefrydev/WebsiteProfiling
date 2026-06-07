import { hostsMatch, normalizeDomainQueryParam } from '@/lib/domainSlug';

export interface PropertyPickCandidate {
  id: number | string;
  canonical_domain: string;
  site_url?: string | null;
}

/** Coerce API / storage values to a finite positive integer property id. */
export function normalizePropertyId(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

/** Compare property ids across number/string sources (e.g. PostgreSQL BIGINT in JSON). */
export function propertyIdsEqual(a: unknown, b: unknown): boolean {
  const na = normalizePropertyId(a);
  const nb = normalizePropertyId(b);
  return na != null && nb != null && na === nb;
}

function idFromRow(row: PropertyPickCandidate): number | null {
  return normalizePropertyId(row.id);
}

/** Pick initial property: explicit id → URL match → active_property_id → first list item. */
export function pickInitialPropertyId(
  properties: PropertyPickCandidate[],
  options: {
    explicitId?: number | null;
    startUrl?: string;
    activePropertyId?: string;
  },
): number | null {
  if (properties.length === 0) return null;

  if (options.explicitId != null && Number.isFinite(options.explicitId)) {
    const found = properties.some((p) => propertyIdsEqual(p.id, options.explicitId));
    if (found) return normalizePropertyId(options.explicitId);
  }

  let startHost = '';
  const rawStart = (options.startUrl || '').trim();
  if (rawStart) {
    try {
      const href = rawStart.startsWith('http') ? rawStart : `https://${rawStart}`;
      startHost = normalizeDomainQueryParam(new URL(href).hostname);
    } catch {
      startHost = normalizeDomainQueryParam(rawStart);
    }
  }
  if (startHost) {
    const byUrl = properties.find(
      (p) =>
        hostsMatch(p.canonical_domain, startHost) ||
        hostsMatch(p.site_url || '', startHost),
    );
    if (byUrl) return idFromRow(byUrl);
  }

  const activeRaw = (options.activePropertyId || '').trim();
  if (activeRaw) {
    const pid = parseInt(activeRaw, 10);
    if (Number.isFinite(pid) && properties.some((p) => propertyIdsEqual(p.id, pid))) {
      return normalizePropertyId(pid);
    }
  }

  return idFromRow(properties[0]!);
}

export function siteUrlFromProperty(row: PropertyPickCandidate): string {
  const fromRow = (row.site_url || '').trim();
  if (fromRow) return fromRow;
  const host = (row.canonical_domain || '').trim();
  return host ? `https://${host}` : '';
}
