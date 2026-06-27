import { useMemo, useState, type MouseEvent } from 'react';
import { Braces, Check } from 'lucide-react';
import { strings } from '@/lib/strings';

export interface DevCopyJsonButtonProps {
  data: unknown;
  className?: string;
}

function serializeDevJson(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return JSON.stringify({ error: 'Could not serialize widget data' });
  }
}

/** Dev-only overlay button — copies widget JSON to the clipboard. Stripped from production builds. */
export default function DevCopyJsonButton({ data, className = '' }: DevCopyJsonButtonProps) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => serializeDevJson(data), [data]);

  if (!import.meta.env.DEV) return null;

  const copy = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={strings.components.devCopyJson.title}
      aria-label={strings.components.devCopyJson.title}
      className={`absolute top-2 right-2 z-10 rounded border border-default/60 bg-brand-900/90 p-1 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:border-blue-500/40 hover:text-bright focus:opacity-100 group-hover/dev-card:opacity-100 ${className}`.trim()}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-700 dark:text-green-400" aria-hidden />
      ) : (
        <Braces className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}
