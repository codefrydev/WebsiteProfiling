import type { OllamaModelsStatus } from '@/hooks/useOllamaModels';

/** How usable Ollama is for model pickers — not every probe failure is fatal. */
export type OllamaHealth = 'loading' | 'healthy' | 'degraded' | 'offline';

export function resolveOllamaHealth(
  status: OllamaModelsStatus | null,
  loading: boolean,
): OllamaHealth {
  if (loading && !status) return 'loading';
  if (status?.health === 'healthy' || status?.health === 'degraded' || status?.health === 'offline') {
    return status.health;
  }
  if (!status) return 'offline';
  if (status.ok !== true) return 'offline';
  if (status.localOk === false && status.cloudCatalogOk === true) return 'degraded';
  return 'healthy';
}

export function ollamaHealthDotClass(health: OllamaHealth): string {
  if (health === 'healthy') return 'text-emerald-400';
  if (health === 'degraded' || health === 'loading') return 'text-amber-400';
  return 'text-red-400';
}

export function ollamaHealthLabel(
  health: OllamaHealth,
  status: OllamaModelsStatus | null,
  labels: {
    connected: string;
    degraded: string;
    disconnected: string;
    unreachable: string;
  },
): string {
  if (health === 'healthy') return labels.connected;
  if (health === 'degraded') return status?.warning || labels.degraded;
  if (health === 'loading') return labels.connected;
  return status?.error || labels.disconnected || labels.unreachable;
}
