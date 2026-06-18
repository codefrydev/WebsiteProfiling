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
    }
  | {
      type: 'file_download';
      files: { label?: string; url: string; mime_type?: string; filename: string }[];
    }
  | {
      type: 'image_audit_summary';
      imagesTotal: number;
      pagesMissingAlt: number;
      pagesWithoutLazy: number;
      pagesMissingDimensions: number;
      ogCoveragePct?: number;
      ogMissingCount?: number;
      lighthouseImageDiagnostics: number;
      inventoryAvailable: boolean;
      inventoryProbed?: number;
      inventoryFailed?: number;
    }
  | {
      type: 'image_pages_table';
      title: string;
      pages: { url: string; title?: string; detail?: string }[];
      total?: number;
      truncated?: boolean;
    }
  | {
      type: 'image_lighthouse_list';
      items: { title: string; auditId?: string; url?: string; displayValue?: string }[];
      total: number;
    }
  | {
      type: 'image_attention_table';
      title: string;
      items: {
        url?: string;
        pageUrl?: string;
        sizeBytes?: number | null;
        contentType?: string;
        reasons: string[];
        score?: number;
      }[];
      total?: number;
      truncated?: boolean;
    }
  | {
      type: 'tool_status';
      variant: 'error' | 'empty' | 'missing_data';
      toolName: string;
      message: string;
      hint?: string;
    }
  | {
      type: 'tool_truncated';
      toolName: string;
      shown: number;
      total: number;
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
const EXPORT_TOOLS = new Set([
  'export_audit_report',
  'export_compare_csv',
  'export_list_as_csv',
]);

const IMAGE_SUMMARY_TOOL = 'get_image_audit_summary';

const IMAGE_PREVIEW_TITLES: Record<string, string> = {
  missing_alt: 'Pages missing alt text',
  missing_lazy: 'Pages without lazy-loaded images',
  missing_dimensions: 'Pages missing width/height',
  missing_og: 'Pages missing OG image',
};

const IMAGE_PAGE_TABLE_TOOLS: Record<string, string> = {
  list_pages_with_missing_alt: IMAGE_PREVIEW_TITLES.missing_alt,
  list_pages_without_lazy_images: IMAGE_PREVIEW_TITLES.missing_lazy,
  list_pages_with_images_missing_dimensions: IMAGE_PREVIEW_TITLES.missing_dimensions,
  list_pages_missing_og_image: IMAGE_PREVIEW_TITLES.missing_og,
};

const IMAGE_INVENTORY_TABLE_TOOLS: Record<string, string> = {
  list_largest_images: 'Largest images',
  list_unoptimized_images: 'Unoptimized images',
};

const IMAGE_ATTENTION_TOOL = 'list_images_needing_attention';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function blockKey(block: ChatBlock): string {
  switch (block.type) {
    case 'label_value_chart':
      return `label_value:${block.title}`;
    case 'health_trend':
      return block.categoryId ? `health_trend:${block.categoryId}` : 'health_trend';
    case 'file_download':
      return `file_download:${block.files.map((f) => f.filename).join(',')}`;
    case 'image_pages_table':
      return `image_pages:${block.title}`;
    case 'image_attention_table':
      return `image_attention:${block.title}`;
    case 'image_lighthouse_list':
      return 'image_lighthouse';
    case 'tool_status':
      return `tool_status:${block.toolName}:${block.variant}`;
    case 'tool_truncated':
      return `tool_truncated:${block.toolName}`;
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

function blockFromImageSummaryPreviews(
  name: string,
  result: Record<string, unknown>,
): ChatBlock[] | null {
  if (name !== IMAGE_SUMMARY_TOOL || result.error) return null;
  const previews = asRecord(result.page_previews);
  if (!previews) return null;
  const blocks: ChatBlock[] = [];
  for (const [key, title] of Object.entries(IMAGE_PREVIEW_TITLES)) {
    const bucket = asRecord(previews[key]);
    const pagesRaw = bucket?.pages;
    if (!Array.isArray(pagesRaw) || !pagesRaw.length) continue;
    const pages = pagesRaw
      .map((raw) => {
        const row = asRecord(raw);
        if (!row) return null;
        const url = String(row.url || '').trim();
        if (!url) return null;
        return {
          url,
          title: row.title != null ? String(row.title) : undefined,
          detail: pageDetailFromRow(row),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);
    if (!pages.length) continue;
    blocks.push({
      type: 'image_pages_table',
      title,
      pages,
      total: typeof bucket?.total === 'number' ? bucket.total : pages.length,
      truncated: Boolean(bucket?.truncated),
    });
  }
  const lhRaw = result.lighthouse_image_previews;
  if (Array.isArray(lhRaw) && lhRaw.length) {
    const items = lhRaw
      .map((raw) => {
        const row = asRecord(raw);
        if (!row) return null;
        return {
          title: String(row.title || row.lighthouse_audit_id || 'Lighthouse'),
          auditId: row.lighthouse_audit_id != null ? String(row.lighthouse_audit_id) : undefined,
          url: row.url != null ? String(row.url) : undefined,
          displayValue: row.display_value != null ? String(row.display_value) : undefined,
        };
      })
      .filter((i): i is NonNullable<typeof i> => i != null);
    if (items.length) {
      blocks.push({
        type: 'image_lighthouse_list',
        items,
        total: Number(result.lighthouse_image_diagnostics) || items.length,
      });
    }
  }
  return blocks.length ? blocks : null;
}

function blockFromImageSummary(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (name !== IMAGE_SUMMARY_TOOL) return null;
  if (result.error) return null;
  const inv = asRecord(result.image_inventory_summary);
  return {
    type: 'image_audit_summary',
    imagesTotal: Number(result.images_total_crawled) || 0,
    pagesMissingAlt: Number(result.pages_missing_alt) || 0,
    pagesWithoutLazy: Number(result.pages_without_lazy_images) || 0,
    pagesMissingDimensions: Number(result.pages_missing_image_dimensions) || 0,
    ogCoveragePct:
      result.og_image_coverage_pct != null ? Number(result.og_image_coverage_pct) : undefined,
    ogMissingCount:
      result.og_image_missing_count != null ? Number(result.og_image_missing_count) : undefined,
    lighthouseImageDiagnostics: Number(result.lighthouse_image_diagnostics) || 0,
    inventoryAvailable: Boolean(result.image_inventory_available),
    inventoryProbed: inv?.probed != null ? Number(inv.probed) : undefined,
    inventoryFailed: inv?.failed != null ? Number(inv.failed) : undefined,
  };
}

function pageDetailFromRow(row: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  if (row.images_without_alt != null) parts.push(`${row.images_without_alt} missing alt`);
  if (row.img_without_lazy != null) parts.push(`${row.img_without_lazy} without lazy load`);
  if (row.img_without_dimensions != null) parts.push(`${row.img_without_dimensions} missing dimensions`);
  if (row.images_total != null && parts.length) {
    return `${parts.join(' · ')} (${row.images_total} total)`;
  }
  return parts.join(' · ') || undefined;
}

function blockFromImagePagesTable(name: string, result: Record<string, unknown>): ChatBlock | null {
  const title = IMAGE_PAGE_TABLE_TOOLS[name];
  if (!title) return null;
  if (result.error) return null;
  const pagesRaw = result.pages;
  if (!Array.isArray(pagesRaw) || !pagesRaw.length) return null;
  const pages = pagesRaw
    .map((raw) => {
      const row = asRecord(raw);
      if (!row) return null;
      const url = String(row.url || '').trim();
      if (!url) return null;
      return {
        url,
        title: row.title != null ? String(row.title) : undefined,
        detail: pageDetailFromRow(row),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p != null);
  if (!pages.length) return null;
  return {
    type: 'image_pages_table',
    title,
    pages,
    total: typeof result.total === 'number' ? result.total : pages.length,
    truncated: Boolean(result.truncated),
  };
}

function formatBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function blockFromImageInventoryTable(name: string, result: Record<string, unknown>): ChatBlock | null {
  const title = IMAGE_INVENTORY_TABLE_TOOLS[name];
  if (!title) return null;
  if (result.error) return null;
  const itemsRaw = result.items;
  if (!Array.isArray(itemsRaw) || !itemsRaw.length) return null;
  const items = itemsRaw
    .map((raw) => {
      const row = asRecord(raw);
      if (!row) return null;
      const url = String(row.url || '').trim();
      if (!url) return null;
      const size = row.size_bytes != null ? Number(row.size_bytes) : null;
      const ctype = row.content_type != null ? String(row.content_type) : undefined;
      const reasons: string[] = [];
      if (row.reason) reasons.push(String(row.reason));
      if (size != null && Number.isFinite(size)) {
        reasons.push(formatBytes(size));
      }
      if (ctype) reasons.push(ctype);
      return {
        url,
        sizeBytes: size,
        contentType: ctype,
        reasons,
        score: row.attention_score != null ? Number(row.attention_score) : undefined,
      };
    })
    .filter((i): i is NonNullable<typeof i> => i != null);
  if (!items.length) return null;
  return {
    type: 'image_attention_table',
    title,
    items,
    total: typeof result.total === 'number' ? result.total : items.length,
    truncated: Boolean(result.truncated),
  };
}

function blockFromImageAttention(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (name !== IMAGE_ATTENTION_TOOL) return null;
  if (result.error) return null;
  const itemsRaw = result.items;
  if (!Array.isArray(itemsRaw) || !itemsRaw.length) return null;
  const items = itemsRaw
    .map((raw) => {
      const row = asRecord(raw);
      if (!row) return null;
      const reasons = Array.isArray(row.reasons)
        ? row.reasons.map((r) => String(r)).filter(Boolean)
        : [];
      if (!reasons.length && !row.url && !row.page_url) return null;
      return {
        url: row.url != null ? String(row.url) : undefined,
        pageUrl: row.page_url != null ? String(row.page_url) : undefined,
        sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : null,
        contentType: row.content_type != null ? String(row.content_type) : undefined,
        reasons,
        score: row.attention_score != null ? Number(row.attention_score) : undefined,
      };
    })
    .filter((i): i is NonNullable<typeof i> => i != null);
  if (!items.length) return null;
  return {
    type: 'image_attention_table',
    title: 'Images needing attention',
    items,
    total: typeof result.total === 'number' ? result.total : items.length,
    truncated: Boolean(result.truncated),
  };
}

function blockFromFileDownload(name: string, result: Record<string, unknown>): ChatBlock | null {
  if (!EXPORT_TOOLS.has(name)) return null;
  if (result.error) return null;
  const artifactId = String(result.artifact_id || '');
  const filename = String(result.filename || 'export.bin');
  if (!artifactId) return null;
  const mimeType = result.mime_type != null ? String(result.mime_type) : undefined;
  const fmt = result.format != null ? String(result.format).toUpperCase() : undefined;
  return {
    type: 'file_download',
    files: [
      {
        filename,
        mime_type: mimeType,
        url: `/api/chat/artifacts/${artifactId}`,
        label: fmt ? `Download ${fmt}` : undefined,
      },
    ],
  };
}

type BlockParser = (name: string, result: Record<string, unknown>) => ChatBlock | ChatBlock[] | null;

const BLOCK_PARSERS: BlockParser[] = [
  blockFromFileDownload,
  blockFromImageSummary,
  blockFromImageSummaryPreviews,
  blockFromImagePagesTable,
  blockFromImageInventoryTable,
  blockFromImageAttention,
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
      const parsed = parser(item.name, result);
      if (!parsed) continue;
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const block of candidates) {
        const key = blockKey(block);
        if (seen.has(key)) continue;
        seen.add(key);
        blocks.push(block);
      }
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
