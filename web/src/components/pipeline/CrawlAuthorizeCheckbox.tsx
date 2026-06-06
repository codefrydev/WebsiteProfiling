'use client';

import { strings } from '@/lib/strings';

const c = strings.components.crawlAuthorize;

export default function CrawlAuthorizeCheckbox({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2 text-sm text-foreground ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="mt-1 rounded border-default"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{c.label}</span>
    </label>
  );
}
