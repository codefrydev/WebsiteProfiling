export type RadiusScale = 'sharp' | 'default' | 'rounded' | 'pill';
export type DensityScale = 'compact' | 'default' | 'spacious';
export type FontSizeScale = 'small' | 'default' | 'large';

export const RADIUS_SCALES: RadiusScale[] = ['sharp', 'default', 'rounded', 'pill'];
export const DENSITY_SCALES: DensityScale[] = ['compact', 'default', 'spacious'];
export const FONT_SIZE_SCALES: FontSizeScale[] = ['small', 'default', 'large'];

export interface UiPrefs {
  radius: RadiusScale;
  density: DensityScale;
  animations: boolean;
  fontSize: FontSizeScale;
}

export const DEFAULT_UI_PREFS: UiPrefs = {
  radius: 'default',
  density: 'default',
  animations: true,
  fontSize: 'default',
};

export function isRadiusScale(v: unknown): v is RadiusScale {
  return typeof v === 'string' && (RADIUS_SCALES as string[]).includes(v);
}

export function isDensityScale(v: unknown): v is DensityScale {
  return typeof v === 'string' && (DENSITY_SCALES as string[]).includes(v);
}

export function isFontSizeScale(v: unknown): v is FontSizeScale {
  return typeof v === 'string' && (FONT_SIZE_SCALES as string[]).includes(v);
}
