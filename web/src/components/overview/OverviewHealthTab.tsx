'use client';

import { ChevronRight, Lightbulb } from 'lucide-react';
import type { ReportCategory, ReportPayload } from '@/types';
import { strings, format } from '@/lib/strings';
import { categoryDisplayName } from '@/lib/categoryDisplayNames';
import { CategoryScoreGauge } from '@/components/charts/CategoryScoreGauge';
import { Card } from '@/components';
import { OverviewTabPanel } from './OverviewTabPanel';

const REC_COLORS = [
  { border: 'border-l-blue-500', bg: 'bg-blue-500/10', text: 'text-link', dot: 'bg-blue-500' },
  { border: 'border-l-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  { border: 'border-l-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-700 dark:text-purple-400', dot: 'bg-purple-500' },
  { border: 'border-l-green-500', bg: 'bg-green-500/10', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' },
  { border: 'border-l-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-700 dark:text-rose-400', dot: 'bg-rose-500' },
  { border: 'border-l-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-700 dark:text-cyan-400', dot: 'bg-cyan-500' },
];

export interface OverviewHealthTabProps {
  data: ReportPayload;
  categoriesFiltered: ReportCategory[];
  recommendationsFiltered: string[];
}

export function OverviewHealthTab({ data, categoriesFiltered, recommendationsFiltered }: OverviewHealthTabProps) {
  const vo = strings.views.overview;
  const sj = strings.common;

  return (
    <OverviewTabPanel tabId="health" className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-bright mb-4">{vo.healthByCategory}</h2>
        {data.categories && data.categories.length > 0 ? (
          categoriesFiltered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {categoriesFiltered.map((cat, i) => (
                <Card key={i} className="p-4">
                  <CategoryScoreGauge
                    name={categoryDisplayName(String(cat.name ?? cat.id ?? ''))}
                    score={cat.score}
                  />
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground mb-8">{vo.noCategorySearch}</p>
          )
        ) : (
          <p className="text-muted-foreground">{vo.noCategoryData}</p>
        )}
      </div>

      {data.site_level && (data.site_level.robots_present != null || data.site_level.sitemap_present != null) && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-3">{vo.siteConfiguration}</h2>
          <Card padding="tight" className="flex gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{vo.robotsTxt}</span>
              <span className="font-semibold text-foreground">{data.site_level.robots_present ? sj.yes : sj.no}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{vo.sitemapXml}</span>
              <span className="font-semibold text-foreground">
                {data.site_level.sitemap_present ? sj.yes : sj.no}
                {data.site_level.sitemap_valid === true
                  ? vo.sitemapValid
                  : data.site_level.sitemap_present
                    ? vo.sitemapInvalid
                    : ''}
              </span>
            </div>
          </Card>
        </div>
      )}

      {(data.recommendations || []).length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-4 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-700 dark:text-amber-400" /> {vo.recommendations}
          </h2>
          {recommendationsFiltered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recommendationsFiltered.map((r, i) => {
                const c = REC_COLORS[i % REC_COLORS.length];
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-3 border-l-4 ${c.border} ${c.bg} rounded-r-xl px-4 py-3`}
                  >
                    <ChevronRight className={`h-4 w-4 shrink-0 mt-0.5 ${c.text}`} />
                    <span className="text-sm text-foreground leading-relaxed">{r}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{vo.noRecSearch}</p>
          )}
        </div>
      )}
    </OverviewTabPanel>
  );
}
