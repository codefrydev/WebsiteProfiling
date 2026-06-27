
import {
  createContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';
import { portfolioCardKey } from '@/components/portfolio/portfolioCardUtils';
import { computePortfolioSummary } from '@/lib/homePortfolio';
import { reportApi, apiFetch, readApiErrorMessage } from '@/lib/publicBase';
import { useReport } from './useReport';
import type {
  PortfolioContextValue,
  PortfolioLoadStatus,
  PortfolioWidgetKey,
} from './portfolioContextTypes';
import type { PortfolioCrawlHistoryPoint } from '@/types/api';
import type { PortfolioGroup } from '@/types/report';
import { portfolioGroupsLoadPlan } from './portfolioLoadPlan';

export const PortfolioContext = createContext<PortfolioContextValue | null>(null);

interface GroupsApiResponse {
  groups?: PortfolioGroup[];
  crawlHistoryByDomain?: Record<string, PortfolioCrawlHistoryPoint[]>;
  error?: string;
}

interface CardApiResponse {
  group?: PortfolioGroup | null;
  error?: string;
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { reportList, crawlRuns, metaLoaded } = useReport();
  const [groups, setGroups] = useState<PortfolioGroup[]>([]);
  const [crawlHistoryByDomain, setCrawlHistoryByDomain] = useState<
    Record<string, PortfolioCrawlHistoryPoint[]>
  >({});
  const [summary, setSummary] = useState<PortfolioContextValue['summary']>(null);
  const [cardByKey, setCardByKey] = useState<Record<string, PortfolioGroup>>({});
  const [widgetStatus, setWidgetStatus] = useState<
    Partial<Record<PortfolioWidgetKey, PortfolioLoadStatus>>
  >({});
  const [cardStatus, setCardStatus] = useState<Partial<Record<string, PortfolioLoadStatus>>>({});

  const groupsInFlightRef = useRef(false);
  const cardInFlightRef = useRef(new Set<string>());
  const cardQueueRef = useRef<PortfolioGroup[]>([]);
  const queuedCardKeysRef = useRef(new Set<string>());
  const cardDrainActiveRef = useRef(false);
  const cardByKeyRef = useRef(cardByKey);
  cardByKeyRef.current = cardByKey;
  const cacheKeyRef = useRef('');
  const groupsLoadedRef = useRef(false);
  const groupsPendingCacheKeyRef = useRef<string | null>(null);

  const reportIdsKey = useMemo(
    () => reportList.map((r) => r.id).join(','),
    [reportList],
  );

  const loadGroups = useCallback(async () => {
    const plan = portfolioGroupsLoadPlan(metaLoaded, reportList.length, crawlRuns.length);
    if (plan === 'wait-meta') {
      return;
    }

    if (plan === 'show-empty') {
      setGroups([]);
      setCrawlHistoryByDomain({});
      setSummary(computePortfolioSummary([]));
      setWidgetStatus({ groups: 'loaded', summary: 'loaded' });
      groupsLoadedRef.current = true;
      cacheKeyRef.current = 'empty';
      return;
    }

    const cacheKey = `${reportIdsKey}:${crawlRuns.length}`;
    if (groupsLoadedRef.current && cacheKeyRef.current === cacheKey) return;
    if (groupsInFlightRef.current) {
      groupsPendingCacheKeyRef.current = cacheKey;
      return;
    }

    groupsInFlightRef.current = true;
    cacheKeyRef.current = cacheKey;
    groupsPendingCacheKeyRef.current = null;
    setWidgetStatus((prev) => ({ ...prev, groups: 'loading', summary: 'loading' }));

    try {
      const res = await apiFetch(reportApi('/portfolio?widget=groups'));
      const body = (await res.json().catch(() => ({}))) as GroupsApiResponse;
      if (!res.ok) throw new Error(readApiErrorMessage(body as Record<string, unknown>, res));

      if (cacheKeyRef.current !== cacheKey) {
        return;
      }

      const nextGroups = Array.isArray(body.groups) ? body.groups : [];
      const crawlHistory =
        body.crawlHistoryByDomain && typeof body.crawlHistoryByDomain === 'object'
          ? body.crawlHistoryByDomain
          : {};

      setGroups(nextGroups);
      setCrawlHistoryByDomain(crawlHistory);
      setSummary(computePortfolioSummary(nextGroups));
      setWidgetStatus({ groups: 'loaded', summary: 'loaded' });
      groupsLoadedRef.current = true;
    } catch {
      if (cacheKeyRef.current !== cacheKey) {
        return;
      }
      setGroups([]);
      setCrawlHistoryByDomain({});
      setSummary(computePortfolioSummary([]));
      setWidgetStatus({ groups: 'error', summary: 'error' });
      groupsLoadedRef.current = false;
      cacheKeyRef.current = '';
    } finally {
      groupsInFlightRef.current = false;
      const pending = groupsPendingCacheKeyRef.current;
      if (pending && pending !== cacheKeyRef.current) {
        groupsPendingCacheKeyRef.current = null;
        void loadGroups();
      }
    }
  }, [metaLoaded, reportList, crawlRuns.length, reportIdsKey]);

  useEffect(() => {
    void loadGroups();
  }, [metaLoaded, reportIdsKey, crawlRuns.length, loadGroups]);

  const fetchCardData = useCallback(async (group: PortfolioGroup, key: string) => {
    const params = new URLSearchParams({ widget: 'card' });
    if (group.reportId != null) {
      params.set('reportId', String(group.reportId));
    } else if (group.crawlRunId != null) {
      params.set('crawlRunId', String(group.crawlRunId));
    } else {
      throw new Error('Missing report or crawl id');
    }

    const res = await apiFetch(reportApi(`/portfolio?${params.toString()}`));
    const body = (await res.json().catch(() => ({}))) as CardApiResponse;
    if (!res.ok) throw new Error(readApiErrorMessage(body as Record<string, unknown>, res));
    if (body.group) {
      setCardByKey((prev) => ({ ...prev, [key]: body.group! }));
    }
    setCardStatus((prev) => ({ ...prev, [key]: 'loaded' }));
  }, []);

  const drainCardQueue = useCallback(async () => {
    if (cardDrainActiveRef.current) return;
    cardDrainActiveRef.current = true;
    try {
      while (cardQueueRef.current.length > 0) {
        const group = cardQueueRef.current.shift()!;
        const key = portfolioCardKey(group);
        if (cardByKeyRef.current[key]) {
          queuedCardKeysRef.current.delete(key);
          continue;
        }
        cardInFlightRef.current.add(key);
        try {
          await fetchCardData(group, key);
        } catch {
          setCardStatus((prev) => ({ ...prev, [key]: 'error' }));
        } finally {
          cardInFlightRef.current.delete(key);
          queuedCardKeysRef.current.delete(key);
        }
      }
    } finally {
      cardDrainActiveRef.current = false;
    }
  }, [fetchCardData]);

  const loadCard = useCallback(
    (group: PortfolioGroup) => {
      const key = portfolioCardKey(group);
      if (cardByKeyRef.current[key]) return;
      if (queuedCardKeysRef.current.has(key) || cardInFlightRef.current.has(key)) return;

      queuedCardKeysRef.current.add(key);
      cardQueueRef.current.push(group);
      setCardStatus((prev) => ({ ...prev, [key]: 'loading' }));
      void drainCardQueue();
    },
    [drainCardQueue],
  );

  const refreshPortfolio = useCallback(async () => {
    cacheKeyRef.current = '';
    groupsLoadedRef.current = false;
    cardQueueRef.current = [];
    queuedCardKeysRef.current = new Set();
    setCardByKey({});
    setCardStatus({});
    setWidgetStatus({});
    await loadGroups();
  }, [loadGroups]);

  const value = useMemo<PortfolioContextValue>(
    () => ({
      groups,
      crawlHistoryByDomain,
      summary,
      cardByKey,
      widgetStatus,
      cardStatus,
      loadGroups,
      loadCard,
      refreshPortfolio,
    }),
    [
      groups,
      crawlHistoryByDomain,
      summary,
      cardByKey,
      widgetStatus,
      cardStatus,
      loadGroups,
      loadCard,
      refreshPortfolio,
    ],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}
