'use client';

import { useLayoutEffect, type RefObject } from 'react';

/** Design canvas dimensions — the deck is authored once at this 16:9 size. */
export const LANDING_STAGE_WIDTH = 1280;
export const LANDING_STAGE_HEIGHT = 720;

/**
 * Scales the fixed 1280×720 slide canvas to fit its container like a slide deck:
 * `scale = min(frameW / 1280, frameH / 720)` (contain, no cap). The factor is
 * written to the `--landing-scale` custom property on the observed frame element,
 * which the stage consumes via `transform: scale(var(--landing-scale))`.
 *
 * Uses `useLayoutEffect` so the first measurement lands before paint (no flash),
 * and listens to `visualViewport` so the mobile URL-bar show/hide re-fits the stage.
 */
export function useStageScale(frameRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let raf = 0;

    const compute = () => {
      const w = frame.clientWidth;
      const h = frame.clientHeight;
      if (w === 0 || h === 0) return;
      const scale = Math.min(w / LANDING_STAGE_WIDTH, h / LANDING_STAGE_HEIGHT);
      frame.style.setProperty('--landing-scale', String(scale));
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    compute();

    const ro = new ResizeObserver(schedule);
    ro.observe(frame);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.visualViewport?.addEventListener('resize', schedule);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [frameRef]);
}
