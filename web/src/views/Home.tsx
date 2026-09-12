import {
  ArrowUpDown,
  Filter,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback, useMemo } from 'react';
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

type StatusFilterKey = 'all' | 'attention' | 'healthy' | 'crawl_only';
type SortKey = 'recent' | 'health_desc' | 'health_asc' | 'urls' | 'name';

export default function Home({ onNavigate }: ViewProps) {
  const { loadCrawlPreview, refreshReports } = useReport();
  const { refreshPortfolio, groups } = usePortfolio();
  const vh = strings.views.home;
  const [filterQuery, setFilterQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');
  const [sortBy, setSortBy] = useState<SortKey>('recent');
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

  const counts = useMemo(() => {
    const attention = groups.filter((g) => g.healthScore < 70 || (g.issueCounts?.critical || 0) > 0).length;
    const healthy = groups.filter((g) => g.healthScore >= 75 && !g.crawlOnly).length;
    const crawlOnly = groups.filter((g) => g.crawlOnly).length;
    return { all: groups.length, attention, healthy, crawlOnly };
  }, [groups]);

  const handleClearFilters = useCallback(() => {
    setFilterQuery('');
    setStatusFilter('all');
    setSortBy('recent');
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
    <PageLayout className="pt-3 sm:pt-4 relative overflow-hidden pb-16">
      <div aria-hidden className="aurora-bg opacity-75" />

      {/* Hero Command Center Header */}
      <header className="animate-in flex flex-col gap-5 pt-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-md-sys-primary/25 bg-md-sys-primary-container/20 px-3 py-1 text-xs font-semibold text-md-sys-primary shadow-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-md-sys-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-md-sys-success" />
            </span>
            <span>{greeting} · Site Intelligence</span>
          </div>

          <h1 className="mt-2.5 text-2xl font-black tracking-tight text-md-sys-on-surface sm:text-3xl lg:text-4xl">
            {vh.title}
          </h1>
          <p className="mt-1 text-sm text-md-sys-on-surface-variant max-w-2xl leading-relaxed">
            {vh.greetingTagline}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <Link to="/chat">
            <Button variant="secondary" className="shadow-xs">
              <MessageSquare className="h-4 w-4" aria-hidden />
              {vh.quickActionChatLabel}
            </Button>
          </Link>
          <Link to="/pipeline">
            <Button variant="primary" className="shadow-xs">
              <Plus className="h-4 w-4" aria-hidden />
              {vh.quickActionRunLabel}
            </Button>
          </Link>
        </div>
      </header>

      {/* KPI Stats Overview */}
      <PortfolioStatsRow />

      {/* Integrated Command Toolbar */}
      <div className="mt-8 rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container p-3 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="h-4 w-4 text-md-sys-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={vh.searchPlaceholder}
              className="w-full rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low pl-10 pr-9 py-2 text-sm text-md-sys-on-surface placeholder:text-md-sys-on-surface-variant outline-none transition-all focus:border-md-sys-primary focus:ring-2 focus:ring-md-sys-primary/20"
            />
            {filterQuery ? (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-md-sys-on-surface-variant hover:text-md-sys-on-surface transition-colors"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`press rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                statusFilter === 'all'
                  ? 'bg-md-sys-primary text-md-sys-on-primary shadow-xs'
                  : 'bg-md-sys-surface-container-high text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:bg-md-sys-surface-container-highest'
              }`}
            >
              All Sites ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('attention')}
              className={`press rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                statusFilter === 'attention'
                  ? 'bg-md-sys-error text-md-sys-on-error shadow-xs'
                  : 'bg-md-sys-surface-container-high text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:bg-md-sys-surface-container-highest'
              }`}
            >
              Needs Attention ({counts.attention})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('healthy')}
              className={`press rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                statusFilter === 'healthy'
                  ? 'bg-md-sys-success text-md-sys-on-success shadow-xs'
                  : 'bg-md-sys-surface-container-high text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:bg-md-sys-surface-container-highest'
              }`}
            >
              Healthy ({counts.healthy})
            </button>
            {counts.crawlOnly > 0 ? (
              <button
                type="button"
                onClick={() => setStatusFilter('crawl_only')}
                className={`press rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  statusFilter === 'crawl_only'
                    ? 'bg-md-sys-warning text-md-sys-on-warning shadow-xs'
                    : 'bg-md-sys-surface-container-high text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:bg-md-sys-surface-container-highest'
                }`}
              >
                Crawl Only ({counts.crawlOnly})
              </button>
            ) : null}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            <ArrowUpDown className="h-3.5 w-3.5 text-md-sys-on-surface-variant" aria-hidden />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low px-3 py-1.5 text-xs font-semibold text-md-sys-on-surface focus:outline-none focus:ring-2 focus:ring-md-sys-primary/20 cursor-pointer"
            >
              <option value="recent">Recently Audited</option>
              <option value="health_desc">Score (Highest First)</option>
              <option value="health_asc">Score (Lowest First)</option>
              <option value="urls">Most Pages</option>
              <option value="name">Alphabetical</option>
            </select>
          </div>
        </div>
      </div>

      {deleteError ? (
        <p className="mt-3 text-center text-sm text-md-sys-error font-medium" role="alert">
          {deleteError}
        </p>
      ) : null}

      {/* Jump Back In / Recent Audits */}
      <PortfolioResumeSection
        filterQuery={filterQuery}
        onOpen={(group) => { void openSite(group); }}
        openingCrawlId={openingCrawlId}
      />

      {/* Responsive Portfolio Grid */}
      <PortfolioGroupList
        filterQuery={filterQuery}
        statusFilter={statusFilter}
        sortBy={sortBy}
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
        onClearFilters={handleClearFilters}
      />
    </PageLayout>
  );
}
