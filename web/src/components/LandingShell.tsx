'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import LandingDeckControls from '@/components/landing/LandingDeckControls';
import {
  LandingDeckProvider,
  useLandingDeckRequired,
} from '@/components/landing/LandingDeckContext';
import LandingDeckProgress from '@/components/landing/LandingDeckProgress';
import LandingDeckTrack from '@/components/landing/LandingDeckTrack';
import { LANDING_SECTION_IDS } from '@/components/landing/landingLayout';

export interface LandingShellProps {
  children: ReactNode;
  footer?: ReactNode;
  /** Decorative layers rendered behind the slide track (fixed within viewport). */
  backdrop?: ReactNode;
}

export default function LandingShell({ children, footer, backdrop }: LandingShellProps) {
  return (
    <LandingDeckProvider>
      <LandingShellInner footer={footer} backdrop={backdrop}>
        {children}
      </LandingShellInner>
    </LandingDeckProvider>
  );
}

function LandingShellInner({ children, footer, backdrop }: LandingShellProps) {
  const viewportRef = useRef<HTMLElement>(null);
  const { goToSlide, goNext, goPrev, presenterMode } = useLandingDeckRequired();

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest('a[href^="#"]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const hash = anchor.getAttribute('href');
      if (!hash || hash === '#') return;
      const id = hash.slice(1);
      event.preventDefault();
      goToSlide(id);
    };

    viewport.addEventListener('click', onClick);
    return () => viewport.removeEventListener('click', onClick);
  }, [goToSlide]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (event.deltaY > 0) goNext();
      else goPrev();
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [goNext, goPrev]);

  return (
    <div
      className={`landing-grid-bg flex h-dvh flex-col overflow-hidden bg-brand-900 text-foreground${presenterMode ? ' landing-presenter' : ''}`}
    >
      <main ref={viewportRef} className="landing-deck-viewport relative min-h-0 flex-1 overflow-hidden">
        {backdrop ? (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">{backdrop}</div>
        ) : null}

        <LandingDeckTrack>
          {children}

          {footer ? (
            <footer
              id={LANDING_SECTION_IDS.siteFooter}
              className="landing-deck-slide landing-footer-snap border-t border-muted/40"
            >
              {footer}
            </footer>
          ) : null}
        </LandingDeckTrack>

        <LandingDeckControls />
        <LandingDeckProgress />
      </main>
    </div>
  );
}
