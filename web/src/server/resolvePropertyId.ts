import {
  canonicalDomainFromStartUrl,
  getPropertyByDomain,
  resolvePropertyIdFromStartUrl,
} from '@/server/propertiesDb';

/**
 * Resolve property id from API query: propertyId (numeric) or domain (hostname slug).
 */
export async function resolvePropertyIdFromRequest(
  propertyIdRaw: string | null,
  domainRaw: string | null,
): Promise<{ propertyId: number | null; error?: string }> {
  if (propertyIdRaw) {
    const pid = parseInt(propertyIdRaw, 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      return { propertyId: null, error: 'Invalid propertyId' };
    }
    return { propertyId: pid };
  }

  const domain = (domainRaw || '').trim();
  if (!domain) {
    return {
      propertyId: null,
      error: 'propertyId or domain query parameter is required',
    };
  }

  const normalized = domain.toLowerCase().replace(/[,;.\s]+$/g, '');
  let row = await getPropertyByDomain(normalized);
  if (!row && !normalized.startsWith('www.')) {
    row = await getPropertyByDomain(`www.${normalized}`);
  }
  if (!row && normalized.startsWith('www.')) {
    row = await getPropertyByDomain(normalized.slice(4));
  }

  if (row) {
    return { propertyId: row.id };
  }

  const startUrl = normalized.includes('://') ? normalized : `https://${normalized}`;
  const id = await resolvePropertyIdFromStartUrl(startUrl);
  if (id != null) {
    return { propertyId: id };
  }

  return { propertyId: null, error: `No property found for domain: ${domain}` };
}

export function siteUrlForProperty(
  canonicalDomain: string,
  siteUrl: string | null | undefined,
): string {
  const fromRow = (siteUrl || '').trim();
  if (fromRow) return fromRow;
  const host = canonicalDomainFromStartUrl(`https://${canonicalDomain}`);
  return host ? `https://${host}` : '';
}
