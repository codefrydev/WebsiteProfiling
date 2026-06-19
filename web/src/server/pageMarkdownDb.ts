import type { PoolClient } from 'pg';
import { withDb } from '@/server/db';

export interface PageMarkdownRunRow {
  crawl_run_id: number;
  start_url: string;
  created_at: string | null;
  render_mode: string | null;
  html_page_count: number;
  markdown_page_count: number;
}

export interface PageMarkdownListItem {
  url: string;
  title: string | null;
  word_count: number;
  strategy: string;
  extracted_at: string;
}

export interface PageMarkdownListResult {
  items: PageMarkdownListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageMarkdownContent {
  url: string;
  title: string | null;
  markdown: string;
  word_count: number;
  strategy: string;
  source_byte_length: number;
  extracted_at: string;
}

/**
 * List crawl runs for a property including HTML and markdown page counts.
 * If propertyId is 0/null, returns the 30 most recent runs.
 */
export async function listPageMarkdownRuns(
  propertyId: number | null,
): Promise<PageMarkdownRunRow[]> {
  return withDb(async (client: PoolClient) => {
    const where = propertyId ? 'WHERE cr.property_id = $1' : '';
    const params: unknown[] = propertyId ? [propertyId] : [];
    const { rows } = await client.query<{
      crawl_run_id: string;
      start_url: string;
      created_at: string | null;
      render_mode: string | null;
      html_page_count: string;
      markdown_page_count: string;
    }>(
      `SELECT
         cr.id AS crawl_run_id,
         cr.start_url,
         cr.created_at,
         cr.render_mode,
         COALESCE(html.cnt, 0) AS html_page_count,
         COALESCE(md.cnt, 0) AS markdown_page_count
       FROM crawl_runs cr
       LEFT JOIN (
         SELECT crawl_run_id, COUNT(*)::int AS cnt FROM crawl_page_html GROUP BY crawl_run_id
       ) html ON html.crawl_run_id = cr.id
       LEFT JOIN (
         SELECT crawl_run_id, COUNT(*)::int AS cnt FROM crawl_page_markdown GROUP BY crawl_run_id
       ) md ON md.crawl_run_id = cr.id
       ${where}
       ORDER BY cr.id DESC
       LIMIT 50`,
      params,
    );
    return rows.map((r) => ({
      crawl_run_id: Number(r.crawl_run_id),
      start_url: r.start_url,
      created_at: r.created_at,
      render_mode: r.render_mode,
      html_page_count: Number(r.html_page_count) || 0,
      markdown_page_count: Number(r.markdown_page_count) || 0,
    }));
  });
}

/** Paginated list of markdown entries for a crawl run (url, title, word_count). */
export async function listPageMarkdownItems(
  crawlRunId: number,
  page: number,
  pageSize: number,
  query: string,
): Promise<PageMarkdownListResult> {
  return withDb(async (client: PoolClient) => {
    const offset = (page - 1) * pageSize;
    const q = (query || '').trim();

    let countResult: { rows: { cnt: string }[] };
    let dataResult: { rows: PageMarkdownListItem[] };

    if (q) {
      const pattern = `%${q.toLowerCase()}%`;
      countResult = await client.query<{ cnt: string }>(
        `SELECT COUNT(*)::int AS cnt FROM crawl_page_markdown WHERE crawl_run_id = $1 AND lower(url) LIKE $2`,
        [crawlRunId, pattern],
      );
      dataResult = await client.query<PageMarkdownListItem>(
        `SELECT url, title, word_count, strategy, extracted_at
         FROM crawl_page_markdown
         WHERE crawl_run_id = $1 AND lower(url) LIKE $2
         ORDER BY url LIMIT $3 OFFSET $4`,
        [crawlRunId, pattern, pageSize, offset],
      );
    } else {
      countResult = await client.query<{ cnt: string }>(
        `SELECT COUNT(*)::int AS cnt FROM crawl_page_markdown WHERE crawl_run_id = $1`,
        [crawlRunId],
      );
      dataResult = await client.query<PageMarkdownListItem>(
        `SELECT url, title, word_count, strategy, extracted_at
         FROM crawl_page_markdown
         WHERE crawl_run_id = $1
         ORDER BY url LIMIT $2 OFFSET $3`,
        [crawlRunId, pageSize, offset],
      );
    }

    const total = Number(countResult.rows[0]?.cnt ?? 0);
    return { items: dataResult.rows, total, page, pageSize };
  });
}

/** Fetch the markdown body for a single URL in a crawl run. */
export async function getPageMarkdownContent(
  crawlRunId: number,
  url: string,
): Promise<PageMarkdownContent | null> {
  return withDb(async (client: PoolClient) => {
    const norm = url.replace(/\/$/, '');
    const { rows } = await client.query<PageMarkdownContent>(
      `SELECT url, title, markdown, word_count, strategy, source_byte_length, extracted_at
       FROM crawl_page_markdown
       WHERE crawl_run_id = $1 AND url = $2`,
      [crawlRunId, norm],
    );
    return rows[0] ?? null;
  });
}

/** Delete all extracted markdown for a crawl run; returns deleted row count. */
export async function deletePageMarkdownForRun(crawlRunId: number): Promise<number> {
  return withDb(async (client: PoolClient) => {
    const res = await client.query(
      `DELETE FROM crawl_page_markdown WHERE crawl_run_id = $1`,
      [crawlRunId],
    );
    return res.rowCount ?? 0;
  });
}
