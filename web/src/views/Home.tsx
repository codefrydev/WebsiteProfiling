import {
  MessageSquare,
  Plus,
  Search,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { PageLayout, Button } from '../components';
import PortfolioGroupList from '@/components/portfolio/home/PortfolioGroupList';
import PortfolioResumeSection from '@/components/portfolio/home/PortfolioResumeSection';
import PortfolioStatsRow from '@/components/portfolio/home/PortfolioStatsRow';
import { portfolioCardKey } from '@/components/portfolio/portfolioCardUtils';
import { usePortfolio } from '@/context/usePortfolio';
import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { apiUrl, apiFetch } from '../lib/publicBase';
import { getDefaultLandingView } from '@/lib/defaultViewPref';
import type { PortfolioGroup, ViewProps } from '@/types';

export default function Home({ onNavigate }: ViewProps) {
  const { loadCrawlPreview, refreshReports } = useReport();
  const { refreshPortfolio } = usePortfolio();
  const vh = strings.views.home;
  const [filterQuery, setFilterQuery] = useState('');
  const [greeting, setGreeting] = useState(vh.greetingMorning);
  const [openingCrawlId, setOpeningCrawlId] = useState<number | null>(null);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? vh.greetingMorning : h < 18 ? vh.greetingAfternoon : vh.greetingEvening);
  }, [vh.greetingMorning, vh.greetingAfternoon, vh.greetingEvening]);

  const toggleGroupCollapsed = useCallback((rootDomain: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(rootDomain)) next.delete(rootDomain);
      else next.add(rootDomain);
      return next;
    });
  }, []);

  const openSite = useCallback(async (group: PortfolioGroup) => {
    if (group.crawlOnly && group.crawlRunId != null) {
      setOpeningCrawlId(group.crawlRunId);
      const ok = await loadCrawlPreview(group.crawlRunId);
      setOpeningCrawlId(null);
      if (ok) {
        onNavigate?.('links', { domain: group.domainParam });
      }
      return;
    }
    onNavigate?.(getDefaultLandingView(), {
      domain: group.domainParam,
      reportId: group.reportId ?? undefined,
    });
  }, [loadCrawlPreview, onNavigate]);

  const handleDeletePortfolioItem = useCallback(
    async (group: PortfolioGroup) => {
      const key = portfolioCardKey(group);
      setDeletingKey(key);
      setDeleteError(null);
      try {
        const res = await apiFetch(apiUrl('/portfolio/delete'), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId: group.reportId,
            crawlRunId: group.crawlRunId ?? null,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setDeleteError(data.error || vh.deleteFailed);
          return;
        }
        setPendingDeleteKey(null);
        await Promise.all([refreshPortfolio(), refreshReports()]);
      } catch {
        setDeleteError(vh.deleteFailed);
      } finally {
        setDeletingKey(null);
      }
    },
    [refreshPortfolio, refreshReports, vh.deleteFailed],
  );

  return (
    <PageLayout className="pt-2 sm:pt-3 relative overflow-hidden">
      <div aria-hidden className="aurora-bg" />

      <header className="animate-in flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-warm">
            {greeting}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-bright sm:text-3xl">
            {vh.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{vh.greetingTagline}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link to="/chat">
            <Button variant="secondary">
              <MessageSquare className="h-4 w-4" aria-hidden />
              {vh.quickActionChatLabel}
            </Button>
          </Link>
          <Link to="/pipeline">
            <Button variant="primary">
              <Plus className="h-4 w-4" aria-hidden />
              {vh.quickActionRunLabel}
            </Button>
          </Link>
        </div>
      </header>

      <div className="mt-5 relative max-w-xl">
        <Search className="h-4 w-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder={vh.searchPlaceholder}
          className="w-full rounded-full border border-default bg-brand-900/40 px-10 py-2.5 text-sm text-foreground outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <PortfolioStatsRow />

      {deleteError ? (
        <p className="mt-3 text-center text-sm text-red-700 dark:text-red-400" role="alert">
          {deleteError}
        </p>
      ) : null}

      <PortfolioResumeSection
        filterQuery={filterQuery}
        onOpen={(group) => { void openSite(group); }}
        openingCrawlId={openingCrawlId}
      />

      <PortfolioGroupList
        filterQuery={filterQuery}
        collapsedGroups={collapsedGroups}
        pendingDeleteKey={pendingDeleteKey}
        deletingKey={deletingKey}
        openingCrawlId={openingCrawlId}
        onToggleCollapsed={toggleGroupCollapsed}
        onOpen={(group) => { void openSite(group); }}
        onDeleteToggle={(cardKey) => {
          setDeleteError(null);
          setPendingDeleteKey(pendingDeleteKey === cardKey ? null : cardKey);
        }}
        onDeleteCancel={() => setPendingDeleteKey(null)}
        onDeleteConfirm={(group) => { void handleDeletePortfolioItem(group); }}
      />
    </PageLayout>
  );
}
