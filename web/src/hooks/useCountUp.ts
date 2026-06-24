
import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

/**
 * Animates a number from its previous value up to `target` using an
 * easeOutCubic curve driven by requestAnimationFrame. Returns the target
 * immediately when the user prefers reduced motion.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced || !Number.isFinite(target)) {
      fromRef.current = Number.isFinite(target) ? target : 0;
      setValue(fromRef.current);
      return;
    }
    const from = fromRef.current;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start == null) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, reduced]);

  return reduced || !Number.isFinite(target) ? target : value;
}
