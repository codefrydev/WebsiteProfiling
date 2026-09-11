
import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

interface LandingCodeBlockProps {
  label?: string;
  command: string;
  prominent?: boolean;
}

export default function LandingCodeBlock({ label, command, prominent = false }: LandingCodeBlockProps) {
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
    <div
      className={`group border border-md-sys-outline-variant/40 transition-colors hover:border-blue-500/25 ${
        prominent ? 'rounded-xl p-4 @sm:p-5' : 'rounded-lg p-3'
      }`}
    >
      <div className={`flex items-center justify-between gap-2 ${prominent ? 'mb-2' : 'mb-1.5'}`}>
        {label ? (
          <p
            className={`font-medium uppercase tracking-wider text-md-sys-on-surface-variant ${
              prominent ? 'text-xs @sm:text-sm' : 'text-[10px] @sm:text-xs'
            }`}
          >
            {label}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => { void handleCopy(); }}
          className={`inline-flex items-center gap-1 rounded-md border border-md-sys-outline-variant/40 font-medium text-md-sys-on-surface-variant opacity-0 transition-all group-hover:opacity-100 hover:border-blue-500/25 hover:text-md-sys-on-surface focus:opacity-100 ${
            prominent ? 'px-2.5 py-1.5 text-xs' : 'px-2 py-1 text-[11px]'
          }`}
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
          {copied ? vl.copyCommandDone : vl.copyCommand}
        </button>
      </div>
      <pre className={`overflow-hidden font-mono text-md-sys-on-surface ${prominent ? 'text-sm @sm:text-base' : 'text-xs @sm:text-sm'}`}>
        <code className={prominent ? 'break-all' : 'line-clamp-3 break-all'}>
          <span className="select-none text-md-sys-on-surface-variant">$ </span>
          {command}
        </code>
      </pre>
    </div>
  );
}
