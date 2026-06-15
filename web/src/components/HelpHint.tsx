'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';
import { metricHelpHint } from '@/lib/metricHelp';

const VIEWPORT_PAD = 8;
const GAP = 8;
const TOOLTIP_Z = 9999;

export interface HelpHintProps {
  title?: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
  /** Accessible label for the trigger button. Defaults to "More information". */
  ariaLabel?: string;
}

type TooltipCoords = { top: number; left: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function HelpHint({
  title,
  children,
  side = 'top',
  className = '',
  ariaLabel = 'More information',
}: HelpHintProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords | null>(null);
  const [mounted, setMounted] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setCoords(null);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = buttonRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxLeft = vw - tooltipRect.width - VIEWPORT_PAD;
    const maxTop = vh - tooltipRect.height - VIEWPORT_PAD;

    let top =
      side === 'top'
        ? triggerRect.top - tooltipRect.height - GAP
        : triggerRect.bottom + GAP;

    // Flip vertically when clipped
    if (top < VIEWPORT_PAD) {
      top = triggerRect.bottom + GAP;
    }
    if (top > maxTop) {
      top = triggerRect.top - tooltipRect.height - GAP;
    }
    top = clamp(top, VIEWPORT_PAD, Math.max(VIEWPORT_PAD, maxTop));

    // Prefer centered on trigger, then clamp to viewport
    let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    left = clamp(left, VIEWPORT_PAD, Math.max(VIEWPORT_PAD, maxLeft));

    // Near right edge: align tooltip's right edge to trigger (keeps content readable)
    if (triggerRect.right > vw - VIEWPORT_PAD - 48) {
      left = triggerRect.right - tooltipRect.width;
      left = clamp(left, VIEWPORT_PAD, Math.max(VIEWPORT_PAD, maxLeft));
    }

    // Near left edge: align tooltip's left edge to trigger
    if (triggerRect.left < VIEWPORT_PAD + 48) {
      left = triggerRect.left;
      left = clamp(left, VIEWPORT_PAD, Math.max(VIEWPORT_PAD, maxLeft));
    }

    setCoords({ top, left });
  }, [side]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(raf);
  }, [open, updatePosition, title, children]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onReposition = () => updatePosition();
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, close, updatePosition]);

  const tooltipStyle: CSSProperties = coords
    ? { position: 'fixed', top: coords.top, left: coords.left, zIndex: TOOLTIP_Z }
    : { position: 'fixed', top: -9999, left: -9999, zIndex: TOOLTIP_Z, visibility: 'hidden' as const };

  const tooltip = open ? (
    <div
      id={id}
      ref={tooltipRef}
      role="tooltip"
      style={tooltipStyle}
      className="w-72 max-w-[min(18rem,calc(100vw-1rem))] bg-brand-800 border border-default rounded-xl shadow-2xl p-3 pointer-events-none normal-case tracking-normal font-normal text-left"
    >
      {title ? <div className="font-semibold text-bright text-sm mb-1">{title}</div> : null}
      <div className="text-xs text-muted-foreground leading-relaxed">{children}</div>
    </div>
  ) : null;

  const toggleOpen = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  return (
    <span ref={rootRef} className={`relative inline-flex items-center ${className}`.trim()}>
      <span
        ref={buttonRef}
        role="button"
        tabIndex={0}
        className="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 align-middle cursor-pointer"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          toggleOpen();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            toggleOpen();
          }
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={(e) => {
          if (!rootRef.current?.contains(e.relatedTarget as Node)) close();
        }}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
      </span>
      {mounted && tooltip ? createPortal(tooltip, document.body) : null}
    </span>
  );
}

export type HelpHintContent = string | { title?: string; body: string };

/** Normalize hint prop from string or structured object. */
export function normalizeHintContent(hint: HelpHintContent | undefined): {
  title?: string;
  body: string;
} | undefined {
  if (hint == null) return undefined;
  if (typeof hint === 'string') return { body: hint };
  return { title: hint.title, body: hint.body };
}

/** Chart/card title with ? hint (replaces title + paragraph hint pattern). */
export function ChartTitleWithHint({
  title,
  helpKey,
  hint,
  as = 'h3',
  className = '',
}: {
  title: string;
  helpKey?: string;
  hint?: HelpHintContent;
  as?: 'h2' | 'h3';
  className?: string;
}) {
  const hintContent = normalizeHintContent(hint ?? (helpKey ? metricHelpHint(helpKey) : undefined));
  const Tag = as;
  return (
    <div className={`flex items-start gap-1.5 mb-3 ${className}`.trim()}>
      <Tag className="text-sm font-bold text-foreground min-w-0">{title}</Tag>
      {hintContent ? (
        <HelpHint title={hintContent.title} ariaLabel={`About ${title}`}>
          {hintContent.body}
        </HelpHint>
      ) : null}
    </div>
  );
}

/** Label text plus ? from metricHelp dot path (e.g. `shared.clicks`). */
export function LabelWithHint({
  label,
  helpKey,
  className = '',
}: {
  label: ReactNode;
  helpKey: string;
  className?: string;
}) {
  const hintContent = normalizeHintContent(metricHelpHint(helpKey));
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
      {label}
      {hintContent ? (
        <HelpHint title={hintContent.title} ariaLabel={`About ${typeof label === 'string' ? label : 'metric'}`}>
          {hintContent.body}
        </HelpHint>
      ) : null}
    </span>
  );
}
