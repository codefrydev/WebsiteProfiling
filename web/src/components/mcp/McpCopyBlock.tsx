'use client';

import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { strings } from '@/lib/strings';

const s = strings.mcpSettings;

interface McpCopyBlockProps {
  label: string;
  description?: string;
  value: string;
  language?: 'json' | 'shell';
}

export default function McpCopyBlock({ label, description, value, language = 'json' }: McpCopyBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [value]);

  return (
    <div className="group rounded-2xl border border-muted/30 bg-[var(--chat-surface)] p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => { void handleCopy(); }}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-default/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-blue-500/25 hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? s.copied : s.copy}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto rounded-xl border border-default/40 bg-[var(--chat-bg)] p-3 text-xs leading-relaxed text-foreground">
        <code>{language === 'shell' ? `$ ${value}` : value}</code>
      </pre>
    </div>
  );
}
