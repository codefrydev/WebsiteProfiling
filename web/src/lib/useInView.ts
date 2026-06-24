
import { useEffect, useRef, useState } from 'react';

export interface UseInViewOptions {
  /** Fraction of the element visible before it counts as in-view. */
  threshold?: number;
  /** Margin around the root (e.g. "0px 0px -10% 0px" to trigger slightly early). */
  rootMargin?: string;
  /** Stop observing after the first time it becomes visible. */
  once?: boolean;
}

/**
 * Lightweight IntersectionObserver hook for scroll-reveal animations.
 * SSR-safe: nothing runs until the effect fires on the client. When
 * IntersectionObserver is unavailable, elements default to visible so
 * content is never hidden.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: UseInViewOptions = {},
): { ref: React.RefObject<T | null>; inView: boolean } {
  const { threshold = 0.12, rootMargin = '0px 0px -8% 0px', once = true } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, inView };
}
