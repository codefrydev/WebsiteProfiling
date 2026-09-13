
import type { ReactNode } from 'react';
import HelpHint, { normalizeHintContent, type HelpHintContent } from './HelpHint';
import Card from './Card';

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

  return (
    <Card devData={devData} className={className}>
      <div className="flex items-start gap-1.5 mb-2">
        <h3 className="text-sm font-semibold text-md-sys-on-surface min-w-0">{title}</h3>
        {hintContent ? (
          <HelpHint title={hintContent.title} ariaLabel={`About ${title}`}>
            {hintContent.body}
          </HelpHint>
        ) : null}
      </div>
      <div className={heightClass} role="img" aria-label={ariaLabel}>
        {children}
      </div>
    </Card>
  );
}
