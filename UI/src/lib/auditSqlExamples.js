/**
 * Guided SQL examples for the site audit report.db schema.
 * `requiresTables`: if set, the card is shown only when every table exists in the loaded DB.
 *
 * @typedef {{ diff: string, title: string, text: string, sql: string, requiresTables?: string[] }} AuditSqlExample
 */

/** @type {AuditSqlExample[]} */
export const AUDIT_SQL_EXAMPLES = [
  {
    diff: 'Easy',
    title: 'List user tables',
    text: 'Show every application table name from sqlite_master (excluding internal sqlite_% tables).',
    sql: `SELECT name FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
ORDER BY name;`,
  },
  {
    diff: 'Easy',
    title: 'Crawl runs',
    text: 'Show recent crawl runs: when they started and the start URL.',
    sql: `SELECT * FROM crawl_runs ORDER BY id DESC LIMIT 20;`,
    requiresTables: ['crawl_runs'],
  },
  {
    diff: 'Easy',
    title: 'Sample crawled URLs',
    text: 'Inspect the first rows of crawl_results (columns depend on your crawler version).',
    sql: `SELECT * FROM crawl_results LIMIT 25;`,
    requiresTables: ['crawl_results'],
  },
  {
    diff: 'Easy',
    title: 'Internal link edges',
    text: 'Preview from_url → to_url pairs stored for the link graph.',
    sql: `SELECT * FROM edges LIMIT 30;`,
    requiresTables: ['edges'],
  },
  {
    diff: 'Easy',
    title: 'URL visit counts',
    text: 'See nodes.url and how many times each URL was seen in the crawl.',
    sql: `SELECT * FROM nodes ORDER BY count DESC LIMIT 25;`,
    requiresTables: ['nodes'],
  },
  {
    diff: 'Easy',
    title: 'Report payloads',
    text: 'List stored JSON report blobs (id, time, size)—the UI reads the latest payload.',
    sql: `SELECT id, generated_at, length(data) AS json_bytes
FROM report_payload
ORDER BY id DESC
LIMIT 10;`,
    requiresTables: ['report_payload'],
  },
  {
    diff: 'Medium',
    title: 'Most linked-to URLs',
    text: 'Aggregate edges by destination URL and sort by popularity.',
    sql: `SELECT to_url, COUNT(*) AS inlinks
FROM edges
GROUP BY to_url
ORDER BY inlinks DESC
LIMIT 20;`,
    requiresTables: ['edges'],
  },
  {
    diff: 'Medium',
    title: 'Lighthouse runs',
    text: 'URLs and strategies captured for Lighthouse (mobile/desktop, etc.).',
    sql: `SELECT url, strategy, created_at
FROM lighthouse_runs
ORDER BY id DESC
LIMIT 15;`,
    requiresTables: ['lighthouse_runs'],
  },
  {
    diff: 'Medium',
    title: 'Lighthouse audits sample',
    text: 'Inspect audit rows (scores, titles) joined to runs.',
    sql: `SELECT a.audit_id, a.category_id, a.score, a.title, r.url
FROM lh_audits a
JOIN lighthouse_runs r ON r.id = a.run_id
LIMIT 30;`,
    requiresTables: ['lh_audits', 'lighthouse_runs'],
  },
  {
    diff: 'Hard',
    title: 'Average Lighthouse score by category',
    text: 'Group lh_audits by category_id and average numeric scores.',
    sql: `SELECT category_id,
       COUNT(*) AS audits,
       ROUND(AVG(score), 3) AS avg_score
FROM lh_audits
WHERE score IS NOT NULL
GROUP BY category_id
ORDER BY avg_score ASC;`,
    requiresTables: ['lh_audits'],
  },
  {
    diff: 'Hard',
    title: 'Edges per source page',
    text: 'Find pages with the most outgoing internal links.',
    sql: `SELECT from_url, COUNT(*) AS outlinks
FROM edges
GROUP BY from_url
ORDER BY outlinks DESC
LIMIT 15;`,
    requiresTables: ['edges'],
  },
];

/**
 * @param {Set<string>} tableNames
 * @returns {AuditSqlExample[]}
 */
export function filterAuditExamplesForSchema(tableNames) {
  return AUDIT_SQL_EXAMPLES.filter((ex) => {
    const req = ex.requiresTables;
    if (!req?.length) return true;
    return req.every((t) => tableNames.has(t));
  });
}
