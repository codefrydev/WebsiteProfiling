/**
 * LLM config stored only in report.db (llm_config table). No shadow file.
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import {
  LLM_CONFIG_SECTIONS,
  ALL_LLM_SCHEMA_KEYS,
  getLlmFieldByKey,
  buildInitialLlmConfigState,
  maskLlmSecretForClient,
  isLlmSecretKey,
} from '@/lib/llmConfigSchema';
import { getReportDbPath } from '@/server/pipelineConfig';

const LLM_CONFIG_DDL = `
  CREATE TABLE IF NOT EXISTS llm_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    is_secret INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
`;

const MASK_SENTINEL = '__MASKED__';

async function openDb() {
  const SQL = await initSqlJs();
  const dbPath = getReportDbPath();
  let buf;
  if (fs.existsSync(dbPath)) {
    buf = fs.readFileSync(dbPath);
  }
  const db = buf ? new SQL.Database(new Uint8Array(buf)) : new SQL.Database();
  db.run(LLM_CONFIG_DDL);
  return db;
}

function persistDb(db) {
  const dbPath = getReportDbPath();
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const buf = db.export();
  const tmp = dbPath + '.tmp';
  fs.writeFileSync(tmp, Buffer.from(buf));
  fs.renameSync(tmp, dbPath);
}

function readLlmConfigFromDb(db) {
  const known = {};
  try {
    const res = db.exec('SELECT key, value, is_secret FROM llm_config ORDER BY key');
    if (!res.length || !res[0].values) return known;
    for (const row of res[0].values) {
      known[String(row[0])] = String(row[1]);
    }
  } catch {
    /* empty */
  }
  return known;
}

function applyLlmDefaults(parsedMap) {
  const state = buildInitialLlmConfigState();
  for (const [key, rawValue] of Object.entries(parsedMap)) {
    if (!ALL_LLM_SCHEMA_KEYS.has(key)) continue;
    const field = getLlmFieldByKey(key);
    if (!field) continue;
    if (field.type === 'bool') {
      state[key] = ['true', '1', 'yes'].includes(String(rawValue).toLowerCase());
    } else {
      state[key] = String(rawValue ?? '');
    }
  }
  return state;
}

/** Client-safe state (secrets masked). */
export function maskLlmStateForClient(state) {
  const out = { ...state };
  for (const key of Object.keys(out)) {
    if (isLlmSecretKey(key)) {
      out[key] = maskLlmSecretForClient(key, out[key]);
      if (out[key]) out[`${key}_masked`] = true;
    }
  }
  return out;
}

/**
 * @returns {Promise<{ state: Record<string, string | boolean>, dbPath: string, source: 'store'|'defaults' }>}
 */
export async function loadLlmConfig() {
  const dbPath = getReportDbPath();
  let db;
  try {
    db = await openDb();
    const known = readLlmConfigFromDb(db);
    if (Object.keys(known).length > 0) {
      const state = applyLlmDefaults(known);
      return { state: maskLlmStateForClient(state), dbPath, source: 'store' };
    }
    return { state: maskLlmStateForClient(buildInitialLlmConfigState()), dbPath, source: 'defaults' };
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {Record<string, string | boolean>} state
 * @param {{ preserveSecrets?: boolean }} [options]
 */
export async function saveLlmConfig(state, { preserveSecrets = true } = {}) {
  const dbPath = getReportDbPath();
  let db;
  try {
    db = await openDb();
    const existing = preserveSecrets ? readLlmConfigFromDb(db) : {};

    const entries = {};
    const secretKeys = new Set();
    for (const section of LLM_CONFIG_SECTIONS) {
      for (const f of section.fields) {
        const v = state[f.key];
        if (v === undefined) continue;
        if (f.type === 'bool') {
          entries[f.key] = v === true ? 'true' : 'false';
        } else if (isLlmSecretKey(f.key)) {
          const raw = v == null ? '' : String(v).trim();
          const isMasked =
            raw === '' ||
            raw === MASK_SENTINEL ||
            raw.startsWith('••••') ||
            state[`${f.key}_masked`] === true;
          if (isMasked && existing[f.key]) {
            entries[f.key] = existing[f.key];
          } else if (raw && !raw.startsWith('••••')) {
            entries[f.key] = raw;
          } else {
            entries[f.key] = '';
          }
          if (entries[f.key]) secretKeys.add(f.key);
        } else {
          entries[f.key] = v == null ? '' : String(v);
        }
      }
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.run('BEGIN');
    try {
      db.run('DELETE FROM llm_config');
      const insertStmt = db.prepare(
        'INSERT INTO llm_config (key, value, is_secret, updated_at) VALUES (?, ?, ?, ?)'
      );
      for (const [k, v] of Object.entries(entries)) {
        insertStmt.run([k, v, secretKeys.has(k) ? 1 : 0, now]);
      }
      insertStmt.free();
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
    persistDb(db);
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
  return dbPath;
}

export { MASK_SENTINEL };
