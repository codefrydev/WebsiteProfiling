import { hostsMatch, normalizeDomainQueryParam } from '@/lib/domainSlug';
import type { PropertyListItem } from '@/types/api';

/** Pick initial property: explicit id → URL match → active_property_id → first list item. */
export function pickInitialPropertyId(
  properties: PropertyListItem[],
  options: {
    explicitId?: number | null;
    startUrl?: string;
    activePropertyId?: string;
  },
): number | null {
  if (properties.length === 0) return null;

  if (options.explicitId != null && Number.isFinite(options.explicitId)) {
    const found = properties.some((p) => p.id === options.explicitId);
    if (found) return options.explicitId;
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
    if (byUrl) return byUrl.id;
  }

  const activeRaw = (options.activePropertyId || '').trim();
  if (activeRaw) {
    const pid = parseInt(activeRaw, 10);
    if (Number.isFinite(pid) && properties.some((p) => p.id === pid)) {
      return pid;
    }
  }

  return properties[0]?.id ?? null;
}

export function siteUrlFromProperty(row: PropertyListItem): string {
  const fromRow = (row.site_url || '').trim();
  if (fromRow) return fromRow;
  const host = (row.canonical_domain || '').trim();
  return host ? `https://${host}` : '';
}
