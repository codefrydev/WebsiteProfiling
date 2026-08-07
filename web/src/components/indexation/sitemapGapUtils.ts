export interface SitemapGapUrlRow extends Record<string, unknown> {
  url: string;
}

export function urlsToRows(urls: string[]): SitemapGapUrlRow[] {
  return urls.map((url) => ({ url }));
}

/** Combine sidebar and toolbar search against URL rows. */
export function filterUrlRows(
  rows: SitemapGapUrlRow[],
  globalSearch: string,
  localSearch: string,
): SitemapGapUrlRow[] {
  const parts = [globalSearch, localSearch]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return rows;
  return rows.filter((row) => {
    const hay = row.url.toLowerCase();
    return parts.every((q) => hay.includes(q));
  });
}
