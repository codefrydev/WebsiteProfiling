import type { GoogleReportData } from '@/types/report';
import { extractHostname, hostsMatch, normalizeDomainQueryParam } from '@/lib/domainSlug';

/** Hostnames implied by GSC site URL (property or URL-prefix). */
function hostFromGscSiteUrl(siteUrl: string | null | undefined): string {
  const raw = String(siteUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('sc-domain:')) {
    return raw.slice('sc-domain:'.length).trim().toLowerCase();
  }
  return extractHostname(raw.startsWith('http') ? raw : `https://${raw}`);
}

function samplePageHosts(google: GoogleReportData): string[] {
  const hosts: string[] = [];
  const gscSite = hostFromGscSiteUrl(google.gsc?.site_url as string | undefined);
  if (gscSite) hosts.push(gscSite);
  for (const row of google.gsc?.top_pages ?? []) {
    const page = String((row as { page?: string }).page || '').trim();
    if (page) hosts.push(extractHostname(page.startsWith('http') ? page : `https://${page}`));
    if (hosts.length >= 8) break;
  }
  for (const row of google.ga4?.top_pages ?? []) {
    const full = String((row as { full_url?: string }).full_url || '').trim();
    const path = String((row as { path?: string }).path || '').trim();
    const target = full || (path ? `https://${gscSite || 'x'}/${path.replace(/^\//, '')}` : '');
    if (target.startsWith('http')) {
      hosts.push(extractHostname(target));
    }
    if (hosts.length >= 12) break;
  }
  return hosts.filter(Boolean);
}

/** True when Google snapshot appears to belong to the scoped domain. */
export function googlePayloadMatchesDomain(
  google: GoogleReportData | null | undefined,
  domainSlug: string | null | undefined,
): boolean {
  const expected = normalizeDomainQueryParam(domainSlug);
  if (!expected || !google || typeof google !== 'object') return true;
  const hosts = samplePageHosts(google);
  if (hosts.length === 0) return true;
  const matching = hosts.filter((h) => hostsMatch(h, expected));
  return matching.length / hosts.length >= 0.5;
}

/** Drop google block when it clearly belongs to another brand. */
export function stripGoogleIfDomainMismatch<T extends { google?: GoogleReportData }>(
  payload: T,
  domainSlug: string | null | undefined,
): T {
  if (!domainSlug || !payload.google) return payload;
  if (googlePayloadMatchesDomain(payload.google, domainSlug)) return payload;
  const next = { ...payload };
  delete next.google;
  return next;
}
