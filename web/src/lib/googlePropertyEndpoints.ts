import { apiUrl } from '@/lib/publicBase';

export interface GooglePropertyEndpoints {
  status: string;
  credentials: string;
  listProperties: string;
  test: string;
  linksImport: string;
  linksStatus: string;
  auth: (returnTo: string) => string;
  disconnect: string;
  isPerProperty: boolean;
}

export function googlePropertyEndpoints(propertyId: number | null): GooglePropertyEndpoints {
  if (propertyId != null && Number.isFinite(propertyId)) {
    const base = `/properties/${propertyId}/google`;
    return {
      status: apiUrl(`${base}/status`),
      credentials: apiUrl(`${base}/credentials`),
      listProperties: apiUrl(`${base}/properties`),
      test: apiUrl(`${base}/test`),
      linksImport: apiUrl(`${base}/links/import`),
      linksStatus: apiUrl(`${base}/links/status`),
      auth: (returnTo: string) =>
        apiUrl(
          `/integrations/google/auth?propertyId=${propertyId}&returnTo=${encodeURIComponent(returnTo)}`,
        ),
      disconnect: apiUrl(`${base}/disconnect`),
      isPerProperty: true,
    };
  }
  return {
    status: apiUrl('/integrations/google/status'),
    credentials: apiUrl('/integrations/google/credentials'),
    listProperties: apiUrl('/integrations/google/properties'),
    test: apiUrl('/integrations/google/test'),
    linksImport: '',
    linksStatus: '',
    auth: (_returnTo: string) => apiUrl('/integrations/google/auth'),
    disconnect: apiUrl('/integrations/google/disconnect'),
    isPerProperty: false,
  };
}
