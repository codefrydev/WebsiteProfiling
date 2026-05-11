/**
 * Compare url_fingerprints from two report payloads (newer vs older baseline).
 */

export function normReportUrl(u) {
  return String(u || '')
    .trim()
    .replace(/\/$/, '');
}

/**
 * @param {object} current - newer report payload
 * @param {object} baseline - older report to compare against
 * @returns {null | { newUrls: string[], removedUrls: string[], contentChanged: string[], structureChanged: string[] }}
 */
export function computeReportFingerprintDiff(current, baseline) {
  const curFp = current?.url_fingerprints;
  const baseFp = baseline?.url_fingerprints;
  if (!Array.isArray(curFp) || !Array.isArray(baseFp)) {
    return null;
  }

  const cur = new Map(curFp.map((r) => [normReportUrl(r.url), r]));
  const base = new Map(baseFp.map((r) => [normReportUrl(r.url), r]));

  const newUrls = [];
  const removedUrls = [];
  const contentChanged = [];
  const structureChanged = [];

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
