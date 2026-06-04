import type { ReportFingerprintDiff, ReportPayload } from '@/types/report';

/**
 * Compare url_fingerprints from two report payloads (newer vs older baseline).
 */

export function normReportUrl(u: string | null | undefined): string {
  return String(u || '')
    .trim()
    .replace(/\/$/, '');
}

export function computeReportFingerprintDiff(
  current: ReportPayload,
  baseline: ReportPayload,
): ReportFingerprintDiff | null {
  const curFp = current?.url_fingerprints;
  const baseFp = baseline?.url_fingerprints;
  if (!Array.isArray(curFp) || !Array.isArray(baseFp)) {
    return null;
  }

  const cur = new Map(curFp.map((r) => [normReportUrl(r.url), r]));
  const base = new Map(baseFp.map((r) => [normReportUrl(r.url), r]));

  const newUrls: string[] = [];
  const removedUrls: string[] = [];
  const contentChanged: string[] = [];
  const structureChanged: string[] = [];

  for (const [u, row] of cur) {
    const b = base.get(u);
    if (!b) {
      newUrls.push(row.url);
      continue;
    }
    if (row.content_fingerprint !== b.content_fingerprint) {
      contentChanged.push(row.url);
    } else if (row.structure_fingerprint !== b.structure_fingerprint) {
      structureChanged.push(row.url);
    }
  }

  for (const [u, row] of base) {
    if (!cur.has(u)) {
      removedUrls.push(row.url);
    }
  }

  return { newUrls, removedUrls, contentChanged, structureChanged };
}
