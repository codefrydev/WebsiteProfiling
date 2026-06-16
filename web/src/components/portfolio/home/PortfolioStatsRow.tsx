'use client';

import { Building2, Gauge, Sparkles } from 'lucide-react';
import { StatCard, LabelWithHint } from '@/components';
import { healthScoreClass } from '@/components/portfolio/portfolioCardUtils';
import { usePortfolio } from '@/context/usePortfolio';
import { usePortfolioSummary } from '@/hooks/usePortfolioWidget';
import { strings } from '@/lib/strings';

const statSkeleton = (
  <span
    className="shimmer inline-block h-6 w-14 rounded-md bg-brand-800/90 align-middle dark:bg-white/[0.07]"
    aria-hidden
  />
);

export default function PortfolioStatsRow() {
  const summaryStatus = usePortfolioSummary();
  const { summary } = usePortfolio();
  const vh = strings.views.home;
  const sj = strings.common;
  const loading = summaryStatus === 'loading' || summaryStatus === 'idle';

  const totals = summary ?? { totalBrands: 0, totalUrls: 0, avgHealth: null };

  return (
    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        label={<LabelWithHint label={vh.totalBrandsLabel} helpKey="views.home.totalBrands" />}
        value={loading ? statSkeleton : totals.totalBrands.toLocaleString()}
        icon={<Building2 className="h-3.5 w-3.5" aria-hidden />}
        size="lg"
        shadow
      />
      <StatCard
        label={<LabelWithHint label={vh.totalUrlsLabel} helpKey="views.home.totalUrls" />}
        value={loading ? statSkeleton : totals.totalUrls.toLocaleString()}
        icon={<Gauge className="h-3.5 w-3.5" aria-hidden />}
        size="lg"
        shadow
      />
      <StatCard
        label={<LabelWithHint label={vh.avgHealthLabel} helpKey="views.home.avgHealth" />}
        value={loading ? statSkeleton : (totals.avgHealth ?? sj.emDash)}
        valueClassName={
          totals.avgHealth != null ? healthScoreClass(totals.avgHealth) : 'text-bright'
        }
        icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
        size="lg"
        shadow
      />
    </div>
  );
}

export { statSkeleton };
