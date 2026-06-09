'use client';

import { AlertCircle, TrendingUp } from 'lucide-react';
import { Card } from '@/components';
import { strings } from '@/lib/strings';
import type { PortfolioBenchmark } from '@/types/report';

interface PortfolioBenchmarkCardProps {
  benchmark?: PortfolioBenchmark | null;
}

export function PortfolioBenchmarkCard({ benchmark }: PortfolioBenchmarkCardProps) {
  const vo = strings.views.overview;
  if (!benchmark) return null;

  const status = benchmark.status;
  const property = benchmark.property_health_score;
  const median = benchmark.median_health_score;
  const showScores = status === 'ok' || status == null;
  const showBanner = status && status !== 'ok';

  if (!showScores && !showBanner && property == null && median == null) return null;

  const delta =
    property != null && median != null ? property - median : null;

  return (
    <Card padding="tight" className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-link" />
        <h2 className="text-xl font-bold text-bright">{vo.portfolioBenchmarkTitle}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{vo.portfolioBenchmarkHint}</p>

      {showBanner && benchmark.message ? (
        <div
          className={`mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
            status === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
          }`}
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{benchmark.message}</span>
        </div>
      ) : null}

      {showScores ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-default bg-brand-900/60 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{vo.portfolioPropertyScore}</div>
            <div className="text-3xl font-bold text-foreground mt-1">{property ?? '—'}</div>
          </div>
          <div className="rounded-lg border border-default bg-brand-900/60 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{vo.portfolioMedianScore}</div>
            <div className="text-3xl font-bold text-foreground mt-1">{median ?? '—'}</div>
          </div>
          <div className="rounded-lg border border-default bg-brand-900/60 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{vo.portfolioDelta}</div>
            <div
              className={`text-3xl font-bold mt-1 ${
                delta == null
                  ? 'text-muted-foreground'
                  : delta >= 0
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta}`}
            </div>
          </div>
        </div>
      ) : property != null ? (
        <div className="rounded-lg border border-default bg-brand-900/60 p-4 max-w-xs">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{vo.portfolioPropertyScore}</div>
          <div className="text-3xl font-bold text-foreground mt-1">{property}</div>
        </div>
      ) : null}
    </Card>
  );
}
