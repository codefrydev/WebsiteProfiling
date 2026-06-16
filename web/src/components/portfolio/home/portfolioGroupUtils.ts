import { extractHostname } from '@/lib/domainSlug';
import type { PortfolioGroup } from '@/types';

export function portfolioRootDomain(group: PortfolioGroup): string {
  const host = extractHostname(group.crawlUrl) || group.domainName.trim().toLowerCase();
  if (!host) return group.domainName || 'unknown';
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}
