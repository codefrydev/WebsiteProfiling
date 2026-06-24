
import { pathSlugToViewId } from '@/routes';
import { useViewSections } from '@/hooks/useViewSections';

/** Triggers on-demand section fetches for the active report route. */
export default function ViewSectionLoader({ slug }: { slug: string }): null {
  const viewId = pathSlugToViewId(slug);
  useViewSections(viewId, viewId != null && viewId !== 'home');
  return null;
}
