'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import type { ReportIssue } from '@/types';
import UrlInspectorButton from '@/components/UrlInspectorButton';
import IssueAiFixButton from '@/components/issues/IssueAiFixButton';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';

type WorkflowStatus = 'open' | 'in_progress' | 'fixed' | 'ignored';

interface IssueStatusRow {
  issueFingerprint: string;
  message: string;
  url?: string | null;
  priority?: string | null;
  categoryId?: string | null;
  status: WorkflowStatus;
  assignee?: string | null;
  note?: string | null;
}

interface IssueTaskBoardProps {
  propertyId: number | null;
  reportId: number | null;
  issues: Array<{ category: string; issue: ReportIssue; clicks?: number }>;
}

const STATUS_OPTIONS: WorkflowStatus[] = ['open', 'in_progress', 'fixed', 'ignored'];

export default function IssueTaskBoard({ propertyId, reportId, issues }: IssueTaskBoardProps) {
  const vi = strings.views.issues;
  const { readOnly } = useReadOnlySession();
  const [statusByFingerprint, setStatusByFingerprint] = useState<Record<string, IssueStatusRow>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    setLoading(true);
    void fetch(apiUrl(`/issues/status?propertyId=${propertyId}`))
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const map: Record<string, IssueStatusRow> = {};
        for (const row of (data.issues || []) as IssueStatusRow[]) {
          map[row.issueFingerprint] = row;
        }
        setStatusByFingerprint(map);
      })
      .catch(() => {
        if (!cancelled) setStatusByFingerprint({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const sorted = useMemo(
    () => [...issues].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)),
    [issues],
  );

  const updateStatus = useCallback(
    async (item: { category: string; issue: ReportIssue }, status: WorkflowStatus) => {
      if (!propertyId || readOnly) return;
      const message = String(item.issue.message || '').trim();
      if (!message) return;
      const res = await fetch(apiUrl('/issues/status'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          reportId,
          message,
          url: item.issue.url,
          priority: item.issue.priority,
          categoryId: item.category,
          status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.issue) {
        const row = data.issue as IssueStatusRow;
        setStatusByFingerprint((prev) => ({ ...prev, [row.issueFingerprint]: row }));
      }
    },
    [propertyId, reportId, readOnly],
  );

  if (!propertyId) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        {vi.taskBoardNoProperty || 'Link a property to track issue workflow.'}
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground py-6 text-center">{strings.app.loading}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {vi.taskBoardHint || 'Sorted by Search Console clicks to affected URLs when available.'}
      </p>
      {sorted.map((item, i) => {
        const msg = item.issue.message || '';
        const fp = Object.values(statusByFingerprint).find(
          (r) => r.message === msg && (r.url || '') === (item.issue.url || ''),
        )?.issueFingerprint;
        const current = fp ? statusByFingerprint[fp]?.status : 'open';
        return (
          <div
            key={`${msg}-${item.issue.url}-${i}`}
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-default bg-brand-800 min-w-0 max-w-full overflow-hidden"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{msg}</p>
              {item.issue.url ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground break-all min-w-0">{item.issue.url}</span>
                  <UrlInspectorButton url={item.issue.url} />
                </div>
              ) : null}
              {(item.clicks ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  GSC clicks: {item.clicks!.toLocaleString()}
                </p>
              )}
              {(item.issue.llm_recommendation || item.issue.recommendation) ? (
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  {item.issue.llm_recommendation || item.issue.recommendation}
                </p>
              ) : null}
              <div className="mt-2">
                <IssueAiFixButton issue={item.issue} category={item.category} />
              </div>
            </div>
            <select
              value={current}
              onChange={(e) => void updateStatus(item, e.target.value as WorkflowStatus)}
              disabled={readOnly}
              className="bg-brand-900 border border-default rounded-lg px-2 py-1.5 text-xs text-foreground shrink-0 disabled:opacity-60"
              aria-label={vi.taskBoardStatus || 'Issue status'}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
