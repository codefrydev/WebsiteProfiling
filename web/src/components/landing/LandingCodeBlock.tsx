'use client';

import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

interface LandingCodeBlockProps {
  label?: string;
  command: string;
}

export default function LandingCodeBlock({ label, command }: LandingCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [command]);

  return (
    <div className="group rounded-xl border border-default bg-brand-900/60 p-4 transition-colors hover:border-blue-500/25">
      <div className="mb-2 flex items-center justify-between gap-2">
        {label ? (
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => { void handleCopy(); }}
          className="inline-flex items-center gap-1 rounded-md border border-default/80 bg-brand-800/60 px-2 py-1 text-[11px] font-medium text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:border-blue-500/30 hover:text-foreground focus:opacity-100"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
          {copied ? vl.copyCommandDone : vl.copyCommand}
        </button>
      </div>
      <pre className="overflow-x-auto font-mono text-sm text-foreground">
        <code>
          <span className="select-none text-muted-foreground">$ </span>
          {command}
        </code>
      </pre>
    </div>
  );
}
