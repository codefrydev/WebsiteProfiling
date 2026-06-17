'use client';

import {
  ChevronLeft,
  ChevronRight,
  MonitorPlay,
  Pause,
  Play,
  X,
} from 'lucide-react';
import { useLandingDeckRequired } from '@/components/landing/LandingDeckContext';
import {
  LANDING_DECK_AUTO_ADVANCE_INTERVALS_MS,
  type LandingDeckAutoAdvanceMs,
} from '@/components/landing/landingLayout';
import { strings } from '@/lib/strings';

export default function LandingDeckControls() {
  const vl = strings.views.landing;
  const {
    activeIndex,
    total,
    goNext,
    goPrev,
    presenterMode,
    setPresenterMode,
    autoAdvance,
    setAutoAdvance,
    autoAdvanceMs,
    setAutoAdvanceMs,
  } = useLandingDeckRequired();

  const atStart = activeIndex <= 0;
  const atEnd = activeIndex >= total - 1;

  return (
    <>
      {!presenterMode ? (
        <div className="landing-deck-edge-nav hidden md:block" aria-hidden={false}>
          <button
            type="button"
            className="landing-deck-edge-btn landing-deck-edge-btn--prev"
            onClick={goPrev}
            disabled={atStart}
            aria-label={vl.deckPrev}
          >
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>
          <button
            type="button"
            className="landing-deck-edge-btn landing-deck-edge-btn--next"
            onClick={goNext}
            disabled={atEnd}
            aria-label={vl.deckNext}
          >
            <ChevronRight className="h-6 w-6" aria-hidden />
          </button>
        </div>
      ) : null}

      {presenterMode ? (
        <div className="landing-deck-controls">
          <div className="landing-deck-controls-inner">
            <button
              type="button"
              className="landing-deck-control-btn"
              onClick={goPrev}
              disabled={atStart}
              aria-label={vl.deckPrev}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{vl.deckPrev}</span>
            </button>

            <button
              type="button"
              className="landing-deck-control-btn"
              onClick={() => setAutoAdvance(!autoAdvance)}
              aria-pressed={autoAdvance}
              aria-label={autoAdvance ? vl.deckAutoAdvanceOff : vl.deckAutoAdvance}
            >
              {autoAdvance ? (
                <Pause className="h-4 w-4" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              <span className="hidden sm:inline">
                {autoAdvance ? vl.deckAutoAdvanceOff : vl.deckAutoAdvance}
              </span>
            </button>

            <select
              className="landing-deck-control-select"
              value={autoAdvanceMs}
              onChange={(e) => setAutoAdvanceMs(Number(e.target.value) as LandingDeckAutoAdvanceMs)}
              aria-label={vl.deckAutoAdvance}
            >
              {LANDING_DECK_AUTO_ADVANCE_INTERVALS_MS.map((ms) => (
                <option key={ms} value={ms}>
                  {ms / 1000}s
                </option>
              ))}
            </select>

            <button
              type="button"
              className="landing-deck-control-btn"
              onClick={goNext}
              disabled={atEnd}
              aria-label={vl.deckNext}
            >
              <span className="hidden sm:inline">{vl.deckNext}</span>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>

            <button
              type="button"
              className="landing-deck-control-btn landing-deck-control-btn--exit"
              onClick={() => setPresenterMode(false)}
              aria-label={vl.deckExitPresent}
            >
              <X className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{vl.deckExitPresent}</span>
            </button>
          </div>
          <p className="landing-deck-shortcuts-hint">{vl.deckShortcutsHint}</p>
        </div>
      ) : null}
    </>
  );
}

export function LandingDeckPresentButton() {
  const vl = strings.views.landing;
  const { setPresenterMode } = useLandingDeckRequired();

  return (
    <button
      type="button"
      onClick={() => setPresenterMode(true)}
      className="hidden items-center gap-1.5 rounded-lg border border-default px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-brand-800 sm:inline-flex sm:text-sm"
      aria-label={vl.deckPresent}
    >
      <MonitorPlay className="h-3.5 w-3.5" aria-hidden />
      {vl.deckPresent}
    </button>
  );
}
