
import { useContext } from 'react';
import { PortfolioContext } from './PortfolioContext';
import type { PortfolioContextValue } from './portfolioContextTypes';

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) {
    throw new Error('usePortfolio must be used within PortfolioProvider');
  }
  return ctx;
}

export function useOptionalPortfolio(): PortfolioContextValue | null {
  return useContext(PortfolioContext);
}
