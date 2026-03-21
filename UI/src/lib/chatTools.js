/**
 * Read-only tools: SQLite + report JSON. Browser: TOOL_CALL: line; Model Lab: OpenAI/Gemini function calling.
 */
import { SchemaType, FunctionCallingMode } from '@google/generative-ai';
import {
  introspectDatabaseSchema,
  queryCrawlResults,
  queryEdgesSample,
  queryLighthouseAuditsSample,
  queryNodesSample,
  readReportPayloadFromDatabase,
} from './loadReportDb.js';

export const LAB_MAX_TOOL_ITERATIONS = 8;
export const LAB_MAX_TOOL_RESULT_CHARS = 12000;

export function truncateToolResultForApi(value, maxChars = LAB_MAX_TOOL_RESULT_CHARS) {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    if (s.length <= maxChars) return s;
    return `${s.slice(0, maxChars - 80)}\n… [truncated ${s.length - maxChars + 80} chars]`;
  } catch {
    return String(value).slice(0, maxChars);
  }
}

/** @type {Array<{ name: string, description: string, parameters: Record<string, unknown> }>} */
export const CHAT_TOOLS = [
  {
    name: 'get_database_schema',
    description:
      'Return SQLite table names, column types, and row counts. Use for structure; combine with other tools for row data.',
    parameters: { type: 'object', properties: {} },
  },
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
    name: 'nodes_sample',
    description: 'Return top nodes by inlink count (crawl_run_id, url, count).',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: '1–200, default 40' } },
    },
  },
  {
    name: 'lighthouse_audits_sample',
    description: 'Sample lh_audits rows (Lighthouse). Optional run_id filters by lighthouse run.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '1–200, default 25' },
        run_id: { type: 'number', description: 'Optional lighthouse_runs.id' },
      },
    },
  },
  {
    name: 'report_summary',
    description:
      'Return a small JSON summary from the report payload (site name, link counts, status_counts if present).',
    parameters: { type: 'object', properties: {} },
  },
];

export function getOpenAiToolsPayload() {
  return CHAT_TOOLS.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: normalizeOpenAiParameters(t.parameters),
    },
  }));
}

function normalizeOpenAiParameters(parameters) {
  const p = parameters && typeof parameters === 'object' ? parameters : { type: 'object', properties: {} };
  if (!p.type) p.type = 'object';
  if (!p.properties) p.properties = {};
  return p;
}

function jsonTypeToGemini(t) {
  switch (t) {
    case 'number':
      return SchemaType.NUMBER;
    case 'integer':
      return SchemaType.INTEGER;
    case 'boolean':
      return SchemaType.BOOLEAN;
    case 'array':
      return SchemaType.ARRAY;
    case 'object':
      return SchemaType.OBJECT;
    default:
      return SchemaType.STRING;
  }
}

export function chatToolParametersToGeminiSchema(parameters) {
  const p = normalizeOpenAiParameters({ ...parameters });
  const props = /** @type {Record<string, unknown>} */ (p.properties || {});
  /** @type {Record<string, import('@google/generative-ai').FunctionDeclarationSchemaProperty>} */
  const properties = {};
  for (const [k, v] of Object.entries(props)) {
    if (!v || typeof v !== 'object') continue;
    const spec = /** @type {{ type?: string, description?: string }} */ (v);
    properties[k] = {
      type: jsonTypeToGemini(spec.type),
      description: spec.description,
    };
  }
  return {
    type: SchemaType.OBJECT,
    properties,
    required: Array.isArray(p.required) ? p.required : undefined,
  };
}

export function buildGeminiToolsArray() {
  const functionDeclarations = CHAT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: chatToolParametersToGeminiSchema(t.parameters),
  }));
  return [{ functionDeclarations }];
}

function restSchemaTypeFromJson(t) {
  const m = String(t || 'string').toLowerCase();
  if (m === 'number') return 'NUMBER';
  if (m === 'integer') return 'INTEGER';
  if (m === 'boolean') return 'BOOLEAN';
  if (m === 'array') return 'ARRAY';
  if (m === 'object') return 'OBJECT';
  return 'STRING';
}

/**
 * Plain JSON for Gemini REST `generateContent` `tools` field (no SDK SchemaType enums).
 */
export function buildGeminiToolsJsonForRest() {
  const functionDeclarations = CHAT_TOOLS.map((t) => {
    const p = normalizeOpenAiParameters({ ...t.parameters });
    const props = /** @type {Record<string, unknown>} */ (p.properties || {});
    /** @type {Record<string, { type: string, description?: string }>} */
    const properties = {};
    for (const [k, v] of Object.entries(props)) {
      if (!v || typeof v !== 'object') continue;
      const spec = /** @type {{ type?: string, description?: string }} */ (v);
      properties[k] = {
        type: restSchemaTypeFromJson(spec.type),
        ...(spec.description ? { description: spec.description } : {}),
      };
    }
    return {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'OBJECT',
        properties,
        ...(Array.isArray(p.required) && p.required.length ? { required: p.required } : {}),
      },
    };
  });
  return [{ functionDeclarations }];
}

export function buildGeminiToolConfig() {
  return {
    functionCallingConfig: {
      mode: FunctionCallingMode.AUTO,
    },
  };
}

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

export function parseUserToolCommand(raw) {
  const text = String(raw ?? '').trim();
  const m = text.match(/^\/tool(?:\s+(\w+)(?:\s+([\s\S]*))?)?$/i);
  if (!m) return null;
  const sub = (m[1] || '').toLowerCase();
  const rest = (m[2] || '').trim();

  if (!sub || sub === 'help' || sub === 'list') {
    return { name: 'help', args: {} };
  }

  if (sub === 'schema' || sub === 'get_database_schema') {
    return { name: 'get_database_schema', args: {} };
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

  if (sub === 'nodes_sample' || sub === 'nodes') {
    const limit = parseInt(rest, 10);
    return { name: 'nodes_sample', args: { limit: Number.isFinite(limit) ? limit : 40 } };
  }

  if (sub === 'lighthouse_audits_sample' || sub === 'lh_audits' || sub === 'lh') {
    const parts = rest.split(/\s+/).filter(Boolean);
    const limit = parseInt(parts[0], 10);
    const runId = parts.length > 1 ? parseInt(parts[1], 10) : NaN;
    const args = { limit: Number.isFinite(limit) ? limit : 25 };
    if (Number.isFinite(runId)) args.run_id = runId;
    return { name: 'lighthouse_audits_sample', args };
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

export function executeChatTool(name, args, ctx) {
  const { sqlDb, data } = ctx;
  const allowed = new Set(CHAT_TOOLS.map((t) => t.name));

  if (name === 'help') {
    return {
      message:
        'Use /tool help. Commands: schema | crawl_count | crawl_sample [n] | status_counts | search_urls <text> | edges_sample [n] | nodes_sample [n] | lh_audits [limit] [run_id] | report_summary',
    };
  }

  if (!allowed.has(name)) {
    return { error: `Unknown tool: ${name}` };
  }

  if (!sqlDb && name !== 'report_summary') {
    return { error: 'No SQLite database loaded for this report.' };
  }

  if (name === 'get_database_schema') {
    return sqlDb ? introspectDatabaseSchema(sqlDb) : { tables: [] };
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

  if (name === 'nodes_sample') {
    const lim = Math.min(200, Math.max(1, Number(args.limit) || 40));
    const rows = sqlDb ? queryNodesSample(sqlDb, lim) : [];
    return { rows, count: rows.length };
  }

  if (name === 'lighthouse_audits_sample') {
    const lim = Math.min(200, Math.max(1, Number(args.limit) || 25));
    const runIdRaw = args.run_id;
    const runId =
      runIdRaw != null && runIdRaw !== '' && Number.isFinite(Number(runIdRaw)) ? Number(runIdRaw) : null;
    const rows = sqlDb ? queryLighthouseAuditsSample(sqlDb, lim, runId) : [];
    return { rows, count: rows.length, run_id_filter: runId };
  }

  if (name === 'report_summary') {
    let payload = data;
    if (!payload && sqlDb) {
      try {
        payload = readReportPayloadFromDatabase(sqlDb, null);
      } catch {
        return { error: 'No report_payload JSON in this database.' };
      }
    }
    if (!payload) {
      return { error: 'No report JSON available.' };
    }
    const links = Array.isArray(payload.links) ? payload.links : [];
    return {
      site_name: payload.site_name ?? null,
      report_title: payload.report_title ?? null,
      links_total: links.length,
      status_counts: payload.status_counts ?? null,
      summary: payload.summary ?? null,
    };
  }

  return { error: 'unhandled' };
}

export function mergeGenerationIntoThread(baseThread, out) {
  const first = Array.isArray(out) ? out[0] : out;
  const gen = first?.generated_text;
  if (Array.isArray(gen) && gen.length > 0) return gen;
  const text = extractAssistantTextFromGeneration(out);
  if (!text) return baseThread;
  return [...baseThread, { role: 'assistant', content: text }];
}
