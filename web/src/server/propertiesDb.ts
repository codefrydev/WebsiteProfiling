/**
 * Property data helpers — all calls go to FastAPI (/api/properties/*).
 * This file is kept for OAuth flows and other routes that call these helpers directly.
 */
import { deriveSiteNameFromStartUrl, extractHostname } from '@/lib/domainSlug';
import { fastApiGet, fastApiPost, fastApiPatch, fastApiPut } from '@/server/fastApiClient';

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
  schedule_cron: string | null;
  alert_webhook_url: string | null;
  alert_email: string | null;
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

function looksLikeValidDomain(domain: string): boolean {
  const lastDot = domain.lastIndexOf('.');
  return lastDot > 0 && domain.length - lastDot - 1 >= 2;
}

export async function listProperties(): Promise<PropertyRow[]> {
  const data = await fastApiGet<{ properties?: PropertyRow[] }>('/api/properties');
  return data.properties ?? [];
}

export async function getPropertyById(propertyId: number): Promise<PropertyRow | null> {
  try {
    return await fastApiGet<PropertyRow>(`/api/properties/${propertyId}`);
  } catch (e) {
    if (e instanceof Error && e.message.includes('404')) return null;
    throw e;
  }
}

export async function getPropertyByDomain(domain: string): Promise<PropertyRow | null> {
  const normalized = domain.trim();
  if (!normalized) return null;
  const startUrl = normalized.includes('://') ? normalized : `https://${normalized}`;
  try {
    const data = await fastApiGet<{
      id: number;
      canonical_domain?: string;
      default_crawl_preset?: string | null;
    }>(`/api/properties/resolve?startUrl=${encodeURIComponent(startUrl)}`);
    if (!data?.id) return null;
    const canonical = data.canonical_domain || normalized.replace(/^https?:\/\//, '').split('/')[0];
    return {
      id: data.id,
      name: canonical,
      canonical_domain: canonical,
      site_url: startUrl,
      gsc_site_url: null,
      ga4_property_id: null,
      google_auth_mode: null,
      google_connected_at: null,
      google_connected_email: null,
      google_date_range_days: null,
      default_crawl_preset: data.default_crawl_preset ?? null,
      crawl_authorized_at: null,
      schedule_cron: null,
      alert_webhook_url: null,
      alert_email: null,
    };
  } catch (e) {
    if (e instanceof Error && e.message.includes('404')) return null;
    throw e;
  }
}

export async function resolvePropertyIdFromStartUrl(startUrl: string): Promise<number | null> {
  const domain = canonicalDomainFromStartUrl(startUrl);
  if (!domain || !looksLikeValidDomain(domain)) return null;
  try {
    const data = await fastApiGet<{ id: number }>(
      `/api/properties/resolve?startUrl=${encodeURIComponent(startUrl)}`,
    );
    return data.id ?? null;
  } catch {
    return null;
  }
}

export async function upsertPropertyByDomain(
  name: string,
  canonicalDomain: string,
  siteUrl: string | null,
): Promise<number> {
  const data = await fastApiPost<{ id: number }>('/api/properties', {
    name,
    canonical_domain: canonicalDomain,
    site_url: siteUrl,
  });
  return data.id;
}

export async function setPropertyCrawlAuthorized(propertyId: number): Promise<void> {
  await fastApiPost(`/api/properties/${propertyId}/authorize`);
}

export async function setPropertyOpsSettings(
  propertyId: number,
  patch: {
    scheduleCron?: string | null;
    alertWebhookUrl?: string | null;
    alertEmail?: string | null;
  },
): Promise<void> {
  await fastApiPut(`/api/properties/${propertyId}/ops`, patch);
}

export async function setPropertyCrawlPreset(
  propertyId: number,
  presetId: string | null,
): Promise<void> {
  await fastApiPut(`/api/properties/${propertyId}/preset`, { preset: presetId });
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
  await fastApiPatch(`/api/properties/${propertyId}/google/credentials`, patch);
}
