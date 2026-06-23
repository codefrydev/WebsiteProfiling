
import type { ReactNode } from 'react';
import type { SectionKey } from '@/lib/reportSections';
import { isSectionPending } from '@/lib/reportViewSections';
import { useTabSections } from '@/hooks/useTabSections';

export interface SectionLoadingGateProps {
  sections: readonly SectionKey[];
  enabled?: boolean;
  fallback: ReactNode;
  children: ReactNode;
}

/** Renders fallback shimmer until all listed sections are loaded. */
export function SectionLoadingGate({
  sections,
  enabled = true,
  fallback,
  children,
}: SectionLoadingGateProps) {
  const statusMap = useTabSections(sections, enabled);
  if (isSectionPending(sections, statusMap)) return <>{fallback}</>;
  return <>{children}</>;
}

export function isSectionStatusPending(
  status: 'idle' | 'loading' | 'loaded' | 'error' | undefined,
): boolean {
  return status === 'idle' || status === 'loading' || status === 'error';
}
