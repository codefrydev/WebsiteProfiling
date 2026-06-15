import { withDb } from '@/server/db';

export type ContentDraftStatus = 'draft' | 'ready' | 'archived';

export interface ContentDraftRow {
  id: number;
  property_id: number;
  title: string;
  target_keyword: string;
  landing_url: string | null;
  status: ContentDraftStatus;
  body_html: string;
  title_tag: string;
  meta_description: string;
  grade_score: number | null;
  grade_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ContentDraftListRow {
  id: number;
  property_id: number;
  title: string;
  target_keyword: string;
  landing_url: string | null;
  status: ContentDraftStatus;
  grade_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateContentDraftInput {
  title?: string;
  target_keyword?: string;
  landing_url?: string | null;
  status?: ContentDraftStatus;
  body_html?: string;
  title_tag?: string;
  meta_description?: string;
}

export interface UpdateContentDraftInput {
  title?: string;
  target_keyword?: string;
  landing_url?: string | null;
  status?: ContentDraftStatus;
  body_html?: string;
  title_tag?: string;
  meta_description?: string;
  grade_score?: number | null;
  grade_snapshot?: Record<string, unknown> | null;
}

function mapDraftRow(row: ContentDraftRow): ContentDraftRow {
  return {
    ...row,
    id: Number(row.id),
    property_id: Number(row.property_id),
    grade_score: row.grade_score != null ? Number(row.grade_score) : null,
    grade_snapshot:
      row.grade_snapshot && typeof row.grade_snapshot === 'object'
        ? row.grade_snapshot
        : null,
  };
}

export async function listContentDrafts(
  propertyId: number,
  limit = 100,
): Promise<ContentDraftListRow[]> {
  return withDb(async (client) => {
    const cur = await client.query<ContentDraftListRow>(
      `SELECT id, property_id, title, target_keyword, landing_url, status,
              grade_score, created_at::text, updated_at::text
       FROM content_drafts
       WHERE property_id = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [propertyId, Math.max(1, Math.min(limit, 200))],
    );
    return cur.rows.map((r) => ({
      ...r,
      id: Number(r.id),
      property_id: Number(r.property_id),
      grade_score: r.grade_score != null ? Number(r.grade_score) : null,
    }));
  });
}

export async function getContentDraft(id: number): Promise<ContentDraftRow | null> {
  return withDb(async (client) => {
    const cur = await client.query<ContentDraftRow>(
      `SELECT id, property_id, title, target_keyword, landing_url, status,
              body_html, title_tag, meta_description, grade_score, grade_snapshot,
              created_at::text, updated_at::text
       FROM content_drafts WHERE id = $1`,
      [id],
    );
    const row = cur.rows[0];
    if (!row) return null;
    return mapDraftRow(row);
  });
}

export async function createContentDraft(
  propertyId: number,
  input: CreateContentDraftInput = {},
): Promise<number> {
  return withDb(async (client) => {
    const cur = await client.query<{ id: string }>(
      `INSERT INTO content_drafts
         (property_id, title, target_keyword, landing_url, status, body_html, title_tag, meta_description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        propertyId,
        (input.title || 'Untitled draft').trim() || 'Untitled draft',
        (input.target_keyword || '').trim(),
        input.landing_url?.trim() || null,
        input.status || 'draft',
        input.body_html || '',
        input.title_tag || '',
        input.meta_description || '',
      ],
    );
    return Number(cur.rows[0]?.id);
  });
}

export async function updateContentDraft(
  id: number,
  patch: UpdateContentDraftInput,
): Promise<ContentDraftRow | null> {
  const fields: string[] = [];
  const values: unknown[] = [id];
  let idx = 2;

  const setField = (col: string, val: unknown) => {
    fields.push(`${col} = $${idx}`);
    values.push(val);
    idx += 1;
  };

  if (patch.title !== undefined) setField('title', patch.title.trim() || 'Untitled draft');
  if (patch.target_keyword !== undefined) setField('target_keyword', patch.target_keyword.trim());
  if (patch.landing_url !== undefined) setField('landing_url', patch.landing_url?.trim() || null);
  if (patch.status !== undefined) setField('status', patch.status);
  if (patch.body_html !== undefined) setField('body_html', patch.body_html);
  if (patch.title_tag !== undefined) setField('title_tag', patch.title_tag);
  if (patch.meta_description !== undefined) setField('meta_description', patch.meta_description);
  if (patch.grade_score !== undefined) setField('grade_score', patch.grade_score);
  if (patch.grade_snapshot !== undefined) {
    setField('grade_snapshot', patch.grade_snapshot != null ? JSON.stringify(patch.grade_snapshot) : null);
  }

  if (fields.length === 0) {
    return getContentDraft(id);
  }

  fields.push('updated_at = now()');

  return withDb(async (client) => {
    const cur = await client.query<ContentDraftRow>(
      `UPDATE content_drafts SET ${fields.join(', ')}
       WHERE id = $1
       RETURNING id, property_id, title, target_keyword, landing_url, status,
                 body_html, title_tag, meta_description, grade_score, grade_snapshot,
                 created_at::text, updated_at::text`,
      values,
    );
    const row = cur.rows[0];
    if (!row) return null;
    return mapDraftRow(row);
  });
}

export async function deleteContentDraft(id: number): Promise<boolean> {
  return withDb(async (client) => {
    const cur = await client.query<{ id: string }>(
      `DELETE FROM content_drafts WHERE id = $1 RETURNING id`,
      [id],
    );
    return cur.rows.length > 0;
  });
}
