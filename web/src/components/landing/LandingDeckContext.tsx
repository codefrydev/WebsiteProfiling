'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { LANDING_DECK_SECTION_ORDER } from '@/components/landing/landingLayout';
import { useLandingDeck, type UseLandingDeckResult } from '@/hooks/useLandingDeck';

const LandingDeckContext = createContext<UseLandingDeckResult | null>(null);

export interface LandingDeckProviderProps {
  children: ReactNode;
}

export function LandingDeckProvider({ children }: LandingDeckProviderProps) {
  const deck = useLandingDeck({
    sectionIds: LANDING_DECK_SECTION_ORDER,
  });

  return <LandingDeckContext.Provider value={deck}>{children}</LandingDeckContext.Provider>;
}

export function useLandingDeckContext(): UseLandingDeckResult | null {
  return useContext(LandingDeckContext);
}

/** Required inside landing deck UI (progress, controls, scroll cues). */
export function useLandingDeckRequired(): UseLandingDeckResult {
  const ctx = useContext(LandingDeckContext);
  if (!ctx) {
    throw new Error('useLandingDeckRequired must be used within LandingDeckProvider');
  }
  return ctx;
}
