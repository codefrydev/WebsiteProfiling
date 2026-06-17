'use client';

import { useLandingDeckContext } from '@/components/landing/LandingDeckContext';
import { LANDING_DECK_SECTION_ORDER } from '@/components/landing/landingLayout';
import { strings } from '@/lib/strings';

interface LandingScrollCueProps {
  href: string;
  label?: string;
}

export default function LandingScrollCue({
  href,
  label = 'Scroll to next section',
}: LandingScrollCueProps) {
  const vl = strings.views.landing;
  const deck = useLandingDeckContext();
  const nextId = href.startsWith('#') ? href.slice(1) : href;
  const nextIndex = LANDING_DECK_SECTION_ORDER.indexOf(nextId);
  const slideLabel =
    deck && nextIndex >= 0
      ? `${vl.deckNext} · ${nextIndex + 1}/${deck.total}`
      : label;
  const ariaLabel =
    deck && nextIndex >= 0
      ? vl.deckSlideOf
          .replace('{current}', String(nextIndex + 1))
          .replace('{total}', String(deck.total))
      : label;

  return (
    <a
      href={href}
      className={`landing-scroll-cue absolute left-1/2 z-10 -translate-x-1/2 tabular-nums font-medium text-muted-foreground transition-colors hover:text-foreground${deck?.presenterMode ? ' landing-scroll-cue--presenter text-sm' : ' text-xs'}`}
      aria-label={ariaLabel}
    >
      {slideLabel}
    </a>
  );
}
