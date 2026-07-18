import type { GscTopLinkingSiteRow, GscTopLinkedPageRow, GscTopLinkingTextRow } from '@/types/components';

type SampleLinkRow = {
  source_page?: string;
  target_page?: string;
  anchor_text?: string;
  linking_site?: string;
};

function haystack(values: Array<string | undefined | null>): string {
  return values.filter(Boolean).join(' ').toLowerCase();
}

export function filterBacklinkDomains(
  rows: GscTopLinkingSiteRow[],
  query: string,
): GscTopLinkingSiteRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => haystack([row.site]).includes(q));
}

export function filterBacklinkPages(
  rows: GscTopLinkedPageRow[],
  query: string,
): GscTopLinkedPageRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => haystack([row.target_page]).includes(q));
}

export function filterBacklinkAnchors(
  rows: GscTopLinkingTextRow[],
  query: string,
): GscTopLinkingTextRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => haystack([row.anchor_text]).includes(q));
}

export function filterBacklinkSample(rows: SampleLinkRow[], query: string): SampleLinkRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    haystack([row.source_page, row.target_page, row.anchor_text, row.linking_site]).includes(q),
  );
}

export function firstBacklinksTabWithMatches(
  query: string,
  counts: {
    domains: number;
    pages: number;
    anchors: number;
    sample: number;
  },
): 'domains' | 'pages' | 'anchors' | 'sample' | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (counts.domains > 0) return 'domains';
  if (counts.pages > 0) return 'pages';
  if (counts.anchors > 0) return 'anchors';
  if (counts.sample > 0) return 'sample';
  return null;
}
