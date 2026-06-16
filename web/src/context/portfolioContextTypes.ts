import type { PortfolioCrawlHistoryPoint } from '@/types/api';
import type { PortfolioGroup } from '@/types/report';
import type { PortfolioSummary } from '@/lib/homePortfolio';

export type PortfolioWidgetKey = 'groups' | 'summary';

export type PortfolioLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface PortfolioContextValue {
  groups: PortfolioGroup[];
  crawlHistoryByDomain: Record<string, PortfolioCrawlHistoryPoint[]>;
  summary: PortfolioSummary | null;
  cardByKey: Record<string, PortfolioGroup>;
  widgetStatus: Partial<Record<PortfolioWidgetKey, PortfolioLoadStatus>>;
  cardStatus: Partial<Record<string, PortfolioLoadStatus>>;
  loadGroups: () => Promise<void>;
  loadCard: (group: PortfolioGroup) => void;
  refreshPortfolio: () => Promise<void>;
}
