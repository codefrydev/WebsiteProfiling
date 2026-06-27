import { apiUrl, apiFetch } from './publicBase';
import {
  type UiPrefs,
  type RadiusScale,
  type DensityScale,
  type FontSizeScale,
  DEFAULT_UI_PREFS,
  RADIUS_SCALES,
  DENSITY_SCALES,
  FONT_SIZE_SCALES,
  isRadiusScale,
  isDensityScale,
  isFontSizeScale,
} from './uiPrefScales';
import { getCachedClientPreferences, initClientPreferences, patchClientPreferences } from './clientPreferences';

export type { RadiusScale, DensityScale, FontSizeScale, UiPrefs };
export { DEFAULT_UI_PREFS, RADIUS_SCALES, DENSITY_SCALES, FONT_SIZE_SCALES };

// ─── Preset maps ──────────────────────────────────────────────────────────────

const RADIUS_VARS: Record<RadiusScale, Record<string, string> | null> = {
  sharp: {
    '--radius-sm': '0.125rem',
    '--radius-card': '0.25rem',
    '--radius-lg': '0.375rem',
    '--radius-xl': '0.5rem',
  },
  default: null,
  rounded: {
    '--radius-sm': '0.75rem',
    '--radius-card': '1.25rem',
    '--radius-lg': '1.75rem',
    '--radius-xl': '2rem',
  },
  pill: {
    '--radius-sm': '999px',
    '--radius-card': '1.75rem',
    '--radius-lg': '2.5rem',
    '--radius-xl': '3rem',
  },
};

const DENSITY_VARS: Record<DensityScale, Record<string, string> | null> = {
  compact: {
    '--spacing-page-x': '0.75rem',
    '--spacing-page-y': '0.75rem',
    '--spacing-card': '0.75rem',
  },
  default: null,
  spacious: {
    '--spacing-page-x': '2.5rem',
    '--spacing-page-y': '2.5rem',
    '--spacing-card': '2rem',
  },
};

const FONT_SIZE_VARS: Record<FontSizeScale, Record<string, string> | null> = {
  small: { '--font-size-base': '15px' },
  default: null,
  large: { '--font-size-base': '20px' },
};

const ANIMATION_VARS_OFF = {
  '--dur-fast': '0ms',
  '--dur-base': '1ms',
  '--dur-slow': '1ms',
};

const ALL_MANAGED_VARS = [
  '--radius-sm',
  '--radius-card',
  '--radius-lg',
  '--radius-xl',
  '--spacing-page-x',
  '--spacing-page-y',
  '--spacing-card',
  '--dur-fast',
  '--dur-base',
  '--dur-slow',
  '--font-size-base',
];

// ─── Apply to DOM ─────────────────────────────────────────────────────────────

export function applyUiPrefs(prefs: UiPrefs): void {
  const el = document.documentElement;

  for (const v of ALL_MANAGED_VARS) el.style.removeProperty(v);

  const radiusMap = RADIUS_VARS[prefs.radius];
  if (radiusMap) {
    for (const [k, v] of Object.entries(radiusMap)) el.style.setProperty(k, v);
  }

  const densityMap = DENSITY_VARS[prefs.density];
  if (densityMap) {
    for (const [k, v] of Object.entries(densityMap)) el.style.setProperty(k, v);
  }

  const fontSizeMap = FONT_SIZE_VARS[prefs.fontSize ?? 'default'];
  if (fontSizeMap) {
    for (const [k, v] of Object.entries(fontSizeMap)) el.style.setProperty(k, v);
  }

  if (!prefs.animations) {
    for (const [k, v] of Object.entries(ANIMATION_VARS_OFF)) el.style.setProperty(k, v);
  }
}

// ─── Persistence (client_preferences columns) ─────────────────────────────────

const UI_PREFS_LS_KEY = 'wp-ui-prefs:v1';
/** @deprecated ui_prefs_json — chrome prefs live in client_preferences now */
export const UI_PREFS_DB_KEY = 'ui_prefs';

function clientPrefsToUiPrefs(): UiPrefs {
  const cp = getCachedClientPreferences();
  return {
    radius: cp.radiusScale,
    density: cp.densityScale,
    animations: cp.animationsEnabled,
    fontSize: cp.fontSizeScale,
  };
}

export function getStoredUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(UI_PREFS_LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<UiPrefs>;
      return {
        radius: isRadiusScale(p.radius) ? p.radius : DEFAULT_UI_PREFS.radius,
        density: isDensityScale(p.density) ? p.density : DEFAULT_UI_PREFS.density,
        animations: typeof p.animations === 'boolean' ? p.animations : DEFAULT_UI_PREFS.animations,
        fontSize: isFontSizeScale(p.fontSize) ? p.fontSize : DEFAULT_UI_PREFS.fontSize,
      };
    }
  } catch {
    /* ignore */
  }
  return clientPrefsToUiPrefs();
}

export function setStoredUiPrefs(prefs: UiPrefs): void {
  try {
    localStorage.setItem(UI_PREFS_LS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export async function loadUiPrefsFromDb(): Promise<UiPrefs | null> {
  try {
    const prefs = await initClientPreferences();
    return {
      radius: prefs.radiusScale,
      density: prefs.densityScale,
      animations: prefs.animationsEnabled,
      fontSize: prefs.fontSizeScale,
    };
  } catch {
    return null;
  }
}

export async function saveUiPrefsToDb(prefs: UiPrefs): Promise<void> {
  setStoredUiPrefs(prefs);
  patchClientPreferences({
    radiusScale: prefs.radius,
    densityScale: prefs.density,
    animationsEnabled: prefs.animations,
    fontSizeScale: prefs.fontSize,
  });
}
