import type { ToolActivityItem } from '@/components/chat/ChatToolActivity';

export interface IssueRow {
  priority: string;
  category: string;
  url: string;
  message: string;
}

export interface CategoryScoreRow {
  name: string;
  score?: number;
  issue_count?: number;
}

export interface CompareCategoryRow {
  id: string;
  name: string;
  current?: number | null;
  baseline?: number | null;
  delta?: number | null;
}

export interface HealthTrendPoint {
  label: string;
  score: number;
}

export interface GoogleQueryRow {
  query: string;
  clicks?: number;
  impressions?: number;
}

export interface GooglePageRow {
  page: string;
  clicks?: number;
}

export type ChatBlock =
  | {
      type: 'issue_summary';
      healthScore?: number;
      counts: Record<string, number>;
      siteName?: string;
      totalIssues?: number;
      totalUrls?: number;
      successRate?: number;
    }
  | {
      type: 'issue_table';
      issues: IssueRow[];
      total?: number;
      truncated?: boolean;
    }
  | {
      type: 'category_scores';
      healthScore?: number;
      categories: CategoryScoreRow[];
    }
  | {
      type: 'label_value_chart';
      title: string;
      items: { label: string; value: number }[];
    }
  | {
      type: 'status_breakdown';
      items: { label: string; value: number }[];
      successRate?: number;
      totalUrls?: number;
    }
  | {
      type: 'health_trend';
      title: string;
      points: HealthTrendPoint[];
      categoryId?: string;
    }
  | {
      type: 'compare_category_deltas';
      rows: CompareCategoryRow[];
    }
  | {
      type: 'lighthouse_scores';
      scores: Record<string, number | null>;
      poorPages: { url: string; performance: number }[];
    }
  | {
      type: 'google_summary';
      clicks?: number;
      impressions?: number;
      ctr?: number;
      queries: GoogleQueryRow[];
      pages: GooglePageRow[];
    };

const SUMMARY_TOOLS = new Set(['get_report_summary', 'get_executive_summary']);
const ISSUE_TABLE_TOOLS = new Set([
  'list_issues',
  'list_issues_by_category',
  'get_category_issues',
  'get_critical_issues',
  'list_seo_onpage_issues',
  'list_issues_with_ai_fixes',
]);
const CATEGORY_SCORE_TOOLS = new Set([
  'get_category_scores',
  'get_report_summary',
  'list_audit_categories',
]);
const CHART_TOOLS: Record<string, string> = {
  get_issue_priority_breakdown: 'Issues by priority',
  get_mime_type_breakdown: 'MIME types',
  get_title_length_distribution: 'Title length',
  get_domain_link_distribution: 'Top domains',
  get_outlink_distribution: 'Outlinks',
};
const GOOGLE_SUMMARY_TOOLS = new Set([
  'get_google_summary',
  'get_gsc_top_queries',
  'get_gsc_top_pages',
]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function blockKey(block: ChatBlock): string {
  switch (block.type) {
    case 'label_value_chart':
      return `label_value:${block.title}`;
    case 'health_trend':
      return block.categoryId ? `health_trend:${block.categoryId}` : 'health_trend';
    default:
      return block.type;
  }
}

function humanizeIssueType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseIssueRow(raw: unknown, defaults?: Partial<IssueRow>): IssueRow | null {
  const row = asRecord(raw);
  if (!row) return null;
  const type = String(row.type || row.issue_type || '');
  const category =
    String(row.category || row.name || defaults?.category || '') ||
    (type ? 'On-page SEO' : '');
  const message =
    String(row.message || row.description || defaults?.message || '') ||
    (type ? humanizeIssueType(type) : '');
  const url = String(row.url || row.page || defaults?.url || '');
  if (!url && !message) return null;
  return {
    priority: String(row.priority || defaults?.priority || 'Medium'),
    category,
    url,
    message,
  };
}

function parseCounts(raw: unknown): Record<string, number> {
  const obj = asRecord(raw);
  if (!obj) return {};
  const out: Record<string, number> = {};
  for (const key of ['Critical', 'High', 'Medium', 'Low']) {
    const n = Number(obj[key]);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

function parseCategories(catsRaw: unknown): CategoryScoreRow[] {
  if (!Array.isArray(catsRaw) || !catsRaw.length) return [];
  const out: CategoryScoreRow[] = [];
  for (const c of catsRaw) {
    const row = asRecord(c);
    if (!row) continue;
    const name = String(row.name || row.id || '');
    if (!name) continue;
    out.push({
      name,
      score: typeof row.score === 'number' ? row.score : undefined,
      issue_count: typeof row.issue_count === 'number' ? row.issue_count : undefined,
    });
  }
  return out;
}

function parseLabelValueItems(raw: unknown): { label: string; value: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const value = Number(row.value);
      if (!Number.isFinite(value)) return null;
      return { label: String(row.label ?? ''), value };
    })
    .filter((i): i is { label: string; value: number } => i != null && i.label !== '');
}

function parseCrawlSummary(raw: unknown): {
  totalUrls?: number;
  successRate?: number;
  statusItems: { label: string; value: number }[];
} {
  const crawl = asRecord(raw);
  if (!crawl) return { statusItems: [] };
  const totalUrls =
    crawl.total_urls != null && Number.isFinite(Number(crawl.total_urls))
      ? Number(crawl.total_urls)
      : undefined;
  const successRate =
    crawl.success_rate != null && Number.isFinite(Number(crawl.success_rate))
      ? Number(crawl.success_rate)
      : undefined;
  const statusItems: { label: string; value: number }[] = [];
  for (const [key, label] of [
    ['count_2xx', '2xx'],
    ['count_3xx', '3xx'],
    ['count_4xx', '4xx'],
    ['count_5xx', '5xx'],
  ] as const) {
    const n = Number(crawl[key]);
    if (Number.isFinite(n) && n > 0) statusItems.push({ label, value: n });
  }
  return { totalUrls, successRate, statusItems };
}

function blockFromSummary(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (!SUMMARY_TOOLS.has(name)) return null;
  if (result.error) return null;
  const counts = parseCounts(result.issue_counts);
  const crawl = parseCrawlSummary(result.crawl_summary);
  if (
    !Object.keys(counts).length &&
    result.total_issues == null &&
    result.health_score == null &&
    crawl.totalUrls == null
  ) {
    return null;
  }
  return {
    type: 'issue_summary',
    healthScore: typeof result.health_score === 'number' ? result.health_score : undefined,
    counts,
    siteName: result.site_name != null ? String(result.site_name) : undefined,
    totalIssues: typeof result.total_issues === 'number' ? result.total_issues : undefined,
    totalUrls: crawl.totalUrls,
    successRate: crawl.successRate,
  };
}

function blockFromReportCrawlStatus(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (name !== 'get_report_summary') return null;
  if (result.error) return null;
  const crawl = parseCrawlSummary(result.crawl_summary);
  if (!crawl.statusItems.length) return null;
  return {
    type: 'status_breakdown',
    items: crawl.statusItems,
    successRate: crawl.successRate,
    totalUrls: crawl.totalUrls,
  };
}

function blockFromIssueTable(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (!ISSUE_TABLE_TOOLS.has(name)) return null;
  if (result.error) return null;
  const issuesRaw = result.issues;
  if (!Array.isArray(issuesRaw) || !issuesRaw.length) return null;
  const defaultPriority = name === 'get_critical_issues' ? 'Critical' : undefined;
  const issues = issuesRaw
    .map((row) => parseIssueRow(row, defaultPriority ? { priority: defaultPriority } : undefined))
    .filter((r): r is IssueRow => r != null);
  if (!issues.length) return null;
  return {
    type: 'issue_table',
    issues,
    total: typeof result.total === 'number' ? result.total : issues.length,
    truncated: Boolean(result.truncated),
  };
}

function blockFromPriorityChart(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (name !== 'get_report_summary') return null;
  if (result.error) return null;
  const counts = parseCounts(result.issue_counts);
  const items = (['Critical', 'High', 'Medium', 'Low'] as const)
    .map((label) => ({ label, value: counts[label] || 0 }))
    .filter((i) => i.value > 0);
  if (!items.length) return null;
  return { type: 'label_value_chart', title: 'Issues by priority', items };
}

function blockFromCategoryScores(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (!CATEGORY_SCORE_TOOLS.has(name)) return null;
  if (result.error) return null;
  const categories = parseCategories(result.categories);
  if (!categories.length) return null;
  return {
    type: 'category_scores',
    healthScore: typeof result.health_score === 'number' ? result.health_score : undefined,
    categories,
  };
}

function blockFromLabelValue(name: string, result: Record<string, unknown>): ChatBlock | null {
  const title = CHART_TOOLS[name];
  if (!title) return null;
  if (result.error) return null;
  const items = parseLabelValueItems(result.items);
  if (!items.length) return null;
  return { type: 'label_value_chart', title, items };
}

function blockFromDepthDistribution(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (name !== 'get_depth_distribution') return null;
  if (result.error || result.missing) return null;
  const data = asRecord(result.data) ?? result;
  const byDepth = asRecord(data.by_depth) ?? data;
  const entries = Object.entries(byDepth)
    .map(([k, v]) => ({ depth: Number(k), value: Number(v) }))
    .filter((e) => Number.isFinite(e.depth) && Number.isFinite(e.value))
    .sort((a, b) => a.depth - b.depth);
  if (!entries.length) return null;
  return {
    type: 'label_value_chart',
    title: 'Crawl depth',
    items: entries.map((e) => ({ label: `Depth ${e.depth}`, value: e.value })),
  };
}

function blockFromStatusBreakdown(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (name !== 'get_status_code_breakdown') return null;
  if (result.error) return null;
  const counts = asRecord(result.status_counts);
  if (!counts) return null;
  const items = Object.entries(counts)
    .map(([label, value]) => ({ label, value: Number(value) }))
    .filter((i) => Number.isFinite(i.value) && i.value > 0);
  if (!items.length) return null;
  const summary = asRecord(result.summary);
  const successRate = summary?.success_rate != null ? Number(summary.success_rate) : undefined;
  const totalUrls = summary?.total_urls != null ? Number(summary.total_urls) : undefined;
  return {
    type: 'status_breakdown',
    items,
    successRate: Number.isFinite(successRate) ? successRate : undefined,
    totalUrls: Number.isFinite(totalUrls) ? totalUrls : undefined,
  };
}

function blockFromHealthTrend(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (name === 'get_health_history') {
    if (result.error) return null;
    const snapshots = result.snapshots;
    if (!Array.isArray(snapshots) || !snapshots.length) return null;
    const points: HealthTrendPoint[] = snapshots
      .map((raw) => {
        const row = asRecord(raw);
        if (!row) return null;
        const score = Number(row.health_score);
        if (!Number.isFinite(score)) return null;
        const at = String(row.generated_at || '');
        const label = at ? at.slice(0, 10) : '—';
        return { label, score };
      })
      .filter((p): p is HealthTrendPoint => p != null)
      .reverse();
    if (!points.length) return null;
    return { type: 'health_trend', title: 'Health score trend', points };
  }

  if (name === 'get_category_health_history') {
    if (result.error) return null;
    const pointsRaw = result.points;
    if (!Array.isArray(pointsRaw) || !pointsRaw.length) return null;
    const categoryId = result.category_id != null ? String(result.category_id) : undefined;
    const points: HealthTrendPoint[] = pointsRaw
      .map((raw) => {
        const row = asRecord(raw);
        if (!row) return null;
        const score = Number(categoryId ? row.category_score : row.health_score);
        if (!Number.isFinite(score)) return null;
        const at = String(row.generated_at || '');
        return { label: at ? at.slice(0, 10) : '—', score };
      })
      .filter((p): p is HealthTrendPoint => p != null)
      .reverse();
    if (!points.length) return null;
    return {
      type: 'health_trend',
      title: categoryId ? `Category trend (${categoryId})` : 'Health score trend',
      points,
      categoryId,
    };
  }

  return null;
}

function blockFromCompareCategory(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (name !== 'compare_category_deltas') return null;
  if (result.error) return null;
  const rowsRaw = result.category_scores;
  if (!Array.isArray(rowsRaw) || !rowsRaw.length) return null;
  const rows: CompareCategoryRow[] = [];
  for (const raw of rowsRaw) {
    const row = asRecord(raw);
    if (!row) continue;
    const name = String(row.name || row.id || '');
    if (!name) continue;
    rows.push({
      id: String(row.id || row.name || ''),
      name,
      current: row.current != null ? Number(row.current) : null,
      baseline: row.baseline != null ? Number(row.baseline) : null,
      delta: row.delta != null ? Number(row.delta) : null,
    });
  }
  if (!rows.length) return null;
  return { type: 'compare_category_deltas', rows };
}

function blockFromLighthouse(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (name !== 'get_lighthouse_summary') return null;
  if (result.error) return null;
  const summary = asRecord(result.summary);
  const cs = asRecord(summary?.category_scores) ?? asRecord(result.category_scores);
  if (!cs) return null;
  const scores: Record<string, number | null> = {};
  for (const [key, val] of Object.entries(cs)) {
    scores[key] = val != null && Number.isFinite(Number(val)) ? Number(val) : null;
  }
  if (!Object.keys(scores).length) return null;
  const poorRaw = result.poor_performance_pages;
  const poorPages: { url: string; performance: number }[] = [];
  if (Array.isArray(poorRaw)) {
    for (const raw of poorRaw.slice(0, 5)) {
      const row = asRecord(raw);
      if (!row) continue;
      const perf = Number(row.performance);
      if (!Number.isFinite(perf)) continue;
      poorPages.push({ url: String(row.url || ''), performance: perf });
    }
  }
  return { type: 'lighthouse_scores', scores, poorPages };
}

function blockFromGoogle(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (!GOOGLE_SUMMARY_TOOLS.has(name)) return null;
  if (result.error) return null;

  if (name === 'get_gsc_top_queries') {
    const queries = parseGoogleQueries(result.queries);
    if (!queries.length) return null;
    return { type: 'google_summary', queries, pages: [] };
  }

  if (name === 'get_gsc_top_pages') {
    const pages = parseGooglePages(result.pages);
    if (!pages.length) return null;
    return { type: 'google_summary', queries: [], pages };
  }

  const gsc = asRecord(result.gsc);
  const gscSummary = asRecord(gsc?.summary);
  const queries = parseGoogleQueries(gsc?.top_queries);
  const pages = parseGooglePages(gsc?.top_pages);
  if (!gscSummary && !queries.length && !pages.length) return null;
  return {
    type: 'google_summary',
    clicks: gscSummary?.clicks != null ? Number(gscSummary.clicks) : undefined,
    impressions: gscSummary?.impressions != null ? Number(gscSummary.impressions) : undefined,
    ctr: gscSummary?.ctr != null ? Number(gscSummary.ctr) : undefined,
    queries,
    pages,
  };
}

function parseGoogleQueries(raw: unknown): GoogleQueryRow[] {
  if (!Array.isArray(raw)) return [];
  const out: GoogleQueryRow[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const query = String(row.query || '');
    if (!query) continue;
    out.push({
      query,
      clicks: row.clicks != null ? Number(row.clicks) : undefined,
      impressions: row.impressions != null ? Number(row.impressions) : undefined,
    });
    if (out.length >= 10) break;
  }
  return out;
}

function parseGooglePages(raw: unknown): GooglePageRow[] {
  if (!Array.isArray(raw)) return [];
  const out: GooglePageRow[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const page = String(row.page || row.url || '');
    if (!page) continue;
    out.push({
      page,
      clicks: row.clicks != null ? Number(row.clicks) : undefined,
    });
    if (out.length >= 5) break;
  }
  return out;
}

type BlockParser = (name: string, result: Record<string, unknown>) => ChatBlock | null;

const BLOCK_PARSERS: BlockParser[] = [
  blockFromSummary,
  blockFromReportCrawlStatus,
  blockFromIssueTable,
  blockFromPriorityChart,
  blockFromCategoryScores,
  blockFromLabelValue,
  blockFromDepthDistribution,
  blockFromStatusBreakdown,
  blockFromHealthTrend,
  blockFromCompareCategory,
  blockFromLighthouse,
  blockFromGoogle,
];

export function deriveChatBlocks(toolActivity: ToolActivityItem[]): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  const seen = new Set<string>();

  for (const item of toolActivity) {
    if (item.status !== 'done' || !item.result) continue;
    const result = item.result;
    for (const parser of BLOCK_PARSERS) {
      const block = parser(item.name, result);
      if (!block) continue;
      const key = blockKey(block);
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push(block);
    }
  }

  return blocks;
}

export interface PersistedToolEvent {
  name: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export function toolEventsToActivity(
  toolResult: Record<string, unknown> | null | undefined,
): ToolActivityItem[] {
  if (!toolResult) return [];
  const events = toolResult.tool_events;
  if (!Array.isArray(events)) return [];
  return events.map((raw, i) => {
    const e = asRecord(raw) || {};
    return {
      id: `${String(e.name || 'tool')}-${i}`,
      name: String(e.name || 'tool'),
      args: asRecord(e.args) || undefined,
      result: asRecord(e.result) || undefined,
      status: 'done' as const,
    };
  });
}
