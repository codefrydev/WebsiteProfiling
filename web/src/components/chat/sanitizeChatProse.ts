/** Final prose cleanup after markdown preprocess — user-facing language only. */

const TOOL_LABELS: Record<string, string> = {
  run_technical_workflow: 'technical workflow',
  run_insight_workflow: 'insight workflow',
  run_keyword_workflow: 'keyword workflow',
  run_domain_agent: 'domain analysis',
  export_audit_report: 'export audit report',
  export_compare_csv: 'export comparison CSV',
  export_list_as_csv: 'export list as CSV',
  export_custom_report: 'export custom report',
  get_category_recommendations: 'category recommendations',
  get_report_summary: 'audit summary',
  get_critical_issues: 'critical issues list',
  list_issues: 'issues list',
  search_audit_tools: 'tool search',
};

const BOILERPLATE_RE =
  /^let me know which of these actions you'?d like to run.*$/gim;

const PIPE_SCORE_ROW_RE = /^\s*\|.*\bscore\s*\d+.*\|?\s*$/i;

function humanizeToolName(name: string): string {
  const key = name.trim().toLowerCase();
  if (TOOL_LABELS[key]) return TOOL_LABELS[key];
  return key.replace(/_/g, ' ');
}

/** Replace snake_case tool references with plain language. */
export function stripToolNamesFromProse(content: string): string {
  let out = content;

  for (const [tool, label] of Object.entries(TOOL_LABELS)) {
    const re = new RegExp(`\\b${tool.replace(/_/g, '_')}\\b`, 'gi');
    out = out.replace(re, label);
  }

  // Remaining snake_case tokens that look like tool names (2+ underscores or known prefix)
  out = out.replace(
    /\b([a-z]+(?:_[a-z]+)+)\b(?:\s*\([^)]*\))?/gi,
    (match, name: string) => {
      if (!/^(get_|list_|run_|export_|compare_)/i.test(name)) return match;
      return humanizeToolName(name);
    },
  );

  return out;
}

export function stripBoilerplateClosing(content: string): string {
  return content.replace(BOILERPLATE_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Remove pipe-style score rows (often duplicate category cards). */
export function stripLoosePipeScoreRows(content: string): string {
  const lines = content.split('\n');
  const filtered = lines.filter((line) => !PIPE_SCORE_ROW_RE.test(line));
  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Remove inline health / category score narration when redundant. */
export function stripInlineScoreNarration(content: string): string {
  let out = content;
  out = out.replace(
    /\b(?:the site'?s?|overall|current)\s+health score is\s+\d+\s*\/\s*100\b[^.\n]*/gi,
    '',
  );
  out = out.replace(/\bscore\s+\d+\s*\/\s*100\b[^.\n|]*/gi, '');
  out = out.replace(
    /\|\s*[^|]*\bhealth score is\s+\d+\s*\/\s*100\b[^|]*\|/gi,
    '| |',
  );
  out = out.replace(/^.*\b\d+\s+(?:high|critical)[‑-]?priority issues?\b.*$/gim, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

const CATEGORY_NOTES_TABLE_RE =
  /(\n|^)\| *Category *\| *Notes *\|\s*\n\|[-:\s|]+\|\s*\n(?:\|[^\n]+\|\s*\n?)+/gi;

/** Remove Category|Notes markdown tables (UI renders category cards instead). */
export function stripCategoryNotesTables(content: string): string {
  return content.replace(CATEGORY_NOTES_TABLE_RE, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export interface SanitizeChatProseOptions {
  hasCategoryBlocks?: boolean;
}

export function sanitizeChatProse(
  content: string,
  { hasCategoryBlocks = false }: SanitizeChatProseOptions = {},
): string {
  if (!content.trim()) return content;
  let out = content;
  if (hasCategoryBlocks) {
    out = stripCategoryNotesTables(out);
  }
  out = stripLoosePipeScoreRows(out);
  out = stripInlineScoreNarration(out);
  out = stripToolNamesFromProse(out);
  out = stripBoilerplateClosing(out);
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
