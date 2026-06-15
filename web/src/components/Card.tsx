import type { MouseEventHandler, ReactNode } from 'react';

type CardProps = {
  children?: ReactNode;
  className?: string;
  padding?: 'default' | 'tight' | 'none';
  shadow?: boolean;
  overflowHidden?: boolean;
  /** Adds hover elevation + pointer affordance (for clickable cards). */
  interactive?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
};

/**
 * Standard card container: bg-brand-800, border, rounded-xl, padding.
 * Use shadow for stat cards, overflowHidden for table wrappers,
 * interactive for clickable cards (hover lift).
 */
export default function Card({
  children,
  className = '',
  padding = 'default',
  shadow = false,
  overflowHidden = false,
  interactive = false,
  onClick,
}: CardProps) {
  const paddingClass = padding === 'none' ? '' : padding === 'tight' ? 'p-4' : 'p-5';
  const shadowClass = shadow ? 'shadow-sm' : '';
  const overflowClass = overflowHidden ? 'overflow-hidden' : '';
  const interactiveClass = interactive ? 'hover-lift cursor-pointer' : '';
  return (
    <div
      onClick={onClick}
      className={`bg-brand-800 border border-default rounded-xl ${paddingClass} ${shadowClass} ${overflowClass} ${interactiveClass} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
