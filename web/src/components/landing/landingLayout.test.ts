import { describe, expect, it } from 'vitest';
import {
  LANDING_DECK_SECTION_ORDER,
  LANDING_SECTION_IDS,
} from '@/components/landing/landingLayout';

describe('landingLayout deck order', () => {
  it('includes all spotlight section ids', () => {
    expect(LANDING_DECK_SECTION_ORDER).toContain(LANDING_SECTION_IDS.spotlightGoogle);
    expect(LANDING_DECK_SECTION_ORDER).toContain(LANDING_SECTION_IDS.spotlightPromptGenerator);
    expect(LANDING_DECK_SECTION_ORDER).toContain(LANDING_SECTION_IDS.spotlightContentStudio);
    expect(LANDING_DECK_SECTION_ORDER).toContain(LANDING_SECTION_IDS.spotlightAiChat);
    expect(LANDING_DECK_SECTION_ORDER).toContain(LANDING_SECTION_IDS.spotlightCompareExport);
  });

  it('does not include removed google-setup slide', () => {
    expect(LANDING_DECK_SECTION_ORDER).not.toContain('google-setup');
  });

  it('orders setup before product spotlights', () => {
    const quickStart = LANDING_DECK_SECTION_ORDER.indexOf(LANDING_SECTION_IDS.quickStart);
    const crawl = LANDING_DECK_SECTION_ORDER.indexOf(LANDING_SECTION_IDS.spotlights);
    const google = LANDING_DECK_SECTION_ORDER.indexOf(LANDING_SECTION_IDS.spotlightGoogle);
    expect(quickStart).toBeGreaterThan(-1);
    expect(crawl).toBeGreaterThan(quickStart);
    expect(google).toBeGreaterThan(crawl);
  });

  it('has 16 slides including footer', () => {
    expect(LANDING_DECK_SECTION_ORDER).toHaveLength(16);
  });
});
