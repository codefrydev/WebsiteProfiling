'use client';

import { useEffect } from 'react';
import { useReport } from '../context/useReport';
import type { SectionKey } from '@/lib/reportSections';

/**
 * Triggers a section fetch on mount (if not already loaded) and returns its status.
 * The section's data merges into the shared `data` object in ReportContext.
 */
export function useSectionData(
  section: SectionKey,
  enabled = true,
): 'idle' | 'loading' | 'loaded' | 'error' {
  const { sectionStatus, loadSection, selectedReportId, data } = useReport();

  useEffect(() => {
    if (!enabled || data === null) return;
    const status = sectionStatus[section];
    if (status === 'loaded' || status === 'loading') return;
    void loadSection(section, selectedReportId ?? null);
  }, [section, enabled, sectionStatus, loadSection, selectedReportId, data]);

  return sectionStatus[section] ?? 'idle';
}
