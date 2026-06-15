import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import Button from './Button';

interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  loading?: boolean;
}

interface EmptyStateHighlight {
  icon: LucideIcon;
  label: string;
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  /** Optional "what you'll get" row beneath the actions. */
  highlights?: EmptyStateHighlight[];
  /** Adds the ambient aurora backdrop behind the content. */
  aurora?: boolean;
  className?: string;
}

function ActionButton({
  action,
  variant,
}: {
  action: EmptyStateAction;
  variant: 'primary' | 'secondary';
}) {
  const btn = (
    <Button
      variant={variant}
      loading={action.loading}
      onClick={action.onClick}
      className="px-6 py-2.5"
    >
      {action.label}
    </Button>
  );
  return action.href ? <Link href={action.href}>{btn}</Link> : btn;
}

/**
 * Shared, welcoming empty/first-run state: icon, title, description, optional
 * primary/secondary actions and a "what you'll get" highlights row.
 * Consolidates the previously bespoke per-view empty states.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  highlights,
  aurora = false,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-default bg-brand-800/40 px-6 py-12 text-center sm:py-16 ${className}`.trim()}
    >
      {aurora ? <div aria-hidden className="aurora-bg" /> : null}
      <div className="relative mx-auto flex max-w-xl flex-col items-center">
        {Icon ? (
          <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-default bg-brand-900/60 text-link">
            <Icon className="h-6 w-6" aria-hidden />
          </span>
        ) : null}
        <h2 className="text-xl font-bold tracking-tight text-bright sm:text-2xl">{title}</h2>
        {description ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        {primaryAction || secondaryAction ? (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {primaryAction ? <ActionButton action={primaryAction} variant="primary" /> : null}
            {secondaryAction ? <ActionButton action={secondaryAction} variant="secondary" /> : null}
          </div>
        ) : null}
        {highlights && highlights.length ? (
          <ul className="mt-9 grid w-full gap-3 sm:grid-cols-3">
            {highlights.map(({ icon: Hi, label }) => (
              <li
                key={label}
                className="flex flex-col items-center gap-2 rounded-xl border border-default bg-brand-900/30 px-4 py-4 text-xs text-muted-foreground"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-link">
                  <Hi className="h-4 w-4" aria-hidden />
                </span>
                <span className="leading-snug">{label}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
