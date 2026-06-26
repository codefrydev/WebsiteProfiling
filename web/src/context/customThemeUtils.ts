import type { CustomThemeState, TokenMap } from '../lib/themeTokens';
import { apiUrl, apiFetch } from '../lib/publicBase';

export const CUSTOM_THEME_KEY = 'wp-theme-custom:v1';
export const CUSTOM_THEME_DB_KEY = 'custom_theme';

export function getStoredCustomTheme(): CustomThemeState {
  try {
    const raw = localStorage.getItem(CUSTOM_THEME_KEY);
    if (!raw) return { light: {}, dark: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'light' in parsed &&
      'dark' in parsed &&
      typeof (parsed as Record<string, unknown>).light === 'object' &&
      typeof (parsed as Record<string, unknown>).dark === 'object'
    ) {
      return parsed as CustomThemeState;
    }
  } catch {
    /* ignore */
  }
  return { light: {}, dark: {} };
}

export function setStoredCustomTheme(state: CustomThemeState): void {
  try {
    localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Apply (or clear) inline CSS variable overrides on documentElement.
 *
 * For each token in the provided map, sets it as an inline style.
 * For all known tokens NOT in the map, removes the inline style so the
 * stylesheet default takes over.
 */
export function applyCustomColors(dark: boolean, custom: CustomThemeState): void {
  const map: TokenMap = dark ? custom.dark : custom.light;
  const el = document.documentElement;

  // Collect all css vars we might have previously set so we can clear stale ones
  const allKnownVars = [
    '--app-bg',
    '--app-bg-elevated',
    '--app-bg-muted',
    '--app-bg-sunken',
    '--app-text',
    '--app-text-heading',
    '--app-text-subtle',
    '--accent',
    '--accent-warm',
    '--accent-2',
    '--app-link',
    '--app-link-soft',
  ];

  for (const cssVar of allKnownVars) {
    const value = map[cssVar];
    if (value !== undefined && value !== '') {
      el.style.setProperty(cssVar, value);
    } else {
      el.style.removeProperty(cssVar);
    }
  }
}

/** Serialise a CustomThemeState to a compact JSON string suitable for
 *  embedding directly in an inline script (< > are escaped). */
export function serializeCustomThemeForScript(state: CustomThemeState): string {
  return JSON.stringify(state).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

// ─── Database persistence ─────────────────────────────────────────────────────

/** Load custom theme from DB (via API). Returns null on any failure. */
export async function loadCustomThemeFromDb(): Promise<CustomThemeState | null> {
  try {
    const res = await apiFetch(apiUrl('/ui-preferences'));
    if (!res.ok) return null;
    const data = (await res.json()) as { customThemeJson?: CustomThemeState | null };
    const parsed = data.customThemeJson;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'light' in parsed &&
      'dark' in parsed
    ) {
      return parsed as CustomThemeState;
    }
    return null;
  } catch {
    return null;
  }
}

/** Save custom theme to DB (via API). Also writes localStorage for FOUC cache. */
export async function saveCustomThemeToDb(state: CustomThemeState): Promise<void> {
  setStoredCustomTheme(state);
  try {
    await apiFetch(apiUrl('/ui-preferences'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customThemeJson: state }),
    });
  } catch {
    /* ignore — localStorage is the fallback */
  }
}
