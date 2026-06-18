'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import LandingDeckControls from '@/components/landing/LandingDeckControls';
import {
  LandingDeckProvider,
  useLandingDeckRequired,
} from '@/components/landing/LandingDeckContext';
import LandingDeckProgress from '@/components/landing/LandingDeckProgress';
import LandingDeckTrack from '@/components/landing/LandingDeckTrack';
import LandingHeroTopBar from '@/components/landing/LandingHeroTopBar';
import { LANDING_SECTION_IDS } from '@/components/landing/landingLayout';
import { useStageScale } from '@/hooks/useStageScale';

export interface LandingShellProps {
  children: ReactNode;
  footer?: ReactNode;
  /** Decorative layers rendered behind the slide stage (fills the full viewport). */
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
  const outerRef = useRef<HTMLDivElement>(null);
  const stageFrameRef = useRef<HTMLDivElement>(null);
  const { goToSlide, goNext, goPrev, presenterMode } = useLandingDeckRequired();

  useStageScale(stageFrameRef);

  // Anchor links live in the fixed header (outside the stage), so delegate from
  // the outer container rather than the slide viewport.
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest('a[href^="#"]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const hash = anchor.getAttribute('href');
      if (!hash || hash === '#') return;
      const id = hash.slice(1);
      event.preventDefault();
      goToSlide(id);
    };

    outer.addEventListener('click', onClick);
    return () => outer.removeEventListener('click', onClick);
  }, [goToSlide]);

  // Wheel paging over the whole slide region (the scaled stage plus its letterbox).
  useEffect(() => {
    const frame = stageFrameRef.current;
    if (!frame) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (event.deltaY > 0) goNext();
      else goPrev();
    };

    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [goNext, goPrev]);

  return (
    <div
      ref={outerRef}
      className={`landing-grid-bg relative isolate flex h-dvh flex-col overflow-hidden bg-brand-900 text-foreground${presenterMode ? ' landing-presenter' : ''}`}
    >
      {backdrop ? (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">{backdrop}</div>
      ) : null}

      <LandingHeroTopBar />

      <div ref={stageFrameRef} className="landing-stage-frame">
        <div className="landing-stage">
          <main className="landing-deck-viewport relative overflow-hidden">
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
          </main>
        </div>

        <LandingDeckControls />
      </div>

      <LandingDeckProgress />
    </div>
  );
}
