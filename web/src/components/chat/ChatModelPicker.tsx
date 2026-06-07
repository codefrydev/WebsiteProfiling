'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Circle, Loader2, RefreshCw } from 'lucide-react';
import { useOllamaModels, type OllamaModelEntry } from '@/hooks/useOllamaModels';
import {
  ollamaBillingLabel,
  ollamaModelOptionLabel,
  ollamaModelShortLabel,
} from '@/lib/ollamaModelLabels';
import { format, strings } from '@/lib/strings';
import { usePipeline } from '@/context/PipelineContext';

const c = strings.components.chat;
const s = strings.pipelineRunner.ollama;

export interface ChatModelPickerProps {
  provider: string;
  model: string;
  baseUrl?: string;
  disabled?: boolean;
}

function groupModels(models: OllamaModelEntry[]) {
  return {
    installed: models.filter((m) => m.installed),
    cloud: models.filter((m) => m.source === 'cloud' && !m.installed),
    local: models.filter((m) => m.source === 'local' && !m.installed),
  };
}

function ModelRow({
  entry,
  active,
  onSelect,
}: {
  entry: OllamaModelEntry;
  active: boolean;
  onSelect: (name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.name)}
      className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[var(--chat-surface-hover)] ${
        active ? 'bg-[var(--chat-surface-hover)]' : ''
      }`}
    >
      <span className="mt-0.5 w-4 shrink-0">
        {active ? <Check className="h-4 w-4 text-foreground" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-bright">{entry.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {ollamaModelOptionLabel(entry.name, entry.billing, entry.capabilities)}
        </span>
      </span>
    </button>
  );
}

export default function ChatModelPicker({
  provider,
  model,
  baseUrl = 'http://127.0.0.1:11434',
  disabled,
}: ChatModelPickerProps) {
  const { saveLlmModel, saving } = usePipeline();
  const isOllama = provider === 'ollama';
  const { status, loading, refresh, models, connected } = useOllamaModels(baseUrl, isOllama);
  const [open, setOpen] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.name.toLowerCase().includes(q));
  }, [models, query]);

  const { installed, cloud, local } = groupModels(filtered);
  const selected = models.find((m) => m.name === model);
  const busy = disabled || saving || loading;

  const triggerLabel = isOllama
    ? model
      ? ollamaModelShortLabel(model)
      : c.ollamaNoModel
    : ollamaModelShortLabel(model || provider || 'AI');

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleModelChange = async (nextModel: string) => {
    if (!nextModel || nextModel === model) {
      setOpen(false);
      return;
    }
    setSaveError('');
    const ok = await saveLlmModel(nextModel);
    if (!ok) setSaveError(c.modelSaveFailed);
    else setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[7rem] items-center gap-1 rounded-full px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground disabled:opacity-50 sm:max-w-[9rem]"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={c.chooseModel}
      >
        {isOllama ? (
          <Circle
            className={`h-2 w-2 shrink-0 fill-current ${
              loading ? 'text-amber-400' : connected ? 'text-emerald-400' : 'text-red-400'
            }`}
            aria-hidden
          />
        ) : null}
        <span className="truncate font-medium text-foreground">{triggerLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div
          className="absolute bottom-full right-0 z-50 mb-2 flex max-h-[min(24rem,60vh)] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-default bg-[var(--chat-surface)] shadow-2xl"
          role="listbox"
        >
          {isOllama && connected && models.length ? (
            <>
              <div className="border-b border-muted/50 p-2">
                <input
                  type="search"
                  value={query}
                  disabled={busy}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={s.searchPlaceholder}
                  aria-label={c.findModel}
                  className="w-full rounded-xl border border-default bg-[var(--chat-bg)] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-violet-500/50 focus:outline-none"
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1">
                {installed.length ? (
                  <div className="mb-1">
                    <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {s.groupInstalled}
                    </p>
                    {installed.map((m) => (
                      <ModelRow
                        key={m.name}
                        entry={m}
                        active={m.name === model}
                        onSelect={(name) => void handleModelChange(name)}
                      />
                    ))}
                  </div>
                ) : null}
                {cloud.length ? (
                  <div className="mb-1">
                    <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {s.groupCloud}
                    </p>
                    {cloud.map((m) => (
                      <ModelRow
                        key={m.name}
                        entry={m}
                        active={m.name === model}
                        onSelect={(name) => void handleModelChange(name)}
                      />
                    ))}
                  </div>
                ) : null}
                {local.length ? (
                  <div>
                    <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {s.groupLocal}
                    </p>
                    {local.map((m) => (
                      <ModelRow
                        key={m.name}
                        entry={m}
                        active={m.name === model}
                        onSelect={(name) => void handleModelChange(name)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="p-3 text-xs text-muted-foreground">
              {isOllama ? (
                connected ? (
                  <p>{model || c.ollamaNoModel}</p>
                ) : (
                  <p className="text-red-400">{c.ollamaUnreachable}</p>
                )
              ) : (
                <p>
                  {model || provider}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1 border-t border-muted/50 p-2 text-xs">
            {isOllama && connected ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-muted-foreground">
                {status?.supportsTools ? (
                  <span className="text-emerald-300/90">{c.ollamaToolsMode}</span>
                ) : (
                  <span className="text-amber-300/90">{c.ollamaReactMode}</span>
                )}
                {status?.cloudCatalogOk ? (
                  <span>{format(c.ollamaCloudCount, { count: status.cloudModelCount ?? 0 })}</span>
                ) : null}
                {selected ? (
                  <span className="w-full truncate">
                    {ollamaBillingLabel(selected.billing)}
                  </span>
                ) : null}
              </div>
            ) : null}
            {saveError ? <p className="px-1 text-red-400">{saveError}</p> : null}
            <div className="flex items-center justify-between gap-2 px-1">
              {isOllama ? (
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={busy}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  aria-label={c.ollamaRefresh}
                >
                  {(saving || loading) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                  )}
                  {c.ollamaRefresh}
                </button>
              ) : (
                <span />
              )}
              <Link
                href="/pipeline?group=llm"
                className="text-link hover:underline"
                onClick={() => setOpen(false)}
              >
                {c.aiSettingsLink}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
