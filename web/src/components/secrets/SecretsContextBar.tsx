'use client';

import { KeyRound } from 'lucide-react';
import { SECRETS_SECTIONS, type SecretsNavId } from '@/lib/secretsConfigSchema';
import { strings } from '@/lib/strings';

const s = strings.secrets;

export interface SecretsContextBarProps {
  activeSection: SecretsNavId;
}

export default function SecretsContextBar({ activeSection }: SecretsContextBarProps) {
  const section = SECRETS_SECTIONS.find((sec) => sec.id === activeSection);

  return (
    <header className="chat-context-bar flex items-center gap-3 border-b border-muted/30 bg-[var(--chat-bg)] px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-bright" title={section?.label ?? s.pageTitle}>
            {section?.label ?? s.pageTitle}
          </p>
          <p className="truncate text-xs text-muted-foreground" title={s.pageSubtitle}>
            {s.pageSubtitle}
          </p>
        </div>
      </div>
    </header>
  );
}
