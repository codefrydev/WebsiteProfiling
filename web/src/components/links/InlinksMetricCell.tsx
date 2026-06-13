import { Link2 } from 'lucide-react';
import { inlinksBarWidthPct, inlinksTextClass } from '../../utils/linkUtils';

export interface InlinksMetricCellProps {
  count: number;
  maxInSection: number;
  /** Hide relative bar on narrow layouts */
  showBar?: boolean;
  showIcon?: boolean;
}

export default function InlinksMetricCell({
  count,
  maxInSection,
  showBar = true,
  showIcon = true,
}: InlinksMetricCellProps) {
  const inl = Math.max(0, Number(count) || 0);
  const pct = inlinksBarWidthPct(inl, maxInSection);

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
      {showBar ? (
        <div className="order-2 sm:order-1 min-w-0 flex-1 max-w-[5rem] bg-track rounded-full h-1.5 hidden sm:block overflow-hidden">
          <div
            className="h-full rounded-full bg-sky-600/90 dark:bg-sky-500/90 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <span
        className={`order-1 sm:order-2 shrink-0 inline-flex items-center justify-end gap-1.5 text-sm tabular-nums ${inlinksTextClass(inl, maxInSection)}`}
      >
        {showIcon ? <Link2 className="h-3.5 w-3.5 shrink-0 opacity-70 hidden sm:inline" aria-hidden /> : null}
        {inl.toLocaleString()}
      </span>
    </div>
  );
}
