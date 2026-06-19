/**
 * Consistent page title and optional subtitle.
 */
import React, { type ReactNode } from 'react';

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`.trim()}>
      <div className="min-w-0">
        <h1 className="text-3xl font-bold text-bright mb-2 flex items-center gap-2">
          {icon ? <span className="shrink-0">{icon}</span> : null}
          <span className="min-w-0">{title}</span>
        </h1>
        {subtitle ? <div className="text-muted-foreground">{subtitle}</div> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}
