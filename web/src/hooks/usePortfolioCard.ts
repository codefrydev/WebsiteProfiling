
import { useEffect } from 'react';
import { portfolioCardKey } from '@/components/portfolio/portfolioCardUtils';
import { usePortfolio } from '@/context/usePortfolio';
import type { PortfolioLoadStatus } from '@/context/portfolioContextTypes';
import type { PortfolioGroup } from '@/types/report';

export function usePortfolioCard(
  liteGroup: PortfolioGroup,
  fetchEnabled: boolean,
): { group: PortfolioGroup; status: PortfolioLoadStatus; isFullCard: boolean } {
  const { cardByKey, cardStatus, loadCard } = usePortfolio();
  const key = portfolioCardKey(liteGroup);
  const status = cardStatus[key] ?? 'idle';
  const loaded = cardByKey[key];
  const group = loaded ?? liteGroup;
  const isFullCard = Boolean(loaded);

  useEffect(() => {
    if (!fetchEnabled) return;
    if (loaded) return;
    if (status === 'loading' || status === 'loaded') return;
    loadCard(liteGroup);
  }, [fetchEnabled, liteGroup, loaded, status, loadCard]);

  return { group, status, isFullCard };
}
