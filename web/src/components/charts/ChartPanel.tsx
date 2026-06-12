import type { ReactNode, CSSProperties } from 'react';

export interface ChartPanelProps {
  children: ReactNode;
  heightClass?: string;
  className?: string;
  style?: CSSProperties;
}

/** Clips Chart.js canvases so long axis labels cannot widen the page. */
export function ChartPanel({
  children,
  heightClass = 'h-56',
  className = '',
  style,
}: ChartPanelProps) {
  return (
    <div
      className={`relative min-w-0 w-full overflow-hidden ${heightClass} ${className}`.trim()}
      style={style}
      role="presentation"
    >
      {children}
    </div>
  );
}
