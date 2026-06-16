'use client';

import { VIEW_SECTIONS } from '@/lib/reportViewSections';
import type { ViewId } from '@/routes';
import { useTabSections } from './useTabSections';

/** Trigger parallel section loads for the active report view. */
export function useViewSections(viewId: ViewId | null, enabled = true): void {
  const sections = viewId != null ? VIEW_SECTIONS[viewId] ?? [] : [];
  useTabSections(sections, enabled && viewId != null && viewId !== 'home');
}
