import { useMemo } from 'react';
import { AlertTriangle, Building2, Gauge, Sparkles } from 'lucide-react';
import { LabelWithHint } from '@/components';
import { healthScoreClass } from '@/components/portfolio/portfolioCardUtils';
import { usePortfolio } from '@/context/usePortfolio';
import { usePortfolioSummary } from '@/hooks/usePortfolioWidget';
import { strings } from '@/lib/strings';

const statSkeleton = (
  <span
    className="shimmer inline-block h-8 w-20 rounded-full bg-md-sys-surface-container-high align-middle"
    aria-hidden
  />
);

function healthLabel(score: number | null): { text: string; badgeClass: string } {
  if (score == null) return { text: '—', badgeClass: 'bg-md-sys-surface-container-high text-md-sys-on-surface-variant' };
  if (score >= 85) return { text: 'Excellent', badgeClass: 'bg-md-sys-success-container/40 text-md-sys-success border border-md-sys-success/30' };
  if (score >= 70) return { text: 'Good', badgeClass: 'bg-md-sys-primary-container/40 text-md-sys-primary border border-md-sys-primary/30' };
  if (score >= 50) return { text: 'Fair', badgeClass: 'bg-md-sys-warning-container/40 text-md-sys-warning border border-md-sys-warning/30' };
  return { text: 'Critical', badgeClass: 'bg-md-sys-error-container/40 text-md-sys-error border border-md-sys-error/30' };
}

export default function PortfolioStatsRow() {
  const summaryStatus = usePortfolioSummary();
  const { summary, groups } = usePortfolio();
  const vh = strings.views.home;
  const sj = strings.common;
  const loading = summaryStatus === 'loading' || summaryStatus === 'idle';

  const totals = summary ?? { totalBrands: 0, totalUrls: 0, avgHealth: null };

  const urgentIssues = useMemo(() => {
    return groups.reduce((acc, g) => acc + (g.issueCounts?.critical || 0) + (g.issueCounts?.high || 0), 0);
  }, [groups]);

  const auditCount = useMemo(() => {
    return groups.filter((g) => !g.crawlOnly).length;
  }, [groups]);

  const healthStatus = healthLabel(totals.avgHealth);

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1. Monitored Brands */}
      <div className="group rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container p-4 transition-all duration-200 hover:border-md-sys-primary/40 hover:shadow-[var(--elevation-1)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-md-sys-on-surface-variant">
            <LabelWithHint label={vh.totalBrandsLabel} helpKey="views.home.totalBrands" />
          </p>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-md-sys-primary-container/30 text-md-sys-primary">
            <Building2 className="h-4 w-4" aria-hidden />
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums text-md-sys-on-surface sm:text-3xl">
            {loading ? statSkeleton : totals.totalBrands.toLocaleString()}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-md-sys-on-surface-variant">
          {loading ? '—' : `${auditCount} full audits · ${totals.totalBrands - auditCount} crawls`}
        </p>
      </div>

      {/* 2. Total URLs Crawled */}
      <div className="group rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container p-4 transition-all duration-200 hover:border-md-sys-primary/40 hover:shadow-[var(--elevation-1)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-md-sys-on-surface-variant">
            <LabelWithHint label={vh.totalUrlsLabel} helpKey="views.home.totalUrls" />
          </p>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-md-sys-secondary-container/40 text-md-sys-secondary">
            <Gauge className="h-4 w-4" aria-hidden />
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums text-md-sys-on-surface sm:text-3xl">
            {loading ? statSkeleton : totals.totalUrls.toLocaleString()}
          </span>
          <span className="text-xs text-md-sys-on-surface-variant font-medium">pages</span>
        </div>
        <p className="mt-1.5 text-xs text-md-sys-on-surface-variant">Across all monitored properties</p>
      </div>

      {/* 3. Average Health Score */}
      <div className="group rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container p-4 transition-all duration-200 hover:border-md-sys-primary/40 hover:shadow-[var(--elevation-1)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-md-sys-on-surface-variant">
            <LabelWithHint label={vh.avgHealthLabel} helpKey="views.home.avgHealth" />
          </p>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-md-sys-tertiary-container/30 text-md-sys-tertiary">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span
            className={`text-2xl font-bold tabular-nums sm:text-3xl ${
              totals.avgHealth != null ? healthScoreClass(totals.avgHealth) : 'text-md-sys-on-surface'
            }`}
          >
            {loading ? statSkeleton : (totals.avgHealth ?? sj.emDash)}
          </span>
          {!loading && totals.avgHealth != null ? (
            <span className="text-xs font-medium text-md-sys-on-surface-variant">/ 100</span>
          ) : null}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${healthStatus.badgeClass}`}>
            {healthStatus.text}
          </span>
        </div>
      </div>

      {/* 4. Urgent Issues */}
      <div className="group rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container p-4 transition-all duration-200 hover:border-md-sys-primary/40 hover:shadow-[var(--elevation-1)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-md-sys-on-surface-variant">
            Urgent Issues
          </p>
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              urgentIssues > 0
                ? 'bg-md-sys-error-container/30 text-md-sys-error'
                : 'bg-md-sys-success-container/30 text-md-sys-success'
            }`}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden />
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span
            className={`text-2xl font-bold tabular-nums sm:text-3xl ${
              urgentIssues > 0 ? 'text-md-sys-error' : 'text-md-sys-success'
            }`}
          >
            {loading ? statSkeleton : urgentIssues.toLocaleString()}
          </span>
          <span className="text-xs text-md-sys-on-surface-variant font-medium">Critical & High</span>
        </div>
        <p className="mt-1.5 text-xs text-md-sys-on-surface-variant">
          {urgentIssues > 0 ? 'Requires immediate optimization' : 'No critical blockers detected'}
        </p>
      </div>
    </div>
  );
}

export { statSkeleton };
