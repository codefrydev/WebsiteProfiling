import type { ReactNode } from 'react';
import Card from './Card';

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  size?: 'md' | 'lg';
  className?: string;
  shadow?: boolean;
}

export default function StatCard({
  label,
  value,
  sub,
  icon,
  size = 'md',
  className = '',
  shadow = false,
}: StatCardProps) {
  const valueClass = size === 'lg' ? 'text-3xl font-bold text-bright' : 'text-2xl font-bold text-bright tabular-nums';

  return (
    <Card padding="tight" shadow={shadow} className={className}>
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1 flex items-center gap-2">
        {icon}
        {label}
      </p>
      <p className={valueClass}>{value ?? '—'}</p>
      {sub ? <p className="text-xs text-muted-foreground mt-1">{sub}</p> : null}
    </Card>
  );
}
