export interface PortfolioAuditHistoryPoint {
  healthScore: number | null;
  totalIssues: number;
  urgentIssues: number;
  perfScore: number | null;
  seoScore: number | null;
  technicalSeoScore: number | null;
}

export interface AuditHistoryApiRow {
  healthScore?: number | null;
  issueCounts?: Record<string, number>;
  perfScore?: number | null;
  seoScore?: number | null;
  technicalSeoScore?: number | null;
  categoryScores?: Record<string, number>;
}

function sumIssueCounts(counts: Record<string, number> | undefined): { total: number; urgent: number } {
  if (!counts || typeof counts !== 'object') return { total: 0, urgent: 0 };
  const critical = Number(counts.Critical) || 0;
  const high = Number(counts.High) || 0;
  const medium = Number(counts.Medium) || 0;
  const low = Number(counts.Low) || 0;
  const known = critical + high + medium + low;
  const fallback = Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const total = known > 0 ? known : fallback;
  return { total, urgent: critical + high };
}

function categoryScoreFromMap(
  scores: Record<string, number> | undefined,
  id: string,
): number | null {
  if (!scores) return null;
  const value = scores[id];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

/** Oldest → newest (API returns newest first). */
export function parsePortfolioAuditHistory(rows: AuditHistoryApiRow[]): PortfolioAuditHistoryPoint[] {
  return [...rows].reverse().map((row) => {
    const { total, urgent } = sumIssueCounts(row.issueCounts);
    const healthScore =
      typeof row.healthScore === 'number' && Number.isFinite(row.healthScore) ? row.healthScore : null;
    const technicalSeoScore =
      row.technicalSeoScore ??
      categoryScoreFromMap(row.categoryScores, 'technical_seo');
    return {
      healthScore,
      totalIssues: total,
      urgentIssues: urgent,
      perfScore:
        typeof row.perfScore === 'number' && Number.isFinite(row.perfScore) ? Math.round(row.perfScore) : null,
      seoScore:
        typeof row.seoScore === 'number' && Number.isFinite(row.seoScore) ? Math.round(row.seoScore) : null,
      technicalSeoScore,
    };
  });
}

export function historySeries(
  points: PortfolioAuditHistoryPoint[],
  key: keyof Pick<
    PortfolioAuditHistoryPoint,
    'healthScore' | 'totalIssues' | 'urgentIssues' | 'perfScore' | 'seoScore' | 'technicalSeoScore'
  >,
): number[] {
  return points
    .map((p) => p[key])
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}
