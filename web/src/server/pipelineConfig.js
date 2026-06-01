/**
 * Pipeline config stored in report.db (pipeline_config table).
 *
 * report.db is the single source of truth. A shadow `pipeline-config.txt` is
 * written next to report.db on every Save/Run so `python -m src --config
 * pipeline-config.txt` and human inspection still work.
 *
 * Load order when pipeline_config table is empty / missing:
 *   1. Shadow pipeline-config.txt (next to report.db)
 *   2. Schema defaults
 *
 * Concurrency: save only happens while the FAB busy-gate is held, so
 * Node-write + Python-read are always sequential. No additional file lock in v1.
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { PIPELINE_CONFIG_SECTIONS, ALL_SCHEMA_KEYS, getFieldByKey } from '@/lib/pipelineConfigSchema';

const WEB_CWD = process.cwd();
const DEFAULT_REPO_ROOT =
  process.env.WEBSITE_PROFILING_ROOT || path.resolve(WEB_CWD, '..');

// ─── Path helpers ─────────────────────────────────────────────────────────────

/** Absolute path to report.db (mirrors reportSqlite.js). */
export function getReportDbPath() {
  return process.env.REPORT_DB_PATH || path.join(DEFAULT_REPO_ROOT, 'report.db');
}

/** Shadow key=value file written next to report.db for CLI back-compat. */
export function getShadowConfigPath() {
  const dbPath = getReportDbPath();
  return path.join(path.dirname(dbPath), 'pipeline-config.txt');
}

// ─── sql.js helpers ───────────────────────────────────────────────────────────

// Minimal inline schema DDL kept in sync with Python storage.py.
const PIPELINE_CONFIG_DDL = `
  CREATE TABLE IF NOT EXISTS pipeline_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    is_unknown INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
`;

/**
 * Open report.db with sql.js. Creates the file + pipeline_config table if absent.
 * Caller must call db.close() and, if they wrote data, call persistDb(db).
 */
async function openDb() {
  const SQL = await initSqlJs();
  const dbPath = getReportDbPath();
  let buf;
  if (fs.existsSync(dbPath)) {
    buf = fs.readFileSync(dbPath);
  }
  const db = buf ? new SQL.Database(new Uint8Array(buf)) : new SQL.Database();
  // Ensure the pipeline_config table exists (idempotent)
  db.run(PIPELINE_CONFIG_DDL);
  return db;
}

/**
 * Write the in-memory sql.js DB back to disk atomically (temp+rename).
 * @param {import('sql.js').Database} db
 */
function persistDb(db) {
  const dbPath = getReportDbPath();
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const buf = db.export();
  const tmp = dbPath + '.tmp';
  fs.writeFileSync(tmp, Buffer.from(buf));
  fs.renameSync(tmp, dbPath);
}

// ─── Parser (mirrors Python config.py) ────────────────────────────────────────

/**
 * Parse `key = value` / `key: value` text (# comments, blank lines ignored).
 * @param {string} raw
 * @returns {Record<string, string>}
 */
export function parseInputTxt(raw) {
  const result = {};
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    let k, v;
    if (line.includes('=')) {
      const sep = line.indexOf('=');
      k = line.slice(0, sep).trim();
      v = line.slice(sep + 1).trim();
    } else if (line.includes(':')) {
      const sep = line.indexOf(':');
      k = line.slice(0, sep).trim();
      v = line.slice(sep + 1).trim();
    } else {
      continue;
    }
    if (k) result[k] = v;
  }
  return result;
}

// ─── Schema coercion ──────────────────────────────────────────────────────────

function buildDefaults() {
  const out = {};
  for (const section of PIPELINE_CONFIG_SECTIONS) {
    for (const f of section.fields) {
      if (f.type === 'bool') {
        out[f.key] = f.defaultValue;
      } else if (f.type === 'tristate') {
        out[f.key] = f.defaultValue ?? 'auto';
      } else {
        out[f.key] = String(f.defaultValue ?? '');
      }
    }
  }
  return out;
}

/**
 * Merge a raw {key: rawString} map into typed state + separate unknownKeys.
 * @param {Record<string, string>} parsedMap
 * @returns {{ state: Record<string, string | boolean>, unknownKeys: Array<{key: string, value: string}> }}
 */
export function applySchemaDefaults(parsedMap) {
  const state = buildDefaults();
  const unknownKeys = [];

  for (const [key, rawValue] of Object.entries(parsedMap)) {
    if (!ALL_SCHEMA_KEYS.has(key)) {
      unknownKeys.push({ key, value: rawValue });
      continue;
    }
    const field = getFieldByKey(key);
    if (!field) continue;

    if (field.type === 'bool') {
      state[key] = ['true', '1', 'yes'].includes(rawValue.toLowerCase());
    } else if (field.type === 'tristate') {
      const lv = rawValue.toLowerCase();
      if (lv === 'true' || lv === '1' || lv === 'yes') state[key] = 'true';
      else if (lv === 'false' || lv === '0' || lv === 'no') state[key] = 'false';
      else state[key] = 'auto';
    } else {
      state[key] = rawValue;
    }
  }

  return { state, unknownKeys };
}

// ─── Serialization (shadow file) ──────────────────────────────────────────────

/**
 * Serialize state + unknownKeys to `key = value` text for the shadow file.
 * Tri-state 'auto' values are OMITTED so Python's "follow GSC" logic is preserved.
 *
 * @param {Record<string, string | boolean>} state
 * @param {Array<{key: string, value: string}>} [unknownKeys]
 * @returns {string}
 */
export function serializeConfig(state, unknownKeys = []) {
  const lines = [
    '# WebsiteProfiling config (shadow of report.db pipeline_config table)',
    '# Regenerated automatically by the web UI on every Save/Run.',
    '# To use for CLI: python -m src --config pipeline-config.txt',
    '',
  ];
  const seenIds = new Set();
  for (const section of PIPELINE_CONFIG_SECTIONS) {
    if (seenIds.has(section.id)) continue;
    seenIds.add(section.id);
    lines.push(`# --- ${section.label} ---`);
    for (const f of section.fields) {
      const v = state[f.key];
      if (f.type === 'bool') {
        lines.push(`${f.key} = ${v === true ? 'true' : 'false'}`);
      } else if (f.type === 'tristate') {
        if (v === 'auto' || v == null) continue;
        lines.push(`${f.key} = ${v === 'true' ? 'true' : 'false'}`);
      } else {
        lines.push(`${f.key} = ${v == null ? '' : String(v)}`);
      }
    }
    lines.push('');
  }
  if (unknownKeys.length > 0) {
    lines.push('# --- custom ---');
    for (const { key, value } of unknownKeys) {
      lines.push(`${key} = ${value}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** Write the shadow pipeline-config.txt atomically next to report.db. */
function writeShadowFile(state, unknownKeys) {
  const shadowPath = getShadowConfigPath();
  const dir = path.dirname(shadowPath);
  fs.mkdirSync(dir, { recursive: true });
  const content = serializeConfig(state, unknownKeys);
  const tmp = shadowPath + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, shadowPath);
}

// ─── DB read helpers ──────────────────────────────────────────────────────────

function isLegacyOrLlmKey(key) {
  return key.startsWith('llm_') || key.startsWith('ml_');
}

function filterUnknownKeys(list) {
  return (list || []).filter((u) => u && !isLegacyOrLlmKey(u.key));
}

/**
 * Read all rows from the pipeline_config table.
 * @param {import('sql.js').Database} db
 * @returns {{ known: Record<string, string>, unknown: Array<{key: string, value: string}> }}
 */
function readPipelineConfigFromDb(db) {
  const known = {};
  const unknown = [];
  try {
    const res = db.exec('SELECT key, value, is_unknown FROM pipeline_config ORDER BY key');
    if (!res.length || !res[0].values.length) return { known, unknown };
    const cols = res[0].columns;
    const ki = cols.indexOf('key');
    const vi = cols.indexOf('value');
    const ui = cols.indexOf('is_unknown');
    for (const row of res[0].values) {
      if (Number(row[ui])) {
        unknown.push({ key: String(row[ki]), value: String(row[vi]) });
      } else {
        known[String(row[ki])] = String(row[vi]);
      }
    }
  } catch {
    // Table may not exist yet (very first open before init_schema runs)
  }
  return { known, unknown };
}

// ─── Load / Save ─────────────────────────────────────────────────────────────

/**
 * Load pipeline config.
 * Returns:
 *   source='store'    – loaded from pipeline_config table in report.db
 *   source='legacy'   – imported from shadow pipeline-config.txt (table was empty)
 *   source='defaults' – no stored config; returning schema defaults
 *
 * @returns {Promise<{ state: Record<string, string | boolean>, unknownKeys: Array<{key: string, value: string}>, source: 'store'|'legacy'|'defaults', dbPath: string }>}
 */
export async function loadPipelineConfig() {
  const dbPath = getReportDbPath();
  let db;
  try {
    db = await openDb();
    const { known, unknown } = readPipelineConfigFromDb(db);

    // 1. Table has data → use DB
    if (Object.keys(known).length > 0 || unknown.length > 0) {
      const { state, unknownKeys: schemaUnknown } = applySchemaDefaults(known);
      // Merge DB unknown rows with any schema-unknown keys from known map
      const allUnknown = filterUnknownKeys([...unknown, ...schemaUnknown]);
      return { state, unknownKeys: allUnknown, source: 'store', dbPath };
    }

    // 2. Table empty → try shadow file
    const shadowPath = getShadowConfigPath();
    if (fs.existsSync(shadowPath)) {
      try {
        const raw = fs.readFileSync(shadowPath, 'utf8');
        const parsed = parseInputTxt(raw);
        if (Object.keys(parsed).length > 0) {
          const { state, unknownKeys } = applySchemaDefaults(parsed);
          return { state, unknownKeys: filterUnknownKeys(unknownKeys), source: 'legacy', dbPath };
        }
      } catch {
        // fall through
      }
    }

    // 3. Schema defaults
    return { state: buildDefaults(), unknownKeys: [], source: 'defaults', dbPath };
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

/**
 * Save state + unknownKeys to report.db (pipeline_config table) and write the
 * shadow pipeline-config.txt next to it.
 *
 * @param {Record<string, string | boolean>} state
 * @param {{ unknownKeys?: Array<{key: string, value: string}> }} [options]
 * @returns {Promise<string>} absolute path of report.db written
 */
export async function savePipelineConfig(state, { unknownKeys = [] } = {}) {
  const dbPath = getReportDbPath();
  let db;
  try {
    db = await openDb();

    // Convert typed state back to raw string map for DB storage
    const entries = {};
    for (const section of PIPELINE_CONFIG_SECTIONS) {
      for (const f of section.fields) {
        const v = state[f.key];
        if (v === undefined) continue;
        if (f.type === 'tristate' && (v === 'auto' || v == null)) {
          // Store 'auto' explicitly so we can distinguish from absent
          entries[f.key] = 'auto';
        } else if (f.type === 'bool') {
          entries[f.key] = v === true ? 'true' : 'false';
        } else {
          entries[f.key] = v == null ? '' : String(v);
        }
      }
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.run('BEGIN');
    try {
      db.run('DELETE FROM pipeline_config');
      const insertStmt = db.prepare(
        'INSERT INTO pipeline_config (key, value, is_unknown, updated_at) VALUES (?, ?, ?, ?)'
      );
      for (const [k, v] of Object.entries(entries)) {
        insertStmt.run([k, v, 0, now]);
      }
      for (const { key, value } of unknownKeys) {
        insertStmt.run([key, value, 1, now]);
      }
      insertStmt.free();
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }

    persistDb(db);
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }

  // Write shadow file for CLI back-compat
  writeShadowFile(state, unknownKeys);

  return dbPath;
}
