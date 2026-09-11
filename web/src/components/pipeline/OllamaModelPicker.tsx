
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Circle, Cloud, HardDrive, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { format, strings } from '@/lib/strings';
import {
  ollamaHealthDotClass,
  ollamaHealthLabel,
  resolveOllamaHealth,
} from '@/lib/ollamaConnectionHealth';

const s = strings.pipelineRunner.ollama;

export interface OllamaModelPickerProps {
  model: string;
  baseUrl: string;
  disabled?: boolean;
  onModelChange: (model: string) => void;
}

type OllamaBillingTier = 'free_local' | 'cloud_free' | 'cloud_pro';

interface OllamaModelEntry {
  name: string;
  source: 'local' | 'cloud';
  installed: boolean;
  capabilities?: string[];
  billing: OllamaBillingTier;
  requires_subscription: boolean;
}

interface OllamaStatus {
  ok: boolean;
  error?: string;
  localOk?: boolean;
  cloudCatalogOk?: boolean;
  catalogSource?: string;
  cloudModelCount?: number;
  models?: OllamaModelEntry[];
}

function billingLabel(tier: OllamaBillingTier): string {
  if (tier === 'free_local') return s.billingFreeLocal;
  if (tier === 'cloud_pro') return s.billingCloudPro;
  return s.billingCloudFree;
}

function billingBadgeClass(tier: OllamaBillingTier): string {
  if (tier === 'free_local') return 'border-md-sys-success/30 bg-md-sys-success-container/30 text-md-sys-on-success-container';
  if (tier === 'cloud_pro') return 'border-md-sys-warning/30 bg-md-sys-warning-container/30 text-md-sys-on-warning-container';
  return 'border-md-sys-info/30 bg-md-sys-info-container/30 text-md-sys-on-info-container';
}

function modelOptionLabel(m: OllamaModelEntry): string {
  const parts = [m.name];
  if (m.capabilities?.includes('tools')) parts.push('tools');
  parts.push(billingLabel(m.billing));
  return parts.join(' · ');
}

export default function OllamaModelPicker({
  model,
  baseUrl,
  disabled,
  onModelChange,
}: OllamaModelPickerProps) {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(apiUrl('/ollama/status'));
      if (!res.ok) {
        setStatus({ ok: false, error: s.unreachable });
        return;
      }
      const data = (await res.json()) as OllamaStatus;
      setStatus(data);
      if (data.ok && data.models?.length && !model) {
        const preferred =
          data.models.find((m) => m.installed) ??
          data.models.find((m) => m.source === 'cloud') ??
          data.models[0];
        onModelChange(preferred.name);
      }
    } catch {
      setStatus({ ok: false, error: s.unreachable });
    } finally {
      setLoading(false);
    }
  }, [model, onModelChange]);

  useEffect(() => {
    void refresh();
  }, [refresh, baseUrl]);

  const health = resolveOllamaHealth(status, loading);
  const catalogUsable = health === 'healthy' || health === 'degraded';
  const models = status?.models || [];
  const selected = models.find((m) => m.name === model);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.name.toLowerCase().includes(q));
  }, [models, query]);

  const installed = filtered.filter((m) => m.installed);
  const cloud = filtered.filter((m) => m.source === 'cloud' && !m.installed);
  const local = filtered.filter((m) => m.source === 'local' && !m.installed);

  return (
    <div className="min-w-0 sm:col-span-2 space-y-3 rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-md-sys-on-surface">{s.title}</p>
            {status?.catalogSource === 'live' ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-md-sys-tertiary/30 bg-md-sys-tertiary-container/30 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-md-sys-on-tertiary-container">
                <Sparkles className="h-3 w-3" />
                {s.liveCatalog}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-md-sys-on-surface-variant">{s.hint}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || disabled}
          className="press flex items-center gap-1.5 rounded-full border border-md-sys-outline-variant/40 px-3 py-1.5 text-xs text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:bg-md-sys-surface-container active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {s.refresh}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <Circle
            className={`h-2 w-2 fill-current ${ollamaHealthDotClass(health)}`}
            aria-hidden
          />
          <span
            className={
              health === 'healthy'
                ? 'text-md-sys-success font-medium'
                : health === 'degraded'
                  ? 'text-md-sys-warning font-medium'
                  : 'text-md-sys-error font-medium'
            }
          >
            {ollamaHealthLabel(health, status, {
              connected: s.connected,
              degraded: s.degraded,
              disconnected: s.disconnected,
              unreachable: s.unreachable,
            })}
          </span>
        </span>
        {status?.cloudCatalogOk ? (
          <span className="flex items-center gap-1 text-md-sys-on-surface-variant">
            <Cloud className="h-3 w-3" />
            {format(s.cloudCount, { count: status.cloudModelCount ?? cloud.length })}
          </span>
        ) : null}
        {baseUrl ? (
          <span className="font-mono text-md-sys-on-surface-variant">({baseUrl})</span>
        ) : null}
      </div>

      <div className="rounded-2xl border border-md-sys-outline-variant/70 bg-md-sys-surface-container-low/40 px-3 py-2 text-[11px] text-md-sys-on-surface-variant">
        <p className="mb-1 font-medium text-md-sys-on-surface">{s.billingLegendTitle}</p>
        <ul className="space-y-1">
          <li>
            <span className={`mr-1.5 inline-block rounded-full border px-2 py-0.5 ${billingBadgeClass('free_local')}`}>
              {s.billingFreeLocal}
            </span>
            {s.billingLegendFreeLocal}
          </li>
          <li>
            <span className={`mr-1.5 inline-block rounded-full border px-2 py-0.5 ${billingBadgeClass('cloud_free')}`}>
              {s.billingCloudFree}
            </span>
            {s.billingLegendCloudFree}
          </li>
          <li>
            <span className={`mr-1.5 inline-block rounded-full border px-2 py-0.5 ${billingBadgeClass('cloud_pro')}`}>
              {s.billingCloudPro}
            </span>
            {s.billingLegendCloudPro}
          </li>
        </ul>
      </div>

      <div>
        <label htmlFor="ollama-model-search" className="mb-1 block text-xs font-medium text-md-sys-on-surface">
          {s.modelLabel}
        </label>
        {catalogUsable && models.length ? (
          <div className="space-y-2">
            <input
              id="ollama-model-search"
              type="search"
              value={query}
              disabled={disabled}
              placeholder={s.searchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low px-4 py-2 text-sm text-md-sys-on-surface placeholder:text-md-sys-on-surface-variant/60 focus:border-md-sys-primary focus:outline-none focus:ring-2 focus:ring-md-sys-primary/20"
            />
            <select
              id="ollama-model-select"
              value={model}
              disabled={disabled}
              onChange={(e) => onModelChange(e.target.value)}
              className="w-full rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low px-4 py-2 text-sm text-md-sys-on-surface focus:border-md-sys-primary focus:outline-none focus:ring-2 focus:ring-md-sys-primary/20"
            >
              {!model ? <option value="">{s.pickModel}</option> : null}
              {installed.length ? (
                <optgroup label={s.groupInstalled}>
                  {installed.map((m) => (
                    <option key={m.name} value={m.name}>
                      {modelOptionLabel(m)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {cloud.length ? (
                <optgroup label={s.groupCloud}>
                  {cloud.map((m) => (
                    <option key={m.name} value={m.name}>
                      {modelOptionLabel(m)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {local.length ? (
                <optgroup label={s.groupLocal}>
                  {local.map((m) => (
                    <option key={m.name} value={m.name}>
                      {modelOptionLabel(m)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            {selected ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-md-sys-on-surface-variant">{s.selectedBilling}:</span>
                <span className={`rounded-full border px-2.5 py-0.5 ${billingBadgeClass(selected.billing)}`}>
                  {billingLabel(selected.billing)}
                </span>
                {selected.capabilities?.includes('tools') ? (
                  <span className="rounded-full border border-md-sys-tertiary/30 bg-md-sys-tertiary-container/30 px-2 py-0.5 text-md-sys-on-tertiary-container">
                    tools
                  </span>
                ) : null}
              </div>
            ) : null}
            {!filtered.length ? (
              <p className="text-xs text-md-sys-on-surface-variant">{s.noMatches}</p>
            ) : null}
          </div>
        ) : (
          <input
            id="ollama-model-select"
            type="text"
            value={model}
            disabled={disabled}
            placeholder="e.g. llama3.2, kimi-k2.6:cloud"
            onChange={(e) => onModelChange(e.target.value)}
            className="w-full rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low px-4 py-2 text-sm text-md-sys-on-surface focus:border-md-sys-primary focus:outline-none focus:ring-2 focus:ring-md-sys-primary/20"
          />
        )}
        {catalogUsable && !status?.cloudCatalogOk ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-md-sys-warning">
            <HardDrive className="h-3 w-3" />
            {s.cloudCatalogUnavailable}
          </p>
        ) : null}
      </div>
    </div>
  );
}
