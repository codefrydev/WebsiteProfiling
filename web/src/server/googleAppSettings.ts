/**
 * Google OAuth app credentials — reads/writes via FastAPI (/api/integrations/google/*).
 * Kept for OAuth flows and legacy server utilities.
 */
import { fastApiGet, fastApiPost } from '@/server/fastApiClient';
import type { GooglePublicStatus, GoogleServiceAccount } from '@/types/api';

const MASK_SENTINEL = '__MASKED__';

export interface GoogleAppSettingsRow {
  clientId: string;
  clientSecret: string;
  serviceAccount: GoogleServiceAccount | null;
  dateRangeDays: number;
  developerToken: string;
  loginCustomerId: string;
}

export async function loadGoogleAppSettings(): Promise<GoogleAppSettingsRow> {
  try {
    const data = await fastApiGet<{
      clientId?: string;
      clientSecret?: string;
      serviceAccount?: GoogleServiceAccount | null;
      dateRangeDays?: number;
      developerToken?: string;
      loginCustomerId?: string;
    }>('/api/integrations/google/credentials');
    return {
      clientId: String(data.clientId || '').trim(),
      clientSecret: String(data.clientSecret || '').trim(),
      serviceAccount: data.serviceAccount ?? null,
      dateRangeDays: Number(data.dateRangeDays) || 28,
      developerToken: String(data.developerToken || '').trim(),
      loginCustomerId: String(data.loginCustomerId || '').trim(),
    };
  } catch {
    return {
      clientId: '',
      clientSecret: '',
      serviceAccount: null,
      dateRangeDays: 28,
      developerToken: '',
      loginCustomerId: '',
    };
  }
}

export interface SaveGoogleAppSettingsPatch {
  clientId?: string;
  clientSecret?: string;
  serviceAccount?: GoogleServiceAccount | null;
  dateRangeDays?: number;
  developerToken?: string;
  loginCustomerId?: string;
}

export async function saveGoogleAppSettings(
  patch: SaveGoogleAppSettingsPatch,
  options: { preserveSecret?: boolean } = { preserveSecret: true },
): Promise<void> {
  const existing = options.preserveSecret ? await loadGoogleAppSettings() : null;
  let clientSecret = patch.clientSecret;
  if (
    options.preserveSecret &&
    (clientSecret === undefined || clientSecret === '' || clientSecret === MASK_SENTINEL)
  ) {
    clientSecret = existing?.clientSecret ?? '';
  }

  const body: Record<string, unknown> = {};
  if (patch.clientId !== undefined) body.clientId = patch.clientId;
  if (clientSecret !== undefined) body.clientSecret = clientSecret;
  if (patch.dateRangeDays !== undefined) body.dateRangeDays = patch.dateRangeDays;
  if (patch.developerToken !== undefined) body.developerToken = patch.developerToken;
  if (patch.loginCustomerId !== undefined) body.loginCustomerId = patch.loginCustomerId;

  if (Object.keys(body).length > 0) {
    await fastApiPost('/api/integrations/google/credentials', body);
  }

  if (patch.serviceAccount !== undefined) {
    await fastApiPost('/api/integrations/google/credentials/upload', {
      fileContent: JSON.stringify(patch.serviceAccount),
    });
  }
}

/** App-level Google status (no per-property connection). */
export async function getGoogleAppPublicStatus(): Promise<GooglePublicStatus> {
  const row = await loadGoogleAppSettings();
  const hasEnv =
    Boolean(process.env.GOOGLE_CLIENT_ID?.trim()) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim());
  return {
    connected: false,
    hasClientId: Boolean(row.clientId) || hasEnv,
    gscSiteUrl: null,
    ga4PropertyId: null,
    dateRangeDays: row.dateRangeDays,
    authMode: row.serviceAccount ? 'service_account' : null,
    hasPlannerToken: Boolean(row.developerToken),
    loginCustomerId: row.loginCustomerId || null,
  };
}

export function getClientIdForOAuth(row: GoogleAppSettingsRow): string {
  return row.clientId || process.env.GOOGLE_CLIENT_ID || '';
}

export function getClientSecretForOAuth(row: GoogleAppSettingsRow): string {
  return row.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';
}
