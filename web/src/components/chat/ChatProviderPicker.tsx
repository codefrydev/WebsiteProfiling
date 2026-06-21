'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown } from 'lucide-react';
import { LLM_PROVIDER_LABELS, LLM_CLOUD_PROVIDERS } from '@/lib/llmProviderApiKeys';
import { strings } from '@/lib/strings';
import { usePipeline } from '@/context/PipelineContext';

const c = strings.components.chat;

const CHAT_PROVIDER_OPTIONS = [
  ...LLM_CLOUD_PROVIDERS.map((value) => ({
    value,
    label: LLM_PROVIDER_LABELS[value],
  })),
  { value: 'ollama', label: 'Ollama (local)' },
];

export interface ChatProviderPickerProps {
  provider: string;
  disabled?: boolean;
  /** Opens above (composer) or below (header) the trigger. */
  menuPlacement?: 'above' | 'below';
  triggerClassName?: string;
}

function providerLabel(value: string): string {
  return CHAT_PROVIDER_OPTIONS.find((opt) => opt.value === value)?.label ?? value;
}

export default function ChatProviderPicker({
  provider,
  disabled,
  menuPlacement = 'above',
  triggerClassName,
}: ChatProviderPickerProps) {
  const { saveLlmProvider, saving } = usePipeline();
  const [open, setOpen] = useState(false);
  const [saveError, setSaveError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const busy = disabled || saving;

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

  const handleProviderChange = async (nextProvider: string) => {
    if (!nextProvider || nextProvider === provider) {
      setOpen(false);
      return;
    }
    setSaveError('');
    const ok = await saveLlmProvider(nextProvider);
    if (!ok) setSaveError(c.providerSaveFailed);
    else setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={
          triggerClassName ??
          'flex max-w-[6.5rem] items-center gap-1 rounded-full px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground disabled:opacity-50 sm:max-w-[8.5rem]'
        }
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={c.chooseProvider}
      >
        <span
          className={`truncate font-medium ${triggerClassName ? 'text-inherit' : 'text-foreground'}`}
        >
          {providerLabel(provider)}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div
          className={`absolute right-0 z-50 w-[min(14rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-default bg-[var(--chat-surface)] shadow-2xl ${
            menuPlacement === 'below' ? 'top-full mt-2' : 'bottom-full mb-2'
          }`}
          role="listbox"
        >
          <ul className="max-h-[min(16rem,50vh)] overflow-y-auto p-1">
            {CHAT_PROVIDER_OPTIONS.map((opt) => {
              const active = opt.value === provider;
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => void handleProviderChange(opt.value)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--chat-surface-hover)] ${
                      active ? 'bg-[var(--chat-surface-hover)]' : ''
                    }`}
                  >
                    <span className="w-4 shrink-0">
                      {active ? <Check className="h-4 w-4 text-foreground" /> : null}
                    </span>
                    <span className="truncate text-bright">{opt.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="space-y-1 border-t border-muted/50 p-2 text-xs">
            {saveError ? <p className="px-1 text-red-400">{saveError}</p> : null}
            <div className="flex justify-end px-1">
              <Link
                href="/secrets"
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
