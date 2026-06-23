
import { useMemo } from 'react';
import { miniNavLinks, type NavItemId } from '@/lib/appNav';
import { useRiskFeatures } from '@/context/RiskFeaturesContext';

/** Returns mini-nav links filtered by the current risk-feature visibility settings. */
export function useFilteredMiniNavLinks(ids: readonly NavItemId[]) {
  const { featureEnabled } = useRiskFeatures();
  return useMemo(
    () => miniNavLinks(ids).filter((link) => featureEnabled(link.id as NavItemId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids, featureEnabled],
  );
}
