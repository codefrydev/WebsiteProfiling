'use client';

import { createElement, type ElementType, type ReactNode } from 'react';
import { useInView } from '@/lib/useInView';

interface RevealProps {
  children: ReactNode;
  /** Element to render (default div). Use 'section' to reveal a landing section in place. */
  as?: ElementType;
  className?: string;
  /** Extra delay before the reveal animation, in ms. */
  delayMs?: number;
  /** Any extra props (e.g. id) are forwarded to the rendered element. */
  [key: string]: unknown;
}

/**
 * Wraps content and fades/rises it in once it scrolls into view.
 * Reduced-motion users always see content (the data-reveal CSS lives inside a
 * prefers-reduced-motion: no-preference block).
 */
export default function Reveal({
  children,
  as = 'div',
  className = '',
  delayMs,
  ...rest
}: RevealProps) {
  const { ref, inView } = useInView<HTMLElement>();
  return createElement(
    as,
    {
      ref,
      'data-reveal': inView ? 'shown' : 'hidden',
      className,
      style: delayMs ? { animationDelay: `${delayMs}ms` } : undefined,
      ...rest,
    },
    children,
  );
}
