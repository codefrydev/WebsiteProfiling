import { Navigate, useParams } from 'react-router-dom';
import { isIntegrationGuideSlug } from '@/lib/docs/integrationGuides';
import DocsIntegrationGuide from '@/views/DocsIntegrationGuide';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function DocsIntegrationRoutePage() {
  const { slug = '' } = useParams<{ slug: string }>();
  usePageTitle('Integration guide · Site Audit');

  if (!isIntegrationGuideSlug(slug)) {
    return <Navigate to="/404" replace />;
  }

  return <DocsIntegrationGuide slug={slug} />;
}
