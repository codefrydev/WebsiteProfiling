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
      className={`press absolute top-2 right-2 z-10 rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/90 p-1.5 text-md-sys-on-surface-variant opacity-0 shadow-xs backdrop-blur transition-all duration-150 hover:border-md-sys-primary/40 hover:text-md-sys-on-surface active:scale-90 focus:opacity-100 group-hover/dev-card:opacity-100 ${className}`.trim()}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-md-sys-success" aria-hidden />
      ) : (
        <Braces className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}
