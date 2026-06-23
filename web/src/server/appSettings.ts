/**
 * Generic app_settings — key/value pairs via FastAPI (/api/app-settings).
 * Currently used for: custom_theme (appearance colour overrides).
 */
import { fastApiGet, fastApiPut } from '@/server/fastApiClient';

/** Read one setting. Returns null when the key does not exist. */
export async function loadAppSetting(key: string): Promise<string | null> {
  try {
    const data = await fastApiGet<Record<string, unknown>>('/api/app-settings');
    const val = data[key];
    return val != null ? String(val) : null;
  } catch {
    return null;
  }
}

/** Upsert one setting. */
export async function saveAppSetting(key: string, value: string): Promise<void> {
  await fastApiPut('/api/app-settings', { [key]: value });
}
