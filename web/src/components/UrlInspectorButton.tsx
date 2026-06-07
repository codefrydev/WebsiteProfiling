'use client';

import { Search } from 'lucide-react';
import { useOptionalUrlInspector } from '@/context/UrlInspectorContext';
import { strings } from '@/lib/strings';

interface UrlInspectorButtonProps {
  url: string | null | undefined;
  className?: string;
  label?: string;
}

export default function UrlInspectorButton({ url, className = '', label }: UrlInspectorButtonProps) {
  const inspector = useOptionalUrlInspector();
  const trimmed = String(url || '').trim();
  if (!trimmed || !inspector) return null;

  const text = label || strings.components?.urlGapLists?.openInLinks || 'Inspect';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        inspector.openUrl(trimmed);
      }}
      className={`inline-flex items-center gap-1 text-xs text-link hover:underline whitespace-nowrap ${className}`.trim()}
    >
      <Search className="h-3 w-3 shrink-0" aria-hidden />
      {text}
    </button>
  );
}
