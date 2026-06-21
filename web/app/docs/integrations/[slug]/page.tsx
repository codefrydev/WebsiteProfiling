import { notFound } from 'next/navigation';
import { isIntegrationGuideSlug } from '@/lib/docs/integrationGuides';
import DocsIntegrationGuide from '@/views/DocsIntegrationGuide';

export const dynamic = 'force-dynamic';

export default async function DocsIntegrationRoutePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isIntegrationGuideSlug(slug)) {
    notFound();
  }
  return <DocsIntegrationGuide slug={slug} />;
}
