/**
 * Cross-browser client UI preferences (PostgreSQL client_preferences table).
 * localStorage is a FOUC cache only; DB is source of truth after init.
 */
import { apiUrl, apiFetch } from './publicBase';
import type { ViewId } from '@/routes';
import type { DensityScale, FontSizeScale, RadiusScale } from '@/lib/uiPrefScales';

export type ChatFabCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type NetworkViewMode = '2d' | '3d';

export interface ClientPreferences {
  defaultLandingView: ViewId;
  chatFabCorner: ChatFabCorner;
  sidebarCollapsed: boolean;
  networkViewMode: '2d' | '3d';
  contentStudioAiEnabled: boolean;
  pipelinePythonExe: string;
  pipelineRepoRoot: string;
  radiusScale: RadiusScale;
  densityScale: DensityScale;
  animationsEnabled: boolean;
  fontSizeScale: FontSizeScale;
}

export const DEFAULT_CLIENT_PREFERENCES: ClientPreferences = {
  defaultLandingView: 'overview',
  chatFabCorner: 'bottom-right',
  sidebarCollapsed: false,
  networkViewMode: '2d',
  contentStudioAiEnabled: true,
  pipelinePythonExe: 'python3',
  pipelineRepoRoot: '',
  radiusScale: 'default',
  densityScale: 'default',
  animationsEnabled: true,
  fontSizeScale: 'default',
};

const LS_KEY = 'wp-client-prefs:v1';
const PATCH_DEBOUNCE_MS = 400;

const LANDING_VIEWS = new Set<string>([
  'overview',
  'dashboards',
  'issues',
  'links',
  'content',
  'lighthouse',
  'search-performance',
]);

const FAB_CORNERS = new Set<string>(['bottom-right', 'bottom-left', 'top-right', 'top-left']);

let memoryCache: ClientPreferences | null = null;
let initPromise: Promise<ClientPreferences> | null = null;
let patchTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPatch: Partial<ClientPreferences> = {};

const RADIUS_SCALES: RadiusScale[] = ['sharp', 'default', 'rounded', 'pill'];
const DENSITY_SCALES: DensityScale[] = ['compact', 'default', 'spacious'];
const FONT_SIZE_SCALES: FontSizeScale[] = ['small', 'default', 'large'];

interface ClientPreferencesDto {
  defaultLandingView?: string;
  chatFabCorner?: string;
  sidebarCollapsed?: boolean;
  networkViewMode?: string;
  contentStudioAiEnabled?: boolean;
  pipelinePythonExe?: string;
  pipelineRepoRoot?: string;
  radiusScale?: string;
  densityScale?: string;
  animationsEnabled?: boolean;
  fontSizeScale?: string;
}

function isLandingView(v: unknown): v is ViewId {
  return typeof v === 'string' && LANDING_VIEWS.has(v);
}

function isFabCorner(v: unknown): v is ChatFabCorner {
  return typeof v === 'string' && FAB_CORNERS.has(v);
}

function isNetworkMode(v: unknown): v is '2d' | '3d' {
  return v === '2d' || v === '3d';
}

function isRadiusScale(v: unknown): v is RadiusScale {
  return typeof v === 'string' && (RADIUS_SCALES as string[]).includes(v);
}

function isDensityScale(v: unknown): v is DensityScale {
  return typeof v === 'string' && (DENSITY_SCALES as string[]).includes(v);
}

function isFontSizeScale(v: unknown): v is FontSizeScale {
  return typeof v === 'string' && (FONT_SIZE_SCALES as string[]).includes(v);
}

export function normalizeClientPreferences(raw: Partial<ClientPreferencesDto> | null | undefined): ClientPreferences {
  const d = DEFAULT_CLIENT_PREFERENCES;
  return {
    defaultLandingView: isLandingView(raw?.defaultLandingView) ? raw.defaultLandingView : d.defaultLandingView,
    chatFabCorner: isFabCorner(raw?.chatFabCorner) ? raw.chatFabCorner : d.chatFabCorner,
    sidebarCollapsed: typeof raw?.sidebarCollapsed === 'boolean' ? raw.sidebarCollapsed : d.sidebarCollapsed,
    networkViewMode: isNetworkMode(raw?.networkViewMode) ? raw.networkViewMode : d.networkViewMode,
    contentStudioAiEnabled:
      typeof raw?.contentStudioAiEnabled === 'boolean' ? raw.contentStudioAiEnabled : d.contentStudioAiEnabled,
    pipelinePythonExe:
      typeof raw?.pipelinePythonExe === 'string' && raw.pipelinePythonExe.trim()
        ? raw.pipelinePythonExe.trim()
        : d.pipelinePythonExe,
    pipelineRepoRoot: typeof raw?.pipelineRepoRoot === 'string' ? raw.pipelineRepoRoot : d.pipelineRepoRoot,
    radiusScale: isRadiusScale(raw?.radiusScale) ? raw.radiusScale : d.radiusScale,
    densityScale: isDensityScale(raw?.densityScale) ? raw.densityScale : d.densityScale,
    animationsEnabled: typeof raw?.animationsEnabled === 'boolean' ? raw.animationsEnabled : d.animationsEnabled,
    fontSizeScale: isFontSizeScale(raw?.fontSizeScale) ? raw.fontSizeScale : d.fontSizeScale,
  };
}

function cacheToLocalStorage(prefs: ClientPreferences): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}

function readLocalStorageCache(): ClientPreferences | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return normalizeClientPreferences(JSON.parse(raw) as ClientPreferencesDto);
  } catch {
    return null;
  }
}

/** Synchronous read from in-memory or localStorage cache (before async init completes). */
export function getCachedClientPreferences(): ClientPreferences {
  if (memoryCache) return memoryCache;
  return readLocalStorageCache() ?? { ...DEFAULT_CLIENT_PREFERENCES };
}

function dtoFromPrefs(prefs: Partial<ClientPreferences>): ClientPreferencesDto {
  const out: ClientPreferencesDto = {};
  if (prefs.defaultLandingView !== undefined) out.defaultLandingView = prefs.defaultLandingView;
  if (prefs.chatFabCorner !== undefined) out.chatFabCorner = prefs.chatFabCorner;
  if (prefs.sidebarCollapsed !== undefined) out.sidebarCollapsed = prefs.sidebarCollapsed;
  if (prefs.networkViewMode !== undefined) out.networkViewMode = prefs.networkViewMode;
  if (prefs.contentStudioAiEnabled !== undefined) out.contentStudioAiEnabled = prefs.contentStudioAiEnabled;
  if (prefs.pipelinePythonExe !== undefined) out.pipelinePythonExe = prefs.pipelinePythonExe;
  if (prefs.pipelineRepoRoot !== undefined) out.pipelineRepoRoot = prefs.pipelineRepoRoot;
  if (prefs.radiusScale !== undefined) out.radiusScale = prefs.radiusScale;
  if (prefs.densityScale !== undefined) out.densityScale = prefs.densityScale;
  if (prefs.animationsEnabled !== undefined) out.animationsEnabled = prefs.animationsEnabled;
  if (prefs.fontSizeScale !== undefined) out.fontSizeScale = prefs.fontSizeScale;
  return out;
}

async function fetchClientPreferencesFromDb(): Promise<ClientPreferences | null> {
  try {
    const res = await apiFetch(apiUrl('/client-preferences'));
    if (!res.ok) return null;
    const data = (await res.json()) as ClientPreferencesDto;
    return normalizeClientPreferences(data);
  } catch {
    return null;
  }
}

function flushPendingPatch(): void {
  if (!Object.keys(pendingPatch).length) return;
  const body = dtoFromPrefs(pendingPatch);
  pendingPatch = {};
  void apiFetch(apiUrl('/client-preferences'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {
    /* localStorage cache remains */
  });
}

/** Merge partial prefs into cache/localStorage and debounce PUT to DB. */
export function patchClientPreferences(partial: Partial<ClientPreferences>): void {
  const next = normalizeClientPreferences({ ...getCachedClientPreferences(), ...partial });
  memoryCache = next;
  cacheToLocalStorage(next);
  pendingPatch = { ...pendingPatch, ...partial };
  if (patchTimer) clearTimeout(patchTimer);
  patchTimer = setTimeout(flushPendingPatch, PATCH_DEBOUNCE_MS);
}

/** Force immediate PUT (used after one-time localStorage uplift). */
export async function patchClientPreferencesNow(partial: Partial<ClientPreferences>): Promise<void> {
  patchClientPreferences(partial);
  if (patchTimer) {
    clearTimeout(patchTimer);
    patchTimer = null;
  }
  flushPendingPatch();
}

/** Collect legacy localStorage values to uplift when DB column is still at default. */
export function collectLegacyLocalStorageUplift(db: ClientPreferences): Partial<ClientPreferences> {
  const uplift: Partial<ClientPreferences> = {};
  const d = DEFAULT_CLIENT_PREFERENCES;

  try {
    const view = localStorage.getItem('wp-default-view:v1');
    if (db.defaultLandingView === d.defaultLandingView && isLandingView(view) && view !== d.defaultLandingView) {
      uplift.defaultLandingView = view;
    }
  } catch {
    /* ignore */
  }

  try {
    const fabRaw = localStorage.getItem('wp-chat-fab-position:v1');
    if (fabRaw && db.chatFabCorner === d.chatFabCorner) {
      const parsed = JSON.parse(fabRaw) as { corner?: unknown };
      if (isFabCorner(parsed.corner) && parsed.corner !== d.chatFabCorner) {
        uplift.chatFabCorner = parsed.corner;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const collapsed = localStorage.getItem('app-sidebar-collapsed');
    if (db.sidebarCollapsed === d.sidebarCollapsed && collapsed === '1') {
      uplift.sidebarCollapsed = true;
    }
  } catch {
    /* ignore */
  }

  try {
    const mode = localStorage.getItem('network-view-mode');
    if (db.networkViewMode === d.networkViewMode && isNetworkMode(mode) && mode !== d.networkViewMode) {
      uplift.networkViewMode = mode;
    }
  } catch {
    /* ignore */
  }

  try {
    const ai = localStorage.getItem('content-studio-ai-enabled');
    if (db.contentStudioAiEnabled === d.contentStudioAiEnabled && ai === '0') {
      uplift.contentStudioAiEnabled = false;
    }
  } catch {
    /* ignore */
  }

  try {
    const runnerRaw = localStorage.getItem('wp-pipeline-runner:v1');
    if (runnerRaw) {
      const parsed = JSON.parse(runnerRaw) as { pythonExe?: string; repoRoot?: string };
      if (
        db.pipelinePythonExe === d.pipelinePythonExe &&
        typeof parsed.pythonExe === 'string' &&
        parsed.pythonExe.trim() &&
        parsed.pythonExe.trim() !== d.pipelinePythonExe
      ) {
        uplift.pipelinePythonExe = parsed.pythonExe.trim();
      }
      if (
        db.pipelineRepoRoot === d.pipelineRepoRoot &&
        typeof parsed.repoRoot === 'string' &&
        parsed.repoRoot.trim()
      ) {
        uplift.pipelineRepoRoot = parsed.repoRoot.trim();
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const uiRaw = localStorage.getItem('wp-ui-prefs:v1');
    if (uiRaw) {
      const parsed = JSON.parse(uiRaw) as {
        radius?: unknown;
        density?: unknown;
        animations?: unknown;
        fontSize?: unknown;
      };
      if (db.radiusScale === d.radiusScale && isRadiusScale(parsed.radius) && parsed.radius !== d.radiusScale) {
        uplift.radiusScale = parsed.radius;
      }
      if (db.densityScale === d.densityScale && isDensityScale(parsed.density) && parsed.density !== d.densityScale) {
        uplift.densityScale = parsed.density;
      }
      if (
        db.animationsEnabled === d.animationsEnabled &&
        typeof parsed.animations === 'boolean' &&
        parsed.animations !== d.animationsEnabled
      ) {
        uplift.animationsEnabled = parsed.animations;
      }
      if (
        db.fontSizeScale === d.fontSizeScale &&
        isFontSizeScale(parsed.fontSize) &&
        parsed.fontSize !== d.fontSizeScale
      ) {
        uplift.fontSizeScale = parsed.fontSize;
      }
    }
  } catch {
    /* ignore */
  }

  return uplift;
}

/** Load from DB, uplift legacy localStorage once, cache locally. Safe to call multiple times. */
export async function initClientPreferences(): Promise<ClientPreferences> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const cached = readLocalStorageCache();
    const db = (await fetchClientPreferencesFromDb()) ?? cached ?? { ...DEFAULT_CLIENT_PREFERENCES };
    const uplift = collectLegacyLocalStorageUplift(db);
    let merged = normalizeClientPreferences({ ...db, ...uplift });
    if (Object.keys(uplift).length > 0) {
      await patchClientPreferencesNow(uplift);
      merged = normalizeClientPreferences({ ...merged, ...uplift });
    }
    memoryCache = merged;
    cacheToLocalStorage(merged);
    return merged;
  })();
  return initPromise;
}

export async function loadClientPreferences(): Promise<ClientPreferences> {
  return initClientPreferences();
}
