'use client';

import { useEffect, useState } from 'react';
import IntegrationGuidePanel from '@/components/docs/IntegrationGuidePanel';
import DocsShell from '@/components/docs/DocsShell';
import {
  anchorToSectionId,
  getGuideBySlug,
  type IntegrationGuideSlug,
} from '@/lib/docs/integrationGuides';
import { strings } from '@/lib/strings';

export interface DocsIntegrationGuideProps {
  slug: IntegrationGuideSlug;
}

function getGuideHeader(slug: IntegrationGuideSlug) {
  const integrations = strings.views.docs.integrations as Record<
    string,
    { title: string; subtitle: string }
  >;
  return integrations[slug];
}

export default function DocsIntegrationGuide({ slug }: DocsIntegrationGuideProps) {
  const guide = getGuideBySlug(slug);
  const header = getGuideHeader(slug);
  const [initialSectionId, setInitialSectionId] = useState<string | undefined>();

  useEffect(() => {
    const anchor = window.location.hash.replace(/^#/, '');
    if (!anchor || !guide) return;
    const id = anchorToSectionId(anchor, guide.sectionOrder);
    if (id) setInitialSectionId(id);
  }, [guide]);

  if (!guide || !header) {
    return null;
  }

  return (
    <DocsShell
      activeGuideSlug={slug}
      headerTitle={header.title}
      headerSubtitle={header.subtitle}
    >
      <IntegrationGuidePanel slug={slug} initialSectionId={initialSectionId} />
    </DocsShell>
  );
}
