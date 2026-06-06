import { createHash } from 'crypto';
import { withDb } from '@/server/db';

export type IssueWorkflowStatus = 'open' | 'in_progress' | 'fixed' | 'ignored';

export interface IssueStatusRow {
  id: number;
  propertyId: number;
  reportId: number | null;
  issueFingerprint: string;
  categoryId: string | null;
  message: string;
  url: string;
  priority: string;
  status: IssueWorkflowStatus;
  assignee: string | null;
  note: string | null;
  updatedAt: string;
}

export function issueFingerprint(message: string, url: string, categoryId?: string): string {
  const raw = `${categoryId || ''}|${url || ''}|${message || ''}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export async function listIssueStatus(propertyId: number): Promise<IssueStatusRow[]> {
  return withDb(async (client) => {
    const cur = await client.query<{
      id: string;
      property_id: string;
      report_id: string | null;
      issue_fingerprint: string;
      category_id: string | null;
      message: string;
      url: string;
      priority: string;
      status: string;
      assignee: string | null;
      note: string | null;
      updated_at: Date;
    }>(
      `SELECT id, property_id, report_id, issue_fingerprint, category_id, message, url,
              priority, status, assignee, note, updated_at
       FROM issue_status
       WHERE property_id = $1
       ORDER BY updated_at DESC`,
      [propertyId],
    );
    return cur.rows.map((row) => ({
      id: Number(row.id),
      propertyId: Number(row.property_id),
      reportId: row.report_id != null ? Number(row.report_id) : null,
      issueFingerprint: row.issue_fingerprint,
      categoryId: row.category_id,
      message: row.message,
      url: row.url,
      priority: row.priority,
      status: row.status as IssueWorkflowStatus,
      assignee: row.assignee,
      note: row.note,
      updatedAt: row.updated_at.toISOString(),
    }));
  });
}

export async function upsertIssueStatus(input: {
  propertyId: number;
  reportId?: number | null;
  message: string;
  url?: string;
  priority?: string;
  categoryId?: string;
  status: IssueWorkflowStatus;
  assignee?: string | null;
  note?: string | null;
}): Promise<IssueStatusRow> {
  const fp = issueFingerprint(input.message, input.url || '', input.categoryId);
  return withDb(async (client) => {
    const cur = await client.query<{
      id: string;
      property_id: string;
      report_id: string | null;
      issue_fingerprint: string;
      category_id: string | null;
      message: string;
      url: string;
      priority: string;
      status: string;
      assignee: string | null;
      note: string | null;
      updated_at: Date;
    }>(
      `INSERT INTO issue_status
         (property_id, report_id, issue_fingerprint, category_id, message, url, priority, status, assignee, note, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (property_id, issue_fingerprint) DO UPDATE SET
         status = EXCLUDED.status,
         assignee = COALESCE(EXCLUDED.assignee, issue_status.assignee),
         note = COALESCE(EXCLUDED.note, issue_status.note),
         report_id = COALESCE(EXCLUDED.report_id, issue_status.report_id),
         updated_at = now()
       RETURNING id, property_id, report_id, issue_fingerprint, category_id, message, url,
                 priority, status, assignee, note, updated_at`,
      [
        input.propertyId,
        input.reportId ?? null,
        fp,
        input.categoryId ?? null,
        input.message,
        input.url || '',
        input.priority || 'Medium',
        input.status,
        input.assignee ?? null,
        input.note ?? null,
      ],
    );
    const row = cur.rows[0];
    return {
      id: Number(row.id),
      propertyId: Number(row.property_id),
      reportId: row.report_id != null ? Number(row.report_id) : null,
      issueFingerprint: row.issue_fingerprint,
      categoryId: row.category_id,
      message: row.message,
      url: row.url,
      priority: row.priority,
      status: row.status as IssueWorkflowStatus,
      assignee: row.assignee,
      note: row.note,
      updatedAt: row.updated_at.toISOString(),
    };
  });
}
