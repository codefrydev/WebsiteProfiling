export const GOOGLE_SECTION_ORDER = [
  'prerequisites',
  'gcpProject',
  'enableApis',
  'oauthConsent',
  'oauthClient',
  'serviceAccount',
  'gscProperty',
  'ga4Property',
  'inApp',
] as const;

export const BING_SECTION_ORDER = [
  'prerequisites',
  'getApiKey',
  'verifySite',
  'saveInApp',
  'syncData',
] as const;

export const AI_SECTION_ORDER = [
  'prerequisites',
  'cloudProviders',
  'ollamaLocal',
  'enableInApp',
  'chatAndFeatures',
] as const;

export const MCP_SECTION_ORDER = [
  'prerequisites',
  'localStdio',
  'remoteHttp',
  'inAppSettings',
  'examplePrompts',
] as const;

export const SERP_SECTION_ORDER = [
  'prerequisites',
  'getApiKey',
  'saveInApp',
  'whatItDoes',
] as const;

export const GSC_LINKS_SECTION_ORDER = [
  'prerequisites',
  'exportFromGsc',
  'uploadInApp',
  'viewInReports',
] as const;

export const CRAWL_AUTH_SECTION_ORDER = [
  'prerequisites',
  'basicAuth',
  'cookies',
  'runCrawl',
] as const;

export type IntegrationGuideSlug =
  | 'google'
  | 'bing'
  | 'ai'
  | 'mcp'
  | 'serp'
  | 'gsc-links'
  | 'crawl-auth';

export interface IntegrationGuideRegistryEntry {
  slug: IntegrationGuideSlug;
  sectionOrder: readonly string[];
}

export const INTEGRATION_GUIDES: IntegrationGuideRegistryEntry[] = [
  { slug: 'google', sectionOrder: GOOGLE_SECTION_ORDER },
  { slug: 'bing', sectionOrder: BING_SECTION_ORDER },
  { slug: 'ai', sectionOrder: AI_SECTION_ORDER },
  { slug: 'mcp', sectionOrder: MCP_SECTION_ORDER },
  { slug: 'gsc-links', sectionOrder: GSC_LINKS_SECTION_ORDER },
  { slug: 'serp', sectionOrder: SERP_SECTION_ORDER },
  { slug: 'crawl-auth', sectionOrder: CRAWL_AUTH_SECTION_ORDER },
];

const GUIDE_BY_SLUG = new Map(INTEGRATION_GUIDES.map((guide) => [guide.slug, guide]));

export function getGuideBySlug(slug: string): IntegrationGuideRegistryEntry | undefined {
  return GUIDE_BY_SLUG.get(slug as IntegrationGuideSlug);
}

export function isIntegrationGuideSlug(slug: string): slug is IntegrationGuideSlug {
  return GUIDE_BY_SLUG.has(slug as IntegrationGuideSlug);
}

/** camelCase section id → URL hash anchor (e.g. oauthClient → oauth-client). */
export function sectionIdToAnchor(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function anchorToSectionId(
  anchor: string,
  sectionOrder: readonly string[],
): string | undefined {
  return sectionOrder.find((id) => sectionIdToAnchor(id) === anchor);
}

export function integrationGuideHref(
  slug: IntegrationGuideSlug,
  options?: { from?: string; sectionId?: string },
): string {
  const params = new URLSearchParams();
  if (options?.from) params.set('from', options.from);
  const query = params.toString();
  const hash = options?.sectionId ? `#${sectionIdToAnchor(options.sectionId)}` : '';
  return `/docs/integrations/${slug}${query ? `?${query}` : ''}${hash}`;
}
