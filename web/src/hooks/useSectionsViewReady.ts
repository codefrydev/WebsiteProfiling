'use client';

import { useReport } from '@/context/useReport';
import type { SectionKey } from '@/lib/reportSections';
import { shouldBlockViewForSections } from '@/lib/reportViewSections';

/** True when the view can render (section loaded or cached data already merged). */
export function useSectionsViewReady(sections: readonly SectionKey[]): boolean {
  const { sectionStatus, data } = useReport();
  return !shouldBlockViewForSections(sections, sectionStatus, data);
}
