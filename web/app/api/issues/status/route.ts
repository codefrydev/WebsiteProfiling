import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { listIssueStatus, upsertIssueStatus, type IssueWorkflowStatus } from '@/server/issueStatusDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUS = new Set<IssueWorkflowStatus>(['open', 'in_progress', 'fixed', 'ignored']);

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const propertyId = Number(request.nextUrl.searchParams.get('propertyId') || '0');
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  }
  try {
    const rows = await listIssueStatus(propertyId);
    return NextResponse.json({ issues: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

export const PUT: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let body: {
    propertyId?: number;
    reportId?: number;
    message?: string;
    url?: string;
    priority?: string;
    categoryId?: string;
    status?: string;
    assignee?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const propertyId = Number(body.propertyId || 0);
  const message = String(body.message || '').trim();
  const status = body.status as IssueWorkflowStatus;
  if (!propertyId || !message || !VALID_STATUS.has(status)) {
    return NextResponse.json({ error: 'propertyId, message, and valid status required' }, { status: 400 });
  }

  try {
    const row = await upsertIssueStatus({
      propertyId,
      reportId: body.reportId,
      message,
      url: body.url,
      priority: body.priority,
      categoryId: body.categoryId,
      status,
      assignee: body.assignee,
      note: body.note,
    });
    return NextResponse.json({ issue: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
