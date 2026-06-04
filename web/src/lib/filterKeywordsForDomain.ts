import type { KeywordRow } from '@/types';
import { extractHostname, hostsMatch, normalizeDomainQueryParam } from '@/lib/domainSlug';

/** Drop keyword rows whose GSC URLs belong to another hostname. */
export function filterKeywordRowsForDomain(
  rows: KeywordRow[],
  domainSlug: string | null | undefined,
): KeywordRow[] {
  const expected = normalizeDomainQueryParam(domainSlug);
  if (!expected) return rows;
  return rows.filter((r) => {
    const url = String(r.gsc_url || '').trim();
    if (!url) return true;
    const host = extractHostname(url.startsWith('http') ? url : `https://${url}`);
    return hostsMatch(host, expected);
  });
}

export function keywordsPayloadMatchesDomain(
  rows: KeywordRow[],
  domainSlug: string | null | undefined,
  threshold = 0.5,
): boolean {
  const expected = normalizeDomainQueryParam(domainSlug);
  if (!expected || rows.length === 0) return true;
  const withUrl = rows.filter((r) => String(r.gsc_url || '').trim());
  if (withUrl.length === 0) return true;
  const matching = filterKeywordRowsForDomain(withUrl, expected);
  return matching.length / withUrl.length >= threshold;
}
