import { Navigate, useParams } from 'react-router-dom';
import ReportShell from '@/ReportShell';
import { pathSlugToViewId } from '@/routes';
import { strings } from '@/lib/strings';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function ReportSlugPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const viewId = pathSlugToViewId(slug);

  const navEntry = viewId ? strings.nav[viewId as keyof typeof strings.nav] : null;
  const label =
    navEntry && typeof navEntry === 'object' && 'label' in navEntry
      ? String(navEntry.label)
      : 'Report';
  usePageTitle(viewId ? `${label} · Site Audit` : 'Not found');

  if (!viewId) {
    return <Navigate to="/404" replace />;
  }

  return <ReportShell slug={slug} />;
}
