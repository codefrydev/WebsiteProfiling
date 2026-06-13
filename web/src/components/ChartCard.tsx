'use client';

import type { ReactNode } from 'react';
import HelpHint, { normalizeHintContent, type HelpHintContent } from './HelpHint';

export interface ChartCardProps {
  title: string;
  hint?: HelpHintContent;
  ariaLabel?: string;
  heightClass?: string;
  children?: ReactNode;
  className?: string;
}

export default function ChartCard({
  title,
  hint,
  ariaLabel,
  heightClass = 'h-56',
  children,
  className = '',
}: ChartCardProps) {
  const hintContent = normalizeHintContent(hint);

  return (
    <div className={`bg-brand-800 border border-default rounded-xl p-4 ${className}`.trim()}>
      <div className="flex items-start gap-1.5 mb-1">
        <h3 className="text-sm font-bold text-foreground min-w-0">{title}</h3>
        {hintContent ? (
          <HelpHint title={hintContent.title} ariaLabel={`About ${title}`}>
            {hintContent.body}
          </HelpHint>
        ) : null}
      </div>
      <div className={heightClass} role="img" aria-label={ariaLabel}>
        {children}
      </div>
    </div>
  );
}
