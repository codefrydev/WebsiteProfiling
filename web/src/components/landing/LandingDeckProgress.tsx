'use client';

import { useLandingDeckRequired } from '@/components/landing/LandingDeckContext';
import { strings } from '@/lib/strings';

export default function LandingDeckProgress() {
  const vl = strings.views.landing;
  const { activeIndex, total } = useLandingDeckRequired();
  const progress = total > 0 ? (activeIndex + 1) / total : 0;

  return (
    <div
      className="landing-deck-progress pointer-events-none absolute inset-x-0 bottom-0 z-20 border-t border-muted/50 bg-brand-900/80 backdrop-blur-sm"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={activeIndex + 1}
      aria-label={vl.deckSlideOf
        .replace('{current}', String(activeIndex + 1))
        .replace('{total}', String(total))}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-1 sm:px-8 lg:px-10 xl:px-12">
        <div className="landing-deck-progress-track min-w-0 flex-1">
          <div
            className="landing-deck-progress-fill"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
        <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground sm:text-xs">
          {activeIndex + 1} / {total}
        </span>
      </div>
    </div>
  );
}
