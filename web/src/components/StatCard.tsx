import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import HelpHint, { normalizeHintContent, type HelpHintContent } from './HelpHint';
import Card from './Card';

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  band?: ReactNode;
  bandClassName?: string;
  icon?: ReactNode;
  hint?: HelpHintContent;
  size?: 'md' | 'lg';
  className?: string;
  shadow?: boolean;
  href?: string;
  fillHeight?: boolean;
  valueClassName?: string;
}

export default function StatCard({
  label,
  value,
  sub,
  band,
  bandClassName = 'text-muted-foreground',
  icon,
  hint,
  size = 'md',
  className = '',
  shadow = false,
  href,
  fillHeight = false,
  valueClassName = 'text-bright',
}: StatCardProps) {
  const valueClass =
    size === 'lg' ? `text-3xl font-bold tabular-nums ${valueClassName}` : `text-2xl font-bold tabular-nums ${valueClassName}`;
  const hintContent = normalizeHintContent(hint);
  const heightClass = fillHeight ? 'flex h-full flex-col' : '';
  const linkHeightClass = fillHeight ? 'h-full' : '';

  const hintNode = hintContent ? (
    <HelpHint title={hintContent.title} className="normal-case tracking-normal font-normal">
      {hintContent.body}
    </HelpHint>
  ) : fillHeight ? (
    <span className="inline-flex h-4 w-4 shrink-0" aria-hidden />
  ) : null;

  const footer = fillHeight ? (
    <div className="mt-auto flex flex-col gap-1 pt-1">
      <p
        className={`min-h-4 text-xs font-semibold leading-tight ${band ? bandClassName : 'invisible'}`}
        aria-hidden={!band}
      >
        {band ?? '—'}
      </p>
      <p className={`min-h-4 text-xs leading-tight text-muted-foreground ${sub ? '' : 'invisible'}`} aria-hidden={!sub}>
        {sub ?? '—'}
      </p>
    </div>
  ) : (
    <>
      {band ? <p className={`text-xs font-semibold mt-1 ${bandClassName}`}>{band}</p> : null}
      {sub ? <p className="text-xs text-muted-foreground mt-1">{sub}</p> : null}
    </>
  );

  const card = (
    <Card
      padding="tight"
      shadow={shadow}
      className={`${href ? 'w-full transition-colors group-hover:border-blue-500/30 group-hover:bg-brand-800/90' : ''} ${heightClass} ${className}`.trim()}
    >
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="min-w-0 flex-1">{label}</span>
        {hintNode}
      </p>
      <p className={valueClass}>{value ?? '—'}</p>
      {footer}
    </Card>
  );

  if (href) {
    return (
      <Link
        to={href}
        className={`group block w-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${linkHeightClass}`.trim()}
      >
        {card}
      </Link>
    );
  }

  return fillHeight ? <div className={linkHeightClass}>{card}</div> : card;
}
