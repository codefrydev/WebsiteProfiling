'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  LANDING_DECK_AUTO_ADVANCE_INTERVALS_MS,
  type LandingDeckAutoAdvanceMs,
} from '@/components/landing/landingLayout';

const PRESENTER_STORAGE_KEY = 'landing-presenter-mode';

export function clampSlideIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(index, total - 1));
}

export function resolveSlideId(
  sectionIds: readonly string[],
  target: string | number,
): string | null {
  if (sectionIds.length === 0) return null;
  if (typeof target === 'number') {
    const index = clampSlideIndex(target, sectionIds.length);
    return sectionIds[index] ?? null;
  }
  return sectionIds.includes(target) ? target : null;
}

export function nextSlideIndex(activeIndex: number, total: number): number {
  return clampSlideIndex(activeIndex + 1, total);
}

export function prevSlideIndex(activeIndex: number, total: number): number {
  return clampSlideIndex(activeIndex - 1, total);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function readPresenterFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('present') === '1';
}

function readPresenterFromSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(PRESENTER_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistPresenterMode(enabled: boolean): void {
  try {
    if (enabled) {
      sessionStorage.setItem(PRESENTER_STORAGE_KEY, '1');
    } else {
      sessionStorage.removeItem(PRESENTER_STORAGE_KEY);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

function syncHashForSlide(sectionIds: readonly string[], id: string): void {
  if (id !== sectionIds[0]) {
    window.history.pushState(null, '', `#${id}`);
  } else {
    window.history.pushState(null, '', window.location.pathname + window.location.search);
  }
}

export interface UseLandingDeckOptions {
  sectionIds: readonly string[];
}

export interface UseLandingDeckResult {
  activeIndex: number;
  activeId: string | null;
  total: number;
  slideTransition: boolean;
  goToSlide: (target: string | number, behavior?: ScrollBehavior) => void;
  goNext: () => void;
  goPrev: () => void;
  presenterMode: boolean;
  setPresenterMode: (enabled: boolean) => void;
  togglePresenterMode: () => void;
  autoAdvance: boolean;
  setAutoAdvance: (enabled: boolean) => void;
  autoAdvanceMs: LandingDeckAutoAdvanceMs;
  setAutoAdvanceMs: (ms: LandingDeckAutoAdvanceMs) => void;
}

export function useLandingDeck({ sectionIds }: UseLandingDeckOptions): UseLandingDeckResult {
  const total = sectionIds.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideTransition, setSlideTransition] = useState(false);
  const [presenterMode, setPresenterModeState] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [autoAdvanceMs, setAutoAdvanceMs] = useState<LandingDeckAutoAdvanceMs>(
    LANDING_DECK_AUTO_ADVANCE_INTERVALS_MS[0],
  );
  const [reduceMotion, setReduceMotion] = useState(false);
  const activeIndexRef = useRef(0);
  const hashSyncedRef = useRef(false);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const initial = readPresenterFromUrl() || readPresenterFromSession();
    setPresenterModeState(initial);
    if (initial) setAutoAdvance(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (hashSyncedRef.current) return;
    hashSyncedRef.current = true;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) {
      setSlideTransition(!reduceMotion);
      return;
    }
    const id = resolveSlideId(sectionIds, hash);
    if (!id) {
      setSlideTransition(!reduceMotion);
      return;
    }
    const index = sectionIds.indexOf(id);
    if (index >= 0) {
      activeIndexRef.current = index;
      setActiveIndex(index);
    }
    setSlideTransition(!reduceMotion);
  }, [reduceMotion, sectionIds]);

  const setPresenterMode = useCallback((enabled: boolean) => {
    setPresenterModeState(enabled);
    persistPresenterMode(enabled);
    if (!enabled) setAutoAdvance(false);
  }, []);

  const togglePresenterMode = useCallback(() => {
    setPresenterModeState((prev) => {
      const next = !prev;
      persistPresenterMode(next);
      if (!next) setAutoAdvance(false);
      return next;
    });
  }, []);

  const goToSlide = useCallback(
    (target: string | number, behavior: ScrollBehavior = 'smooth') => {
      const id = resolveSlideId(sectionIds, target);
      if (!id) return;

      const index = sectionIds.indexOf(id);
      if (index < 0) return;

      const animate = behavior !== 'auto' && !reduceMotion;
      setSlideTransition(animate);
      setActiveIndex(index);
      activeIndexRef.current = index;
      syncHashForSlide(sectionIds, id);
    },
    [reduceMotion, sectionIds],
  );

  const goNext = useCallback(() => {
    goToSlide(nextSlideIndex(activeIndexRef.current, total));
  }, [goToSlide, total]);

  const goPrev = useCallback(() => {
    goToSlide(prevSlideIndex(activeIndexRef.current, total));
  }, [goToSlide, total]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          event.preventDefault();
          goNext();
          break;
        case ' ':
          event.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          event.preventDefault();
          goPrev();
          break;
        case 'Home':
          event.preventDefault();
          goToSlide(0);
          break;
        case 'End':
          event.preventDefault();
          goToSlide(total - 1);
          break;
        case 'p':
        case 'P':
          event.preventDefault();
          togglePresenterMode();
          break;
        case 'f':
        case 'F':
          if (!presenterMode) return;
          event.preventDefault();
          if (document.fullscreenElement) {
            void document.exitFullscreen();
          } else {
            void document.documentElement.requestFullscreen();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, goToSlide, presenterMode, togglePresenterMode, total]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (!hash) {
        goToSlide(0, 'auto');
        return;
      }
      goToSlide(hash, 'smooth');
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [goToSlide]);

  useEffect(() => {
    if (!presenterMode || !autoAdvance || reduceMotion) return;
    if (activeIndex >= total - 1) return;

    const timer = window.setInterval(() => {
      if (activeIndexRef.current >= total - 1) return;
      goNext();
    }, autoAdvanceMs);

    return () => window.clearInterval(timer);
  }, [activeIndex, autoAdvance, autoAdvanceMs, goNext, presenterMode, reduceMotion, total]);

  const activeId = sectionIds[activeIndex] ?? null;

  return {
    activeIndex,
    activeId,
    total,
    slideTransition,
    goToSlide,
    goNext,
    goPrev,
    presenterMode,
    setPresenterMode,
    togglePresenterMode,
    autoAdvance,
    setAutoAdvance,
    autoAdvanceMs,
    setAutoAdvanceMs,
  };
}
