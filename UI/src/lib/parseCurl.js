/**
 * Best-effort curl command parser for browser use.
 * Does not run shell expansion; complex quoting may fail.
 */

/** @param {string} str */
function tokenize(str) {
  const tokens = [];
  let i = 0;
  const len = str.length;
  while (i < len) {
    while (i < len && /\s/.test(str[i])) i += 1;
    if (i >= len) break;
    const c = str[i];
    if (c === "'" || c === '"') {
      const quote = c;
      i += 1;
      let s = '';
      while (i < len) {
        if (str[i] === '\\' && quote === '"') {
          i += 1;
          if (i < len) s += str[i];
          i += 1;
          continue;
        }
        if (str[i] === quote) {
          i += 1;
          break;
        }
        s += str[i];
        i += 1;
      }
      tokens.push(s);
    } else {
      let s = '';
      while (i < len && !/\s/.test(str[i])) {
        s += str[i];
        i += 1;
      }
      tokens.push(s);
    }
  }
  return tokens;
}

/** Normalize backslash line continuations and trim. */
function normalizeInput(input) {
  return String(input || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\\n[ \t]*/g, ' ')
    .trim();
}

const URL_LIKE = /^https?:\/\//i;

/**
 * @param {string} input
 * @returns {{ method: string, url: string, headers: Record<string, string>, body: string | null, warnings: string[] } | { error: string }}
 */
export function parseCurlCommand(input) {
  const normalized = normalizeInput(input);
  if (!normalized) {
    return { error: 'Empty input' };
  }

  const tokens = tokenize(normalized);
  if (tokens.length === 0) {
    return { error: 'Could not parse' };
  }

  let idx = 0;
  if (tokens[idx]?.toLowerCase() === 'curl') idx += 1;

  const warnings = [];
  let method = 'GET';
  /** @type {Record<string, string>} */
  const headers = {};
  let body = null;
  /** @type {string | null} */
  let url = null;

  const setHeader = (line) => {
    const m = String(line).match(/^\s*([^:]+):\s*(.*)$/);
    if (m) {
      headers[m[1].trim()] = m[2].trim();
    } else {
      warnings.push(`Skipped malformed header: ${line.slice(0, 40)}…`);
    }
  };

  while (idx < tokens.length) {
    const t = tokens[idx];
    const low = t.toLowerCase();

    if (low === '-x' || low === '--request') {
      idx += 1;
      if (idx < tokens.length) method = String(tokens[idx]).toUpperCase();
      idx += 1;
      continue;
    }

    if (low === '-h' || low === '--header') {
      idx += 1;
      if (idx < tokens.length) setHeader(tokens[idx]);
      idx += 1;
      continue;
    }

    if (
      low === '-d' ||
      low === '--data' ||
      low === '--data-raw' ||
      low === '--data-binary' ||
      low === '--data-ascii'
    ) {
      idx += 1;
      if (idx < tokens.length) {
        body = tokens[idx];
        if (method === 'GET') method = 'POST';
      }
      idx += 1;
      continue;
    }

    if (low === '-b' || low === '--cookie') {
      idx += 1;
      if (idx < tokens.length) idx += 1;
      warnings.push('Cookies (-b) are not applied to fetch; add Cookie header manually if needed.');
      continue;
    }

    if (low === '-u' || low === '--user') {
      idx += 1;
      if (idx < tokens.length) idx += 1;
      warnings.push('Basic auth (-u) not parsed; use Authorization header instead.');
      continue;
    }

    if (low === '--url') {
      idx += 1;
      if (idx < tokens.length) {
        url = tokens[idx];
      }
      idx += 1;
      continue;
    }

    if (low.startsWith('-')) {
      warnings.push(`Ignored flag: ${t}`);
      idx += 1;
      continue;
    }

    if (URL_LIKE.test(t)) {
      url = t;
      idx += 1;
      continue;
    }

    idx += 1;
  }

  if (!url) {
    return { error: 'No http(s) URL found. Include a full URL in the curl command.' };
  }

  return {
    method,
    url,
    headers,
    body,
    warnings,
  };
}
