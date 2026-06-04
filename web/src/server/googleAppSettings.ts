/**
 * Google OAuth app credentials stored in PostgreSQL (google_app_settings singleton).
 */
import type { PoolClient } from 'pg';
import { withDb } from '@/server/db';
import type { GooglePublicStatus, GoogleServiceAccount } from '@/types/api';

const SINGLETON_ID = 1;
const MASK_SENTINEL = '__MASKED__';

export interface GoogleAppSettingsRow {
  clientId: string;
  clientSecret: string;
  serviceAccount: GoogleServiceAccount | null;
  dateRangeDays: number;
}

async function readRow(client: PoolClient): Promise<GoogleAppSettingsRow | null> {
  const cur = await client.query<{
    client_id: string | null;
    client_secret: string | null;
    service_account_json: GoogleServiceAccount | null;
    default_date_range_days: number;
  }>(
    `SELECT client_id, client_secret, service_account_json, default_date_range_days
     FROM google_app_settings WHERE id = $1`,
    [SINGLETON_ID],
  );
  const row = cur.rows[0];
  if (!row) return null;
  return {
    clientId: String(row.client_id || '').trim(),
    clientSecret: String(row.client_secret || '').trim(),
    serviceAccount: row.service_account_json,
    dateRangeDays: Number(row.default_date_range_days) || 28,
  };
}

export async function loadGoogleAppSettings(): Promise<GoogleAppSettingsRow> {
  return withDb(async (client) => {
    const row = await readRow(client);
    return (
      row ?? {
        clientId: '',
        clientSecret: '',
        serviceAccount: null,
        dateRangeDays: 28,
      }
    );
  });
}

export interface SaveGoogleAppSettingsPatch {
  clientId?: string;
  clientSecret?: string;
  serviceAccount?: GoogleServiceAccount | null;
  dateRangeDays?: number;
}

export async function saveGoogleAppSettings(
  patch: SaveGoogleAppSettingsPatch,
  options: { preserveSecret?: boolean } = { preserveSecret: true },
): Promise<void> {
  await withDb(async (client) => {
    const existing = await readRow(client);
    let clientSecret = patch.clientSecret;
    if (
      options.preserveSecret &&
      (clientSecret === undefined || clientSecret === '' || clientSecret === MASK_SENTINEL)
    ) {
      clientSecret = existing?.clientSecret ?? '';
    }

    await client.query(
      `UPDATE google_app_settings SET
         client_id = COALESCE(NULLIF($1, ''), client_id),
         client_secret = COALESCE(NULLIF($2, ''), client_secret),
         service_account_json = CASE WHEN $3::boolean THEN $4::jsonb ELSE service_account_json END,
         default_date_range_days = COALESCE($5, default_date_range_days),
         updated_at = now()
       WHERE id = $6`,
      [
        patch.clientId ?? '',
        clientSecret ?? '',
        patch.serviceAccount !== undefined,
        patch.serviceAccount ? JSON.stringify(patch.serviceAccount) : null,
        patch.dateRangeDays ?? null,
        SINGLETON_ID,
      ],
    );
  });
}

/** App-level status only (no per-property connection). */
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
  };
}

export function getClientIdForOAuth(row: GoogleAppSettingsRow): string {
  return row.clientId || process.env.GOOGLE_CLIENT_ID || '';
}

export function getClientSecretForOAuth(row: GoogleAppSettingsRow): string {
  return row.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';
}
