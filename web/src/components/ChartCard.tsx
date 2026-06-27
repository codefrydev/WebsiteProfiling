
import type { ReactNode } from 'react';
import HelpHint, { normalizeHintContent, type HelpHintContent } from './HelpHint';
import DevCopyJsonButton from './DevCopyJsonButton';

export interface ChartCardProps {
  title: string;
  hint?: HelpHintContent;
  ariaLabel?: string;
  heightClass?: string;
  children?: ReactNode;
  className?: string;
  devData?: unknown;
}

export default function ChartCard({
  title,
  hint,
  ariaLabel,
  heightClass = 'h-56',
  children,
  className = '',
  devData,
}: ChartCardProps) {
  const hintContent = normalizeHintContent(hint);
  const showDevCopy = import.meta.env.DEV && devData != null;

  return (
    <div className={`${showDevCopy ? 'relative group/dev-card ' : ''}bg-brand-800 border border-default rounded-xl p-4 ${className}`.trim()}>
      {showDevCopy ? <DevCopyJsonButton data={devData} /> : null}
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
