/** Filter structural HTML tokens from semantic UI (keywords, topics, charts). */

const HTML_HEADING_TOKENS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export function isJunkSemanticTerm(term: string | undefined): boolean {
  if (!term) return true;
  const tokens = term
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => HTML_HEADING_TOKENS.has(t));
}

export function filterSemanticTerms<T extends { word?: string }>(items: T[]): T[] {
  return items.filter((item) => !isJunkSemanticTerm(item.word));
}

export function filterTopicClusters<T extends { top_keyword?: string; representative?: string; keywords?: string[] }>(
  clusters: T[],
): T[] {
  return clusters
    .filter((cl) => {
      const label = String(cl.top_keyword ?? cl.representative ?? '');
      return label.length > 0 && !isJunkSemanticTerm(label);
    })
    .map((cl) => ({
      ...cl,
      keywords: Array.isArray(cl.keywords)
        ? cl.keywords.filter((kw) => !isJunkSemanticTerm(String(kw)))
        : cl.keywords,
    }));
}
