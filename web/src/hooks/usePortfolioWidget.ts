'use client';

import { useEffect } from 'react';
import { usePortfolio } from '@/context/usePortfolio';
import { useReport } from '@/context/useReport';
import type { PortfolioLoadStatus, PortfolioWidgetKey } from '@/context/portfolioContextTypes';

function usePortfolioWidget(widget: PortfolioWidgetKey): PortfolioLoadStatus {
  const { widgetStatus, loadGroups } = usePortfolio();
  const { metaLoaded } = useReport();

  useEffect(() => {
    if (!metaLoaded) return;
    const status = widgetStatus[widget];
    if (status === 'loaded' || status === 'loading') return;
    void loadGroups();
  }, [widget, widgetStatus, loadGroups, metaLoaded]);

  if (!metaLoaded) {
    return widgetStatus[widget] === 'error' ? 'error' : 'idle';
  }

  return widgetStatus[widget] ?? 'idle';
}

export function usePortfolioGroups(): PortfolioLoadStatus {
  return usePortfolioWidget('groups');
}

export function usePortfolioSummary(): PortfolioLoadStatus {
  return usePortfolioWidget('summary');
}
