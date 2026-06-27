import type { ReportCategory, ReportPayload } from '@/types/report';

/** Mirrors ReportService SiteHealthScoreBuilder — fixable categories only. */
const WEIGHTS: Record<string, number> = {
  technical_seo: 0.25,
  link_health: 0.2,
  performance: 0.15,
  security: 0.15,
  core_web_vitals: 0.1,
  mobile: 0.1,
  html_accessibility: 0.05,
};

const EXCLUDED = new Set(['search_performance', 'intelligence']);

export function siteHealthScoreFromCategories(categories: ReportCategory[] = []): number | null {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const [id, weight] of Object.entries(WEIGHTS)) {
    const cat = categories.find((c) => c.id === id);
    const score = Number(cat?.score);
    if (!Number.isFinite(score)) continue;
    weightedSum += score * weight;
    weightTotal += weight;
  }

  return weightTotal > 0 ? Math.round(weightedSum / weightTotal) : null;
}

/** Prefer native payload field; fall back to client weighted score for older reports. */
export function siteHealthScoreFromPayload(
  payload: Pick<ReportPayload, 'site_health_score' | 'summary' | 'categories'>,
): number | null {
  const fromPayload = payload.summary?.site_health_score ?? payload.site_health_score;
  if (typeof fromPayload === 'number' && Number.isFinite(fromPayload)) {
    return Math.round(fromPayload);
  }

  const categories = (payload.categories ?? []).filter(
    (c) => c.id && !EXCLUDED.has(String(c.id)),
  );
  return siteHealthScoreFromCategories(categories);
}
