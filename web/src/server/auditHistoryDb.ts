import { withDb } from '@/server/db';

export interface AuditHistoryRow {
  reportId: number;
  canonicalDomain: string | null;
  siteName: string | null;
  generatedAt: string;
  healthScore: number | null;
  categoryScores: Record<string, number>;
  issueCounts: Record<string, number>;
}

function averageCategoryScore(categories: Array<{ score?: number | null }>): number | null {
  const numeric = categories
    .map((c) => Number(c?.score))
    .filter((n) => Number.isFinite(n));
  if (!numeric.length) return null;
  return Math.round(numeric.reduce((a, b) => a + b, 0) / numeric.length);
}

function issueCountsByPriority(categories: Array<{ issues?: Array<{ priority?: string }> }>): Record<string, number> {
  const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const cat of categories) {
    for (const issue of cat.issues || []) {
      const p = issue.priority || 'Medium';
      counts[p] = (counts[p] || 0) + 1;
    }
  }
  return counts;
}

export async function listAuditHistory(
  propertyId?: number | null,
  domain?: string | null,
  limit = 20,
): Promise<AuditHistoryRow[]> {
  return withDb(async (client) => {
    const clauses: string[] = [];
    const vals: unknown[] = [];
    let n = 0;
    if (propertyId != null && propertyId > 0) {
      n += 1;
      clauses.push(`property_id = $${n}`);
      vals.push(propertyId);
    } else if (domain) {
      n += 1;
      clauses.push(`canonical_domain = $${n}`);
      vals.push(domain.toLowerCase());
    }
    n += 1;
    vals.push(Math.min(100, Math.max(1, limit)));
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const cur = await client.query<{
      id: string;
      canonical_domain: string | null;
      site_name: string | null;
      generated_at: Date;
      payload: { categories?: Array<{ id?: string; name?: string; score?: number; issues?: Array<{ priority?: string }> }> };
    }>(
      `SELECT id, canonical_domain, site_name, generated_at, payload
       FROM report_payload
       ${where}
       ORDER BY generated_at DESC
       LIMIT $${n}`,
      vals,
    );
    return cur.rows.map((row) => {
      const categories = row.payload?.categories || [];
      const categoryScores: Record<string, number> = {};
      for (const cat of categories) {
        const key = cat.id || cat.name || 'unknown';
        if (typeof cat.score === 'number' && Number.isFinite(cat.score)) {
          categoryScores[key] = cat.score;
        }
      }
      return {
        reportId: Number(row.id),
        canonicalDomain: row.canonical_domain,
        siteName: row.site_name,
        generatedAt: row.generated_at.toISOString(),
        healthScore: averageCategoryScore(categories),
        categoryScores,
        issueCounts: issueCountsByPriority(categories),
      };
    });
  });
}

export async function writeAuditHealthSnapshot(
  reportId: number,
  propertyId: number | null,
  canonicalDomain: string | null,
  payload: { categories?: Array<{ id?: string; name?: string; score?: number; issues?: Array<{ priority?: string }> }> },
): Promise<void> {
  const categories = payload.categories || [];
  const healthScore = averageCategoryScore(categories);
  const categoryScores: Record<string, number> = {};
  for (const cat of categories) {
    const key = cat.id || cat.name || 'unknown';
    if (typeof cat.score === 'number') categoryScores[key] = cat.score;
  }
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO audit_health_snapshots
         (property_id, report_id, canonical_domain, health_score, category_scores, issue_counts, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [
        propertyId,
        reportId,
        canonicalDomain,
        healthScore,
        JSON.stringify(categoryScores),
        JSON.stringify(issueCountsByPriority(categories)),
      ],
    );
  });
}
