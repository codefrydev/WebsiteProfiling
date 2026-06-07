import type { ChatBlock } from '@/components/chat/deriveChatBlocks';

const GFM_TABLE_RE = /(\n|^)(\|[^\n]+\|\n\|[-:\s|]+\|\n(?:\|[^\n]+\|\n?)+)/g;

function isCategoryScoreTable(headerRow: string): boolean {
  const h = headerRow.toLowerCase();
  return /category/.test(h) && /score/.test(h);
}

function isIssueTable(headerRow: string): boolean {
  const h = headerRow.toLowerCase();
  return (
    (/priority/.test(h) || /severity/.test(h)) &&
    (/category/.test(h) || /url/.test(h) || /issue/.test(h) || /message/.test(h))
  );
}

function shouldStripTable(headerRow: string, blocks: ChatBlock[]): boolean {
  for (const block of blocks) {
    if (block.type === 'category_scores' && isCategoryScoreTable(headerRow)) return true;
    if (block.type === 'issue_table' && isIssueTable(headerRow)) return true;
    if (block.type === 'compare_category_deltas' && isCategoryScoreTable(headerRow)) return true;
    if (block.type === 'google_summary' && /query|clicks|page/i.test(headerRow)) return true;
  }
  return false;
}

function stripTables(content: string, blocks: ChatBlock[]): string {
  return content.replace(GFM_TABLE_RE, (match, prefix: string, table: string) => {
    const firstLine = table.split('\n')[0] || '';
    if (shouldStripTable(firstLine, blocks)) {
      return prefix;
    }
    return match;
  });
}

/** Remove prose issue dumps when structured issue blocks already render the data. */
function stripIssueProse(content: string, blocks: ChatBlock[]): string {
  const hasIssueViz = blocks.some(
    (b) => b.type === 'issue_table' || b.type === 'issue_summary',
  );
  if (!hasIssueViz) return content;

  let out = content;

  // Drop "## Issue details" sections
  out = out.replace(/\n?#{1,3}\s*Issue details[^\n]*\n[\s\S]*?(?=\n#{1,3}\s|$)/gi, '\n');

  // Drop inline "Issue details:" preamble and following enumeration
  const detailsIdx = out.search(/\bIssue details:/i);
  if (detailsIdx >= 0) {
    const before = out.slice(0, detailsIdx).trim();
    if (before.length > 0) {
      out = before;
    }
  }

  const lines = out.split('\n');
  const filtered = lines.filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (/^https?:\/\//i.test(t)) return false;
    if (/affected urls/i.test(t)) return false;
    if (/^critical issue \d+/i.test(t)) return false;
    if (/^\d+\.\s+.+(priority:|affected urls)/i.test(t)) return false;
    if (/^priority:\s*(critical|high|medium|low)\s*$/i.test(t)) return false;
    return true;
  });

  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripOverviewProse(content: string, blocks: ChatBlock[]): string {
  const hasSummary = blocks.some(
    (b) =>
      b.type === 'issue_summary' ||
      b.type === 'category_scores' ||
      b.type === 'status_breakdown',
  );
  if (!hasSummary) return content;

  let out = content;

  // Drop opening audit recap (health score, crawl stats) when viz blocks cover it
  out = out.replace(
    /^[^\n#]*(?:here'?s|quick read|latest audit|overview)[^\n]*(?:health score|urls?\s+crawl|success rate)[^\n]*\n?/i,
    '',
  );
  out = out.replace(
    /^[^\n#]*health score:\s*\d+[^\n]*(?:urls?\s+crawl|success rate)[^\n]*\n?/i,
    '',
  );

  if (blocks.some((b) => b.type === 'status_breakdown')) {
    out = out.replace(
      /\n?#{1,3}\s*what(?:'s| is)?\s+(?:working|good)[^\n]*\n[\s\S]*?(?=\n#{1,3}\s|$)/i,
      '\n',
    );
    out = out.replace(
      /^.*(?:urls?\s+(?:crawled|returned)|success rate|no\s+4xx|no\s+5xx|\d+\/\d+\s+urls?).*$/gim,
      '',
    );
  }

  if (blocks.some((b) => b.type === 'category_scores')) {
    out = out.replace(
      /^.*(?:category score|scored?\s+\d+\/100|\/100\s+in\s+\w+).*$/gim,
      '',
    );
  }

  if (blocks.some((b) => b.type === 'issue_summary')) {
    out = out.replace(/^.*\b\d+\s+issues?\b.*$/gim, '');
    out = out.replace(/^.*\b(?:critical|high|medium|low):\s*\d+.*$/gim, '');
  }

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Remove GFM tables and prose duplicated by structured chat blocks. */
export function stripRedundantMarkdown(content: string, blocks: ChatBlock[]): string {
  if (!content.trim() || !blocks.length) return content;
  let out = stripTables(content, blocks);
  out = stripIssueProse(out, blocks);
  out = stripOverviewProse(out, blocks);
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
