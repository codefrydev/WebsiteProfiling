/** Discover local + Ollama cloud models for settings and chat UI. */

export const OLLAMA_CLOUD_CATALOG_URL = 'https://ollama.com/api/tags';

export type OllamaModelSource = 'local' | 'cloud';

/** How billing applies when running this model through Ollama. */
export type OllamaBillingTier = 'free_local' | 'cloud_free' | 'cloud_pro';

export interface OllamaModelEntry {
  name: string;
  source: OllamaModelSource;
  installed: boolean;
  capabilities?: string[];
  context_length?: number;
  billing: OllamaBillingTier;
  requires_subscription: boolean;
}

/** Large / frontier cloud models that typically need an Ollama Pro plan. */
const PRO_CLOUD_MODEL_PATTERNS: RegExp[] = [
  /671b/i,
  /480b/i,
  /:1t(?:-cloud|:cloud)?$/i,
  /v4-pro/i,
  /nemotron-3-ultra/i,
  /nemotron-3-super/i,
  /mistral-large/i,
  /397b/i,
  /cogito-2\.1:671b/i,
  /deepseek-v4-pro/i,
  /qwen3-coder:480b/i,
  /gpt-oss:120b/i,
];

export function resolveBillingTier(
  name: string,
  source: OllamaModelSource,
): { billing: OllamaBillingTier; requires_subscription: boolean } {
  const cloud = source === 'cloud' || isCloudModelRef(name);
  if (!cloud) {
    return { billing: 'free_local', requires_subscription: false };
  }
  if (PRO_CLOUD_MODEL_PATTERNS.some((re) => re.test(name))) {
    return { billing: 'cloud_pro', requires_subscription: true };
  }
  return { billing: 'cloud_free', requires_subscription: true };
}

function withBilling(
  entry: Omit<OllamaModelEntry, 'billing' | 'requires_subscription'>,
): OllamaModelEntry {
  const { billing, requires_subscription } = resolveBillingTier(entry.name, entry.source);
  return { ...entry, billing, requires_subscription };
}

/** Map catalog name to the ref used by local Ollama for cloud inference. */
export function toCloudModelRef(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (trimmed.endsWith('-cloud') || trimmed.endsWith(':cloud')) return trimmed;
  return trimmed.includes(':') ? `${trimmed}-cloud` : `${trimmed}:cloud`;
}

export function isCloudModelRef(name: string): boolean {
  return name.endsWith('-cloud') || name.endsWith(':cloud');
}

function normalizeLocalModel(raw: {
  name?: string;
  details?: { context_length?: number };
  capabilities?: string[];
  remote_host?: string;
}): OllamaModelEntry | null {
  const name = String(raw.name || '').trim();
  if (!name) return null;
  const cloud =
    Boolean(raw.remote_host) || isCloudModelRef(name);
  return withBilling({
    name,
    source: cloud ? 'cloud' : 'local',
    installed: true,
    capabilities: raw.capabilities,
    context_length: raw.details?.context_length,
  });
}

function normalizeCatalogModel(raw: { name?: string }): OllamaModelEntry | null {
  const base = String(raw.name || '').trim();
  if (!base) return null;
  return withBilling({
    name: toCloudModelRef(base),
    source: 'cloud',
    installed: false,
  });
}

function modelKey(name: string): string {
  return name.toLowerCase();
}

export function mergeOllamaModels(
  local: OllamaModelEntry[],
  cloudCatalog: OllamaModelEntry[],
): OllamaModelEntry[] {
  const byKey = new Map<string, OllamaModelEntry>();

  for (const m of cloudCatalog) {
    byKey.set(modelKey(m.name), m);
  }

  for (const m of local) {
    const key = modelKey(m.name);
    const existing = byKey.get(key);
    const merged = {
      ...existing,
      ...m,
      installed: true,
      capabilities: m.capabilities?.length ? m.capabilities : existing?.capabilities,
      context_length: m.context_length ?? existing?.context_length,
    };
    const { billing, requires_subscription } = resolveBillingTier(merged.name, merged.source);
    byKey.set(key, { ...merged, billing, requires_subscription });
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    if (a.source !== b.source) return a.source === 'local' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 8000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface FetchOllamaModelsResult {
  ok: boolean;
  baseUrl: string;
  models: OllamaModelEntry[];
  cloudCatalogOk: boolean;
  localOk: boolean;
  error?: string;
}

export async function fetchOllamaModels(baseUrl: string): Promise<FetchOllamaModelsResult> {
  const normalizedBase = baseUrl.replace(/\/$/, '') || 'http://127.0.0.1:11434';

  const [localData, cloudData] = await Promise.all([
    fetchJson<{ models?: Array<Record<string, unknown>> }>(`${normalizedBase}/api/tags`),
    fetchJson<{ models?: Array<{ name?: string }> }>(OLLAMA_CLOUD_CATALOG_URL, undefined, 12000),
  ]);

  const localOk = localData != null;
  const cloudCatalogOk = cloudData != null;

  const localModels = (localData?.models || [])
    .map((m) => normalizeLocalModel(m as Parameters<typeof normalizeLocalModel>[0]))
    .filter((m): m is OllamaModelEntry => m != null);

  const cloudModels = (cloudData?.models || [])
    .map((m) => normalizeCatalogModel(m))
    .filter((m): m is OllamaModelEntry => m != null);

  const models = mergeOllamaModels(localModels, cloudModels);

  if (!localOk && !cloudCatalogOk) {
    return {
      ok: false,
      baseUrl: normalizedBase,
      models: [],
      cloudCatalogOk: false,
      localOk: false,
      error: 'Cannot reach Ollama or the cloud model catalog.',
    };
  }

  return {
    ok: localOk || cloudCatalogOk,
    baseUrl: normalizedBase,
    models,
    cloudCatalogOk,
    localOk,
  };
}

export function modelIsConfigured(
  models: OllamaModelEntry[],
  configuredModel: string,
): boolean {
  const target = configuredModel.trim();
  if (!target) return models.length > 0;
  const key = modelKey(target);
  return models.some((m) => modelKey(m.name) === key);
}

export function modelsSupportTools(models: OllamaModelEntry[]): boolean {
  return models.some((m) => m.capabilities?.includes('tools'));
}
