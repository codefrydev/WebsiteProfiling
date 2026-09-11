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
 * Standard card container adhering to Google Material 3 (M3) Expressive Design:
 * bg-md-sys-surface-container, rounded-2xl (16px), subtle tonal border, and tactile spring motion.
 * Interactive cards feature hover lift and active:scale-[0.99] press feedback.
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
  const paddingClass = padding === 'none' ? '' : padding === 'tight' ? 'p-4' : 'p-6';
  const shadowClass = shadow ? 'shadow-[var(--elevation-1)]' : '';
  const overflowClass = overflowHidden ? 'overflow-hidden' : '';
  const interactiveClass = interactive
    ? 'cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--elevation-2)] active:scale-[0.99]'
    : 'transition-all duration-200';
  const devClass = showDevCopy ? 'relative group/dev-card' : '';
  return (
    <div
      onClick={onClick}
      className={`bg-md-sys-surface-container border border-md-sys-outline-variant/40 rounded-2xl ${paddingClass} ${shadowClass} ${overflowClass} ${interactiveClass} ${devClass} ${className}`.trim()}
    >
      {showDevCopy ? <DevCopyJsonButton data={devData} /> : null}
      {children}
    </div>
  );
}
