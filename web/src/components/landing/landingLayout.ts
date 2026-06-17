/** Shared layout classes for full-viewport landing sections (minus measured header). */
export const landingSectionClass = 'landing-section relative';
export const landingSectionBodyClass = 'landing-section-body';
export const landingSectionBodyCenteredClass =
  'landing-section-body landing-section-body-centered';
export const landingSectionSplitClass = 'landing-section-body landing-section-split';
export const landingSplitCopyClass = 'landing-split-copy';
export const landingSplitVisualClass = 'landing-split-visual';
export const landingSplitMockClass = 'landing-split-mock landing-mock-glow landing-float rounded-2xl';
export const landingContentClass = 'w-full min-w-0';
/** Vertical padding only — sections span the full viewport width. */
export const landingSectionPad = 'pb-11 pt-4 sm:pb-12 sm:pt-5';
/** Inner content gutters (not applied on full-bleed split layouts like hero). */
export const landingGutterClass = 'px-5 sm:px-8 lg:px-10 xl:px-12';

/** Anchor ids for scroll cues between landing sections (top to bottom). */
export const LANDING_SECTION_IDS = {
  hero: 'hero',
  stats: 'stats',
  getStarted: 'get-started',
  spotlights: 'spotlights',
  spotlightIssues: 'spotlight-issues',
  useCases: 'use-cases',
  quickStart: 'quick-start',
  googleSetup: 'google-setup',
  features: 'features',
  limitations: 'limitations',
  finalCta: 'final-cta',
  siteFooter: 'site-footer',
} as const;

/** Top-to-bottom slide order for keyboard nav, progress, and auto-advance. */
export const LANDING_DECK_SECTION_ORDER: readonly string[] = [
  LANDING_SECTION_IDS.hero,
  LANDING_SECTION_IDS.stats,
  LANDING_SECTION_IDS.getStarted,
  LANDING_SECTION_IDS.spotlights,
  LANDING_SECTION_IDS.spotlightIssues,
  LANDING_SECTION_IDS.useCases,
  LANDING_SECTION_IDS.quickStart,
  LANDING_SECTION_IDS.googleSetup,
  LANDING_SECTION_IDS.features,
  LANDING_SECTION_IDS.limitations,
  LANDING_SECTION_IDS.finalCta,
  LANDING_SECTION_IDS.siteFooter,
] as const;

export const LANDING_DECK_AUTO_ADVANCE_INTERVALS_MS = [8000, 12000, 15000] as const;
export type LandingDeckAutoAdvanceMs = (typeof LANDING_DECK_AUTO_ADVANCE_INTERVALS_MS)[number];
