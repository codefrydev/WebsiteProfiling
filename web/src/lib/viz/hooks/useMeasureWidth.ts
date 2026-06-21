'use client';

import { useState, useEffect, type RefObject } from 'react';

/** Returns the current client width of a container element, updated on resize. */
export function useMeasureWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    setWidth(el.clientWidth);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}
