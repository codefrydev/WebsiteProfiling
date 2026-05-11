import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { strings } from '../../lib/strings';

export default function CopyBtn({ text, className = '' }) {
  const c = strings.components.copyBtn;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={c.title}
      className={`inline-flex items-center gap-1 text-muted-foreground hover:text-bright transition-colors ${className}`}
    >
      {copied
        ? <Check className="h-3 w-3 text-green-700 dark:text-green-400" />
        : <Copy className="h-3 w-3" />}
    </button>
  );
}
