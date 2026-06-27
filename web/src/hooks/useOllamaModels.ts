
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { resolveOllamaHealth, type OllamaHealth } from '@/lib/ollamaConnectionHealth';

export type OllamaBillingTier = 'free_local' | 'cloud_free' | 'cloud_pro';

export interface OllamaModelEntry {
  name: string;
  source: 'local' | 'cloud';
  installed: boolean;
  capabilities?: string[];
  billing: OllamaBillingTier;
  requires_subscription: boolean;
}

export interface OllamaModelsStatus {
  ok: boolean;
  health?: OllamaHealth;
  error?: string;
  warning?: string;
  localOk?: boolean;
  cloudCatalogOk?: boolean;
  catalogSource?: string;
  cloudModelCount?: number;
  configuredModel?: string;
  supportsTools?: boolean;
  modelInstalled?: boolean;
  models?: OllamaModelEntry[];
}

export function useOllamaModels(baseUrl: string, enabled = true) {
  const [status, setStatus] = useState<OllamaModelsStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await apiFetch(apiUrl('/ollama/status'));
      if (!res.ok) {
        setStatus({ ok: false, error: 'unreachable' });
        return;
      }
      const data = (await res.json()) as OllamaModelsStatus;
      setStatus(data);
    } catch {
      setStatus({ ok: false, error: 'unreachable' });
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const health = useMemo(
    () => resolveOllamaHealth(status, loading),
    [status, loading],
  );

  useEffect(() => {
    void refresh();
  }, [refresh, baseUrl]);

  return {
    status,
    loading,
    refresh,
    models: status?.models ?? [],
    /** @deprecated Prefer `health` — true only for healthy or degraded (catalog usable). */
    connected: status?.ok === true,
    health,
    catalogUsable: health === 'healthy' || health === 'degraded',
  };
}
