import type { ReactNode } from 'react';

export type DataViewScrollMode = 'body' | 'none';

export interface DataViewLayoutProps {
  header?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  scrollMode?: DataViewScrollMode;
  /** When true, layout fills remaining viewport height (use with PageLayout fullHeight). */
  fillHeight?: boolean;
  className?: string;
}

/**
 * Full-height data view: fixed header/toolbar, single scroll region in body.
 */
export default function DataViewLayout({
  header,
  toolbar,
  children,
  scrollMode = 'none',
  fillHeight = false,
  className = '',
}: DataViewLayoutProps) {
  const bodyScroll = fillHeight
    ? scrollMode === 'body'
      ? 'flex-1 min-h-0 overflow-y-auto'
      : 'flex-1 min-h-0 overflow-hidden flex flex-col'
    : 'flex flex-col';

  const rootClass = fillHeight
    ? `flex flex-col flex-1 min-h-0 gap-4 ${className}`.trim()
    : `flex flex-col gap-4 ${className}`.trim();

  return (
    <div className={rootClass}>
      {header ? <div className="shrink-0">{header}</div> : null}
      {toolbar ? (
        <div className="shrink-0 sticky top-0 z-10 -mx-1 px-1 py-1 bg-brand-900/95 backdrop-blur-sm">
          {toolbar}
        </div>
      ) : null}
      <div className={bodyScroll}>{children}</div>
    </div>
  );
}
