
import { useCallback, useEffect, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/publicBase';

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
  error?: string;
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
      const data = (await res.json()) as OllamaModelsStatus;
      setStatus(data);
    } catch {
      setStatus({ ok: false, error: 'unreachable' });
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh, baseUrl]);

  return {
    status,
    loading,
    refresh,
    models: status?.models ?? [],
    connected: status?.ok === true,
  };
}
