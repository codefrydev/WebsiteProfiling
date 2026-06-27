import { describe, expect, it } from 'vitest';
import { resolveOllamaHealth } from './ollamaConnectionHealth';
import type { OllamaModelsStatus } from '@/hooks/useOllamaModels';

describe('resolveOllamaHealth', () => {
  it('returns loading while fetching with no prior status', () => {
    expect(resolveOllamaHealth(null, true)).toBe('loading');
  });

  it('returns healthy when local Ollama responds', () => {
    const status: OllamaModelsStatus = { ok: true, localOk: true, cloudCatalogOk: true };
    expect(resolveOllamaHealth(status, false)).toBe('healthy');
  });

  it('returns degraded when only cloud catalog is reachable', () => {
    const status: OllamaModelsStatus = { ok: true, localOk: false, cloudCatalogOk: true };
    expect(resolveOllamaHealth(status, false)).toBe('degraded');
  });

  it('returns offline when neither local nor cloud catalog responds', () => {
    const status: OllamaModelsStatus = {
      ok: false,
      localOk: false,
      cloudCatalogOk: false,
      error: 'Cannot reach Ollama or the cloud model catalog.',
    };
    expect(resolveOllamaHealth(status, false)).toBe('offline');
  });

  it('prefers backend health when present', () => {
    const status: OllamaModelsStatus = {
      ok: true,
      health: 'degraded',
      localOk: true,
      cloudCatalogOk: true,
    };
    expect(resolveOllamaHealth(status, false)).toBe('degraded');
  });
});
