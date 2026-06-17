'use client';

import type { ReactNode } from 'react';
import { useLandingDeckRequired } from '@/components/landing/LandingDeckContext';

export interface LandingDeckTrackProps {
  children: ReactNode;
}

/** Horizontal slide strip — only one child panel visible in the viewport at a time. */
export default function LandingDeckTrack({ children }: LandingDeckTrackProps) {
  const { activeIndex, slideTransition } = useLandingDeckRequired();

  return (
    <div
      className={`landing-deck-track${slideTransition ? '' : ' landing-deck-track--instant'}`}
      style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
      aria-live="polite"
    >
      {children}
    </div>
  );
}
