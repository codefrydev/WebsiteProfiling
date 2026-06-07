import type { ReactNode } from 'react';

interface LandingSectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  centered?: boolean;
}

export default function LandingSectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
  centered = true,
}: LandingSectionHeaderProps) {
  const align = centered ? 'text-center' : 'text-left';
  return (
    <div
      className={`mb-8 flex flex-col gap-4 ${centered ? 'items-center sm:flex-row sm:items-end sm:justify-between' : 'sm:flex-row sm:items-end sm:justify-between'}`}
    >
      <div className={centered ? 'max-w-2xl sm:text-left' : 'max-w-2xl'}>
        {eyebrow ? (
          <p className={`mb-2 text-xs font-medium uppercase tracking-wider text-link ${align} sm:text-left`}>
            {eyebrow}
          </p>
        ) : null}
        <h2 className={`text-2xl font-bold text-foreground sm:text-3xl ${align} sm:text-left`}>{title}</h2>
        {subtitle ? (
          <p className={`mt-2 text-sm text-muted-foreground sm:text-base ${align} sm:text-left`}>{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
