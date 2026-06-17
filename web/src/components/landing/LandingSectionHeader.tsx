import type { ReactNode } from 'react';

interface LandingSectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  centered?: boolean;
  compact?: boolean;
}

export default function LandingSectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
  centered = true,
  compact = false,
}: LandingSectionHeaderProps) {
  const align = centered ? 'text-center' : 'text-left';
  const spacing = compact ? 'mb-4 gap-2' : 'mb-8 gap-4';
  const titleClass = compact ? 'text-xl font-bold sm:text-2xl' : 'text-2xl font-bold sm:text-3xl';
  const subtitleClass = compact ? 'mt-1 text-xs sm:text-sm' : 'mt-2 text-sm sm:text-base';

  return (
    <div
      className={`flex flex-col ${spacing} ${centered ? 'items-center sm:flex-row sm:items-end sm:justify-between' : 'sm:flex-row sm:items-end sm:justify-between'}`}
    >
      <div className={centered ? 'w-full min-w-0 sm:text-left' : 'w-full min-w-0'}>
        {eyebrow ? (
          <p className={`mb-1 text-xs font-semibold uppercase tracking-wider text-link ${align} sm:text-left`}>
            {eyebrow}
          </p>
        ) : null}
        <h2 className={`${titleClass} text-foreground ${align} sm:text-left`}>{title}</h2>
        {subtitle ? (
          <p className={`${subtitleClass} text-muted-foreground ${align} sm:text-left`}>{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
