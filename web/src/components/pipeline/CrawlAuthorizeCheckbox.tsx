'use client';

import { strings } from '@/lib/strings';

const c = strings.components.crawlAuthorize;

export default function CrawlAuthorizeCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
      <input
        type="checkbox"
        className="mt-1 rounded border-default"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{c.label}</span>
    </label>
  );
}
