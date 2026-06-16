import type { ChatBlock } from '@/components/chat/deriveChatBlocks';

const GFM_TABLE_RE = /(\n|^)(\|[^\n]+\|\n\|[-:\s|]+\|\n(?:\|[^\n]+\|\n?)+)/g;
const JSON_FENCE_RE = /```(?:json)?\s*\n[\s\S]*?```/gi;

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

function isImageMetricTable(headerRow: string): boolean {
  const h = headerRow.toLowerCase();
  return /metric|value|images|alt|lazy|dimension|og/i.test(h);
}

function shouldStripTable(headerRow: string, blocks: ChatBlock[]): boolean {
  const h = headerRow.toLowerCase();
  const isCategoryNotes = /category/.test(h) && /notes|summary|item/.test(h);
  for (const block of blocks) {
    if (block.type === 'category_scores' && (isCategoryScoreTable(headerRow) || isCategoryNotes))
      return true;
    if (block.type === 'issue_table' && isIssueTable(headerRow)) return true;
    if (block.type === 'compare_category_deltas' && isCategoryScoreTable(headerRow)) return true;
    if (block.type === 'google_summary' && /query|clicks|page/i.test(headerRow)) return true;
    if (block.type === 'image_audit_summary' && isImageMetricTable(headerRow)) return true;
    if (block.type === 'lighthouse_scores' && /performance|lighthouse|category/i.test(headerRow))
      return true;
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

function stripGlobalMetrics(content: string, blocks: ChatBlock[]): string {
  const hasSummary = blocks.some(
    (b) =>
      b.type === 'issue_summary' ||
      b.type === 'category_scores' ||
      b.type === 'status_breakdown' ||
      b.type === 'lighthouse_scores' ||
      b.type === 'google_summary',
  );
  if (!hasSummary) return content;

  let out = content;
  out = out.replace(/^.*\bhealth score is\s+\d+\s*\/\s*100\b.*$/gim, '');
  out = out.replace(/^.*\b\d+\s+URLs?\s+crawl(?:ed)?\b.*$/gim, '');
  out = out.replace(/^.*\bsuccess rate\b.*$/gim, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function stripUrlLinesWhenTables(content: string, blocks: ChatBlock[]): string {
  const hasTable = blocks.some(
    (b) =>
      b.type === 'issue_table' ||
      b.type === 'image_pages_table' ||
      b.type === 'image_attention_table',
  );
  if (!hasTable) return content;

  const lines = content.split('\n').filter((line) => {
    const t = line.trim();
    if (/^https?:\/\//i.test(t)) return false;
    if (/^[-*]\s+https?:\/\//i.test(t)) return false;
    return true;
  });
  return lines.join('\n');
}

function stripIssueProse(content: string, blocks: ChatBlock[]): string {
  const hasIssueViz = blocks.some(
    (b) => b.type === 'issue_table' || b.type === 'issue_summary',
  );
  if (!hasIssueViz) return content;

  let out = content;
  out = out.replace(/\n?#{1,3}\s*Issue details[^\n]*\n[\s\S]*?(?=\n#{1,3}\s|$)/gi, '\n');

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
    if (/^critical blocker \d+/i.test(t)) return false;
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
    out = out.replace(/^.*(?:category score|scored?\s+\d+\/100|\/100\s+in\s+\w+).*$/gim, '');
    out = out.replace(/^.*\|\s*[^|]+\s*\|\s*[^|]*score\s*\d+.*\|.*$/gim, '');
  }

  if (blocks.some((b) => b.type === 'issue_summary')) {
    out = out.replace(/^.*\b\d+\s+issues?\b.*$/gim, '');
    out = out.replace(/^.*\b(?:critical|high|medium|low):\s*\d+.*$/gim, '');
  }

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function stripLighthouseProse(content: string, blocks: ChatBlock[]): string {
  if (!blocks.some((b) => b.type === 'lighthouse_scores')) return content;
  let out = content;
  out = out.replace(/^.*\b(?:performance|accessibility|best practices|seo)\s*(?:score)?:\s*\d+.*$/gim, '');
  out = out.replace(/^.*\bpoor performance pages?\b.*$/gim, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function stripGoogleProse(content: string, blocks: ChatBlock[]): string {
  if (!blocks.some((b) => b.type === 'google_summary')) return content;
  let out = content;
  out = out.replace(/^.*\b(?:clicks|impressions|ctr|queries|top pages)\b.*\d+.*$/gim, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function stripHealthTrendProse(content: string, blocks: ChatBlock[]): string {
  if (!blocks.some((b) => b.type === 'health_trend')) return content;
  return content
    .replace(/^.*\bhealth (?:score )?(?:trend|history|over time)\b.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripCompareProse(content: string, blocks: ChatBlock[]): string {
  if (!blocks.some((b) => b.type === 'compare_category_deltas')) return content;
  return content
    .replace(/^.*\b(?:delta|compared to baseline|category change)\b.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripChartProse(content: string, blocks: ChatBlock[]): string {
  if (!blocks.some((b) => b.type === 'label_value_chart')) return content;
  return content
    .replace(/^.*\b\d+\s*(?:issues?|pages?|urls?)\b.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripFileDownloadProse(content: string, blocks: ChatBlock[]): string {
  if (!blocks.some((b) => b.type === 'file_download')) return content;
  let out = content;
  out = out.replace(/```[\s\S]*?```/g, '');
  out = out.replace(/^.*\b(?:base64|file contents|download link)\b.*$/gim, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function stripImageAuditProse(content: string, blocks: ChatBlock[]): string {
  const hasImageViz = blocks.some(
    (b) =>
      b.type === 'image_audit_summary' ||
      b.type === 'image_pages_table' ||
      b.type === 'image_lighthouse_list',
  );
  if (!hasImageViz) return content;

  let out = content;
  out = out.replace(/^[^\n#]*📸[^\n]*\n?/m, '');
  out = out.replace(
    /^.*\b(?:total images crawled|pages missing alt|pages with non-lazy|pages missing image dimensions|og image coverage|lighthouse image).*(?:\d+|%).*$/gim,
    '',
  );
  out = out.replace(/\n?#{1,3}\s*headline numbers[^\n]*\n[\s\S]*?(?=\n#{1,3}\s|$)/gi, '\n');

  if (blocks.some((b) => b.type === 'image_pages_table')) {
    out = out.replace(
      /\n?#{1,5}\s*\d+\.\s*(?:missing alt|lazy|og|lighthouse|dimensions)[^\n]*\n[\s\S]*?(?=\n#{1,5}\s|\n#{1,3}\s|$)/gi,
      '\n',
    );
    const lines = out.split('\n');
    const filtered = lines.filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^https?:\/\//i.test(t)) return false;
      if (/^[-*]\s+https?:\/\//i.test(t)) return false;
      if (/^[-*]\s+\/[\w/-]+/.test(t)) return false;
      if (/non-lazy\s*\/\s*\d+\s+total/i.test(t)) return false;
      if (/without alt/i.test(t) && /\d+\s+of\s+\d+/i.test(t)) return false;
      if (/pages missing:/i.test(t)) return false;
      if (/^[-*]\s+[\w-]+,\s+[\w-]+/.test(t) && t.length < 120) return false;
      return true;
    });
    out = filtered.join('\n');
  }

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function stripToolJsonFences(content: string, blocks: ChatBlock[]): string {
  if (!blocks.length) return content;
  return content.replace(JSON_FENCE_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

function stripLoosePipeScoreLines(content: string, blocks: ChatBlock[]): string {
  const hasCategoryViz = blocks.some(
    (b) =>
      b.type === 'category_scores' ||
      b.type === 'issue_summary' ||
      b.type === 'lighthouse_scores',
  );
  if (!hasCategoryViz) return content;

  const lines = content.split('\n').filter((line) => {
    const t = line.trim();
    if (!/^\|/.test(t)) return true;
    if (/^[\s|:\-–—_]+$/.test(t)) return false;
    if (/\bscore\s*\d+/i.test(t)) return false;
    if (/health score/i.test(t)) return false;
    return true;
  });

  return lines.join('\n');
}

function stripPriorityCountLines(content: string, blocks: ChatBlock[]): string {
  if (!blocks.some((b) => b.type === 'issue_summary' || b.type === 'label_value_chart')) {
    return content;
  }
  return content
    .replace(/^.*\b\d+\s+(?:high|critical)[‑-]?priority issues?\b.*$/gim, '')
    .replace(/^.*\b(?:critical|high):\s*\d+\b.*$/gim, '');
}

/** Remove GFM tables and prose duplicated by structured chat blocks. */
export function stripRedundantMarkdown(content: string, blocks: ChatBlock[]): string {
  if (!content.trim()) return content;
  if (!blocks.length) return content.trim();

  let out = stripTables(content, blocks);
  out = stripIssueProse(out, blocks);
  out = stripOverviewProse(out, blocks);
  out = stripImageAuditProse(out, blocks);
  out = stripLighthouseProse(out, blocks);
  out = stripGoogleProse(out, blocks);
  out = stripHealthTrendProse(out, blocks);
  out = stripCompareProse(out, blocks);
  out = stripChartProse(out, blocks);
  out = stripFileDownloadProse(out, blocks);
  out = stripGlobalMetrics(out, blocks);
  out = stripLoosePipeScoreLines(out, blocks);
  out = stripPriorityCountLines(out, blocks);
  out = stripUrlLinesWhenTables(out, blocks);
  out = stripToolJsonFences(out, blocks);
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
