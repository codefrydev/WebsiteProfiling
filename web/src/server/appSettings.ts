/**
 * Generic app_settings table — key/value pairs for application-level preferences.
 * Currently used for: custom_theme (appearance colour overrides).
 */
import { withDb } from '@/server/db';

/** Read one setting. Returns null when the row does not exist. */
export async function loadAppSetting(key: string): Promise<string | null> {
  return withDb(async (client) => {
    try {
      const { rows } = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [key],
      );
      return rows.length > 0 ? rows[0].value : null;
    } catch {
      return null;
    }
  });
}

/** Upsert one setting. Creates the row if it does not exist. */
export async function saveAppSetting(key: string, value: string): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_at = now()`,
      [key, value],
    );
  });
}
