export const THEME_STORAGE_KEY = 'wp-theme';

/** @typedef {'light' | 'dark' | 'system'} ThemePreference */

export function getStoredThemePreference() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'system';
}

function getSystemDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** @param {ThemePreference} pref */
export function resolveEffectiveDark(pref) {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return getSystemDark();
}

/** @param {ThemePreference} pref */
export function applyDomTheme(pref) {
  const dark = resolveEffectiveDark(pref);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}
