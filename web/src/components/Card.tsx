import type { MouseEventHandler, ReactNode } from 'react';
import DevCopyJsonButton from './DevCopyJsonButton';

type CardProps = {
  children?: ReactNode;
  className?: string;
  padding?: 'default' | 'tight' | 'none';
  shadow?: boolean;
  overflowHidden?: boolean;
  /** Adds hover elevation + pointer affordance (for clickable cards). */
  interactive?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
  /** Dev only: JSON copied when the top-right overlay button is clicked. */
  devData?: unknown;
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
  devData,
}: CardProps) {
  const showDevCopy = import.meta.env.DEV && devData != null;
  const paddingClass = padding === 'none' ? '' : padding === 'tight' ? 'p-4' : 'p-5';
  const shadowClass = shadow ? 'shadow-sm' : '';
  const overflowClass = overflowHidden ? 'overflow-hidden' : '';
  const interactiveClass = interactive ? 'hover-lift cursor-pointer' : '';
  const devClass = showDevCopy ? 'relative group/dev-card' : '';
  return (
    <div
      onClick={onClick}
      className={`bg-brand-800 border border-default rounded-xl ${paddingClass} ${shadowClass} ${overflowClass} ${interactiveClass} ${devClass} ${className}`.trim()}
    >
      {showDevCopy ? <DevCopyJsonButton data={devData} /> : null}
      {children}
    </div>
  );
}
