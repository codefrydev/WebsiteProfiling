
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLandingDeckRequired } from '@/components/landing/LandingDeckContext';
import { strings } from '@/lib/strings';

export default function LandingDeckControls() {
  const vl = strings.views.landing;
  const { activeIndex, total, goNext, goPrev } = useLandingDeckRequired();

  const atStart = activeIndex <= 0;
  const atEnd = activeIndex >= total - 1;

  return (
    <div className="landing-deck-edge-nav hidden md:block" aria-hidden={false}>
      <button
        type="button"
        className="landing-deck-edge-btn landing-deck-edge-btn--prev"
        onClick={goPrev}
        disabled={atStart}
        aria-label={vl.deckPrev}
      >
        <ChevronLeft className="h-6 w-6" aria-hidden />
      </button>
      <button
        type="button"
        className="landing-deck-edge-btn landing-deck-edge-btn--next"
        onClick={goNext}
        disabled={atEnd}
        aria-label={vl.deckNext}
      >
        <ChevronRight className="h-6 w-6" aria-hidden />
      </button>
    </div>
  );
}
