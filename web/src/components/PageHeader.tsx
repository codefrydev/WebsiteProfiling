/**
 * Consistent page title and optional subtitle.
 */
import type { ReactNode } from 'react';

export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold text-bright mb-2">{title}</h1>
      {subtitle ? <div className="text-muted-foreground">{subtitle}</div> : null}
    </div>
  );
}
