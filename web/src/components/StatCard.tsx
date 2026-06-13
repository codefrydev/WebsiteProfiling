import type { ReactNode } from 'react';
import HelpHint, { normalizeHintContent, type HelpHintContent } from './HelpHint';
import Card from './Card';

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  hint?: HelpHintContent;
  size?: 'md' | 'lg';
  className?: string;
  shadow?: boolean;
}

export default function StatCard({
  label,
  value,
  sub,
  icon,
  hint,
  size = 'md',
  className = '',
  shadow = false,
}: StatCardProps) {
  const valueClass = size === 'lg' ? 'text-3xl font-bold text-bright' : 'text-2xl font-bold text-bright tabular-nums';
  const hintContent = normalizeHintContent(hint);

  return (
    <Card padding="tight" shadow={shadow} className={className}>
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1 flex items-center gap-1.5">
        {icon}
        <span className="min-w-0">{label}</span>
        {hintContent ? (
          <HelpHint title={hintContent.title} className="normal-case tracking-normal font-normal">
            {hintContent.body}
          </HelpHint>
        ) : null}
      </p>
      <p className={valueClass}>{value ?? '—'}</p>
      {sub ? <p className="text-xs text-muted-foreground mt-1">{sub}</p> : null}
    </Card>
  );
}
