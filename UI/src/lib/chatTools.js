/**
 * Read-only "tools" for the browser assistant: SQLite + report JSON.
 * The on-device model can request tools via a single line: TOOL_CALL:{"name":"...","args":{...}}
 * Users can also run /tool … commands (see parseUserToolCommand).
 */
import { queryCrawlResults, queryEdgesSample } from './loadReportDb.js';

/** @type {Array<{ name: string, description: string, parameters: Record<string, unknown> }>} */
export const CHAT_TOOLS = [
  {
    name: 'crawl_count',
    description: 'Return how many rows are in crawl_results.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'crawl_sample',
    description: 'Return a sample of crawl rows (url, title, status, word_count, etc.).',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: '1–100, default 10' } },
    },
  },
  {
    name: 'status_counts',
    description: 'Count crawl rows grouped by HTTP status code.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'search_urls',
    description: 'Find crawl rows whose url contains a substring (case-insensitive).',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'edges_sample',
    description: 'Return a sample of internal link edges (from_url → to_url).',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: '1–100, default 15' } },
    },
  },
  {
    name: 'report_summary',
    description: 'Return a small JSON summary from the report payload (site name, link counts, status_counts if present).',
    parameters: { type: 'object', properties: {} },
  },
];

export function buildChatToolsPrompt() {
  const lines = CHAT_TOOLS.map(
    (t) => `- ${t.name}: ${t.description} Args: ${JSON.stringify(t.parameters.properties || {})}`
  );
  return (
    'Tools (read-only, real data from this audit):\n' +
    lines.join('\n') +
    '\n\nTo request a tool, reply with exactly one line and nothing else:\n' +
    'TOOL_CALL:{"name":"<tool_name>","args":{...}}\n' +
    'After you receive a tool result in the next message, answer in plain language using that data.'
  );
}

/**
 * @param {unknown} out
 * @returns {string}
 */
export function extractAssistantTextFromGeneration(out) {
  const first = Array.isArray(out) ? out[0] : out;
  const gen = first?.generated_text;
  if (Array.isArray(gen)) {
    const last = gen[gen.length - 1];
    return last?.role === 'assistant' ? String(last.content ?? '').trim() : '';
  }
  if (typeof gen === 'string') return gen.trim();
  return '';
}

/**
 * @param {string} text
 * @returns {{ name: string, args: Record<string, unknown> } | null}
 */
export function parseToolCallFromAssistant(text) {
  const s = String(text ?? '').trim();
  const m = s.match(/TOOL_CALL:\s*(\{[\s\S]*\})\s*$/m) || s.match(/TOOL_CALL:\s*(\{[\s\S]*\})/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1]);
    if (obj && typeof obj.name === 'string') {
      const args = obj.args && typeof obj.args === 'object' && obj.args !== null ? obj.args : {};
      return { name: obj.name, args };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {string} raw
 * @returns {{ name: string, args: Record<string, unknown> } | null}
 */
export function parseUserToolCommand(raw) {
  const text = String(raw ?? '').trim();
  const m = text.match(/^\/tool(?:\s+(\w+)(?:\s+([\s\S]*))?)?$/i);
  if (!m) return null;
  const sub = (m[1] || '').toLowerCase();
  const rest = (m[2] || '').trim();

  if (!sub || sub === 'help' || sub === 'list') {
    return { name: 'help', args: {} };
  }

  if (sub === 'crawl_count' || sub === 'count') {
    return { name: 'crawl_count', args: {} };
  }

  if (sub === 'crawl_sample' || sub === 'sample') {
    const limit = parseInt(rest, 10);
    return { name: 'crawl_sample', args: { limit: Number.isFinite(limit) ? limit : 10 } };
  }

  if (sub === 'status_counts' || sub === 'status') {
    return { name: 'status_counts', args: {} };
  }

  if (sub === 'search_urls' || sub === 'search') {
    return { name: 'search_urls', args: { query: rest } };
  }

  if (sub === 'edges_sample' || sub === 'edges') {
    const limit = parseInt(rest, 10);
    return { name: 'edges_sample', args: { limit: Number.isFinite(limit) ? limit : 15 } };
  }

  if (sub === 'report_summary' || sub === 'summary') {
    return { name: 'report_summary', args: {} };
  }

  return { name: '__unknown__', args: { command: sub } };
}

function crawlRowCount(db) {
  try {
    const chk = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='crawl_results'");
    if (!chk.length || !chk[0].values.length) return 0;
    const r = db.exec('SELECT COUNT(*) AS c FROM crawl_results');
    if (!r.length || !r[0].values.length) return 0;
    const idx = r[0].columns.indexOf('c');
    const row = r[0].values[0];
    return Number(row[idx >= 0 ? idx : 0]) || 0;
  } catch {
    return 0;
  }
}

function statusCountsFromDb(db) {
  try {
    const chk = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='crawl_results'");
    if (!chk.length || !chk[0].values.length) return {};
    const r = db.exec('SELECT status, COUNT(*) AS c FROM crawl_results GROUP BY status');
    if (!r.length) return {};
    const cols = r[0].columns;
    const si = cols.indexOf('status');
    const ci = cols.indexOf('c');
    const out = {};
    for (const row of r[0].values) {
      const st = row[si >= 0 ? si : 0];
      const c = row[ci >= 0 ? ci : 1];
      out[String(st ?? '')] = Number(c) || 0;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} args
 * @param {{ sqlDb: import('sql.js').Database | null, data: object | null }} ctx
 * @returns {unknown}
 */
export function executeChatTool(name, args, ctx) {
  const { sqlDb, data } = ctx;
  const allowed = new Set(CHAT_TOOLS.map((t) => t.name));

  if (name === 'help') {
    return {
      message:
        'Use /tool help for this list. Commands: /tool crawl_count | /tool crawl_sample [n] | /tool status_counts | /tool search_urls <text> | /tool edges_sample [n] | /tool report_summary',
    };
  }

  if (!allowed.has(name)) {
    return { error: `Unknown tool: ${name}` };
  }

  if (!sqlDb && name !== 'report_summary') {
    return { error: 'No SQLite database loaded for this report.' };
  }

  if (name === 'crawl_count') {
    return { count: sqlDb ? crawlRowCount(sqlDb) : 0 };
  }

  if (name === 'crawl_sample') {
    const lim = Math.min(100, Math.max(1, Number(args.limit) || 10));
    const rows = sqlDb ? queryCrawlResults(sqlDb, lim) : [];
    return { rows, count: rows.length };
  }

  if (name === 'status_counts') {
    return { by_status: sqlDb ? statusCountsFromDb(sqlDb) : {} };
  }

  if (name === 'search_urls') {
    const q = String(args.query ?? '').trim().toLowerCase();
    if (!q) return { error: 'search_urls requires a non-empty query.' };
    const rows = sqlDb ? queryCrawlResults(sqlDb, 5000) : [];
    const filtered = rows.filter((r) => String(r.url ?? '').toLowerCase().includes(q)).slice(0, 50);
    return { query: q, rows: filtered, count: filtered.length };
  }

  if (name === 'edges_sample') {
    const lim = Math.min(100, Math.max(1, Number(args.limit) || 15));
    const edges = sqlDb ? queryEdgesSample(sqlDb, lim) : [];
    return { edges, count: edges.length };
  }

  if (name === 'report_summary') {
    const links = Array.isArray(data?.links) ? data.links : [];
    return {
      site_name: data?.site_name ?? null,
      report_title: data?.report_title ?? null,
      links_total: links.length,
      status_counts: data?.status_counts ?? null,
      summary: data?.summary ?? null,
    };
  }

  return { error: 'unhandled' };
}

/**
 * @param {unknown[]} baseThread
 * @param {unknown} out
 * @returns {unknown[]}
 */
export function mergeGenerationIntoThread(baseThread, out) {
  const first = Array.isArray(out) ? out[0] : out;
  const gen = first?.generated_text;
  if (Array.isArray(gen) && gen.length > 0) return gen;
  const text = extractAssistantTextFromGeneration(out);
  if (!text) return baseThread;
  return [...baseThread, { role: 'assistant', content: text }];
}
