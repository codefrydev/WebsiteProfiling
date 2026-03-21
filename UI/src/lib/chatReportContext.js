import { queryCrawlResults, queryEdgesSample } from './loadReportDb.js';

/**
 * Shrink the report JSON to a chat-friendly shape (still large; further capped when stringified).
 * @param {object|null|undefined} data
 * @returns {Record<string, unknown>}
 */
function pruneReportPayload(data) {
  if (!data || typeof data !== 'object') return { _note: 'No JSON report payload loaded.' };

  const links = Array.isArray(data.links) ? data.links : [];
  const categories = Array.isArray(data.categories) ? data.categories : [];

  return {
    site_name: data.site_name,
    report_title: data.report_title,
    report_generated_at: data.report_generated_at,
    summary: data.summary,
    seo_health: data.seo_health,
    status_counts: data.status_counts,
    links_total: links.length,
    links_sample: links.slice(0, 50).map((l) => ({
      url: l.url,
      title: l.title,
      status: l.status,
      word_count: l.word_count,
      depth: l.depth,
      inlinks: l.inlinks,
      outlinks: l.outlinks,
    })),
    categories: categories.map((c) => ({
      name: c.name ?? c.label ?? c.title,
      score: c.score,
      issues: (c.issues ?? []).slice(0, 12).map((i) => ({
        message: i.message,
        url: i.url,
        priority: i.priority,
        recommendation: i.recommendation,
      })),
      recommendations: (c.recommendations ?? []).slice(0, 8),
    })),
    security_findings: (data.security_findings ?? []).slice(0, 40),
    redirects_sample: (data.redirects ?? []).slice(0, 30),
    orphan_urls_sample: (data.orphan_urls ?? []).slice(0, 40),
    content_analytics: data.content_analytics,
    social_coverage: data.social_coverage,
    tech_stack_summary: data.tech_stack_summary,
    top_pages: (data.top_pages ?? []).slice(0, 30),
    content_duplicates_sample: (data.content_duplicates ?? []).slice(0, 15),
    anomalies_sample: (data.anomalies ?? []).slice(0, 15),
    keyword_opportunities_sample: (data.keyword_opportunities ?? []).slice(0, 20),
  };
}

function formatCrawlRow(row) {
  const parts = [`url: ${row.url || ''}`];
  if (row.title != null) parts.push(`title: ${String(row.title).slice(0, 200)}`);
  if (row.status != null) parts.push(`status: ${row.status}`);
  if (row.word_count != null) parts.push(`words: ${row.word_count}`);
  if (row.h1 != null) parts.push(`h1: ${String(row.h1).slice(0, 160)}`);
  if (row.meta_description != null) parts.push(`meta: ${String(row.meta_description).slice(0, 200)}`);
  if (row.content_excerpt != null) parts.push(`excerpt: ${String(row.content_excerpt).slice(0, 320)}`);
  return parts.join(' | ') + '\n';
}

/**
 * Build a single text block for the LLM: pruned JSON + SQLite crawl_results + edges.
 * @param {{ sqlDb: import('sql.js').Database | null, data: object | null, maxChars?: number }} opts
 * @returns {string}
 */
export function buildReportContextForChat({ sqlDb, data, maxChars = 3200 }) {
  const parts = [];
  let used = 0;

  const push = (chunk) => {
    if (!chunk) return;
    const s = typeof chunk === 'string' ? chunk : '';
    const room = maxChars - used;
    if (room <= 0) return;
    if (s.length <= room) {
      parts.push(s);
      used += s.length;
      return;
    }
    parts.push(s.slice(0, Math.max(0, room - 32)) + '\n[… truncated …]\n');
    used = maxChars;
  };

  push('### Report JSON (subset)\n');
  try {
    const pruned = pruneReportPayload(data);
    let json = JSON.stringify(pruned, null, 2);
    const jsonBudget = Math.min(1800, Math.floor(maxChars * 0.5));
    if (json.length > jsonBudget) {
      json = json.slice(0, jsonBudget) + '\n[… JSON truncated …]\n';
    }
    push(json);
    push('\n');
  } catch {
    push('(Could not serialize report JSON.)\n\n');
  }

  if (sqlDb) {
    push('### SQLite table: crawl_results\n');
    const rows = queryCrawlResults(sqlDb, 5000);
    push(`(${rows.length} rows; fields may include url, title, status, word_count, h1, meta_description, content_excerpt)\n`);
    for (const row of rows) {
      if (used >= maxChars - 64) {
        push('\n[… remaining crawl rows omitted …]\n');
        break;
      }
      push(formatCrawlRow(row));
    }

    push('\n### SQLite table: edges (internal links sample)\n');
    const edges = queryEdgesSample(sqlDb, 200);
    for (const e of edges) {
      if (used >= maxChars - 32) break;
      push(`${e.from_url} -> ${e.to_url}\n`);
    }
  } else {
    push('\n(No SQLite handle — only JSON above.)\n');
  }

  let out = parts.join('');
  if (out.length > maxChars) {
    out = out.slice(0, maxChars) + '\n[… context truncated …]';
  }
  return out.trim();
}
