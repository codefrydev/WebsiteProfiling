'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Circle, Cloud, HardDrive, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { format, strings } from '@/lib/strings';

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
  if (tier === 'free_local') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (tier === 'cloud_pro') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
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

  const connected = status?.ok === true;
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
    <div className="min-w-0 sm:col-span-2 space-y-3 rounded-lg border border-default bg-brand-900/50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{s.title}</p>
            {status?.catalogSource === 'live' ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-200">
                <Sparkles className="h-3 w-3" />
                {s.liveCatalog}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || disabled}
          className="flex items-center gap-1.5 rounded-lg border border-default px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
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
            className={`h-2 w-2 fill-current ${connected ? 'text-emerald-400' : 'text-red-400'}`}
            aria-hidden
          />
          <span className={connected ? 'text-emerald-300' : 'text-red-400'}>
            {connected ? s.connected : status?.error || s.disconnected}
          </span>
        </span>
        {status?.cloudCatalogOk ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Cloud className="h-3 w-3" />
            {format(s.cloudCount, { count: status.cloudModelCount ?? cloud.length })}
          </span>
        ) : null}
        {baseUrl ? (
          <span className="font-mono text-muted-foreground">({baseUrl})</span>
        ) : null}
      </div>

      <div className="rounded-lg border border-default/70 bg-brand-900/40 px-3 py-2 text-[11px] text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">{s.billingLegendTitle}</p>
        <ul className="space-y-1">
          <li>
            <span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 ${billingBadgeClass('free_local')}`}>
              {s.billingFreeLocal}
            </span>
            {s.billingLegendFreeLocal}
          </li>
          <li>
            <span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 ${billingBadgeClass('cloud_free')}`}>
              {s.billingCloudFree}
            </span>
            {s.billingLegendCloudFree}
          </li>
          <li>
            <span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 ${billingBadgeClass('cloud_pro')}`}>
              {s.billingCloudPro}
            </span>
            {s.billingLegendCloudPro}
          </li>
        </ul>
      </div>

      <div>
        <label htmlFor="ollama-model-search" className="mb-1 block text-xs font-medium text-foreground">
          {s.modelLabel}
        </label>
        {connected && models.length ? (
          <div className="space-y-2">
            <input
              id="ollama-model-search"
              type="search"
              value={query}
              disabled={disabled}
              placeholder={s.searchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <select
              id="ollama-model-select"
              value={model}
              disabled={disabled}
              onChange={(e) => onModelChange(e.target.value)}
              className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
                <span className="text-muted-foreground">{s.selectedBilling}:</span>
                <span className={`rounded border px-2 py-0.5 ${billingBadgeClass(selected.billing)}`}>
                  {billingLabel(selected.billing)}
                </span>
                {selected.capabilities?.includes('tools') ? (
                  <span className="rounded border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-violet-200">
                    tools
                  </span>
                ) : null}
              </div>
            ) : null}
            {!filtered.length ? (
              <p className="text-xs text-muted-foreground">{s.noMatches}</p>
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
            className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        )}
        {connected && !status?.cloudCatalogOk ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
            <HardDrive className="h-3 w-3" />
            {s.cloudCatalogUnavailable}
          </p>
        ) : null}
      </div>
    </div>
  );
}
