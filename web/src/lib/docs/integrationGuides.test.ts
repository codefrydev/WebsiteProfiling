import { describe, expect, it } from 'vitest';
import { strings } from '@/lib/strings';
import {
  anchorToSectionId,
  getGuideBySlug,
  GOOGLE_SECTION_ORDER,
  INTEGRATION_GUIDES,
  sectionIdToAnchor,
} from '@/lib/docs/integrationGuides';

describe('integrationGuides', () => {
  it('returns google guide by slug', () => {
    const guide = getGuideBySlug('google');
    expect(guide?.slug).toBe('google');
    expect(guide?.sectionOrder).toEqual(GOOGLE_SECTION_ORDER);
  });

  it('returns undefined for unknown slug', () => {
    expect(getGuideBySlug('unknown')).toBeUndefined();
  });

  it('maps section ids to URL anchors', () => {
    expect(sectionIdToAnchor('oauthClient')).toBe('oauth-client');
    expect(sectionIdToAnchor('gcpProject')).toBe('gcp-project');
    expect(sectionIdToAnchor('inApp')).toBe('in-app');
  });

  it('resolves anchors back to section ids', () => {
    expect(anchorToSectionId('oauth-client', GOOGLE_SECTION_ORDER)).toBe('oauthClient');
    expect(anchorToSectionId('missing', GOOGLE_SECTION_ORDER)).toBeUndefined();
  });

  it('has strings for every registered guide section', () => {
    const integrations = strings.views.docs.integrations as Record<
      string,
      { sections: Record<string, unknown> }
    >;

    for (const { slug, sectionOrder } of INTEGRATION_GUIDES) {
      const guideStrings = integrations[slug];
      expect(guideStrings, `missing strings for ${slug}`).toBeDefined();
      for (const sectionId of sectionOrder) {
        expect(
          guideStrings.sections[sectionId],
          `missing section ${sectionId} for ${slug}`,
        ).toBeDefined();
      }
    }
  });
});
