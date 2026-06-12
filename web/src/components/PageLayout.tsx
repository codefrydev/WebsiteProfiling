import type { ReactNode } from 'react';

export type PageLayoutVariant = 'default' | 'dense' | 'fullHeight';

const PADDING: Record<PageLayoutVariant, string> = {
  default:
    'px-[var(--spacing-page-x)] pt-4 pb-6 sm:px-6 lg:px-8 lg:pt-5 lg:pb-8',
  dense:
    'px-[var(--spacing-page-x)] pt-3 pb-4 sm:px-6 lg:px-8 lg:pt-4 lg:pb-6',
  fullHeight:
    'px-[var(--spacing-page-x)] pt-4 pb-4 sm:px-6 lg:px-8 lg:pt-5 lg:pb-4 min-h-[calc(100dvh-4rem)] flex flex-col min-h-0 flex-1',
};

/**
 * Page wrapper with consistent padding. Optional max-width for focused views (e.g. Lighthouse).
 */
export default function PageLayout({
  children,
  className = '',
  maxWidth = false,
  variant = 'default',
}: {
  children?: ReactNode;
  className?: string;
  maxWidth?: boolean;
  variant?: PageLayoutVariant;
}) {
  const maxWidthClass = maxWidth ? 'max-w-6xl mx-auto' : '';
  const fullHeightAttr = variant === 'fullHeight' ? { 'data-full-height': true } : {};
  return (
    <div
      className={`min-w-0 max-w-full w-full ${PADDING[variant]} ${maxWidthClass} ${className}`.trim()}
      {...fullHeightAttr}
    >
      {children}
    </div>
  );
}
