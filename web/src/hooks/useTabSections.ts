
import { useEffect, useMemo } from 'react';
import { useReport } from '@/context/useReport';
import type { SectionKey } from '@/lib/reportSections';
import type { SectionLoadStatus } from '@/lib/reportViewSections';

/**
 * Parallel-fetch multiple report sections when enabled.
 * Returns per-section status from ReportContext.
 */
export function useTabSections(
  sections: readonly SectionKey[],
  enabled: boolean,
): Partial<Record<SectionKey, SectionLoadStatus>> {
  const { sectionStatus, loadSection, selectedReportId, data } = useReport();
  const sectionKey = sections.join('\0');

  useEffect(() => {
    if (!enabled || data === null) return;
    for (const section of sections) {
      const status = sectionStatus[section];
      if (status === 'loaded' || status === 'loading') continue;
      void loadSection(section, selectedReportId ?? null);
    }
  }, [enabled, sectionKey, sections, sectionStatus, loadSection, selectedReportId, data]);

  return useMemo(() => {
    const out: Partial<Record<SectionKey, SectionLoadStatus>> = {};
    for (const section of sections) {
      out[section] = sectionStatus[section] ?? 'idle';
    }
    return out;
  }, [sections, sectionStatus]);
}
