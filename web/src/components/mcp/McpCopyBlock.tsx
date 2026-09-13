
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
    <div className="group rounded-2xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-md-sys-on-surface">{label}</p>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-md-sys-on-surface-variant">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => { void handleCopy(); }}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-md-sys-outline-variant/40 px-3 py-1.5 text-xs font-medium text-md-sys-on-surface-variant transition-colors hover:border-md-sys-primary/40 hover:text-md-sys-on-surface"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-md-sys-success" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? s.copied : s.copy}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto rounded-xl border border-md-sys-outline-variant/30 bg-md-sys-surface p-3 text-xs leading-relaxed text-md-sys-on-surface">
        <code>{language === 'shell' ? `$ ${value}` : value}</code>
      </pre>
    </div>
  );
}
