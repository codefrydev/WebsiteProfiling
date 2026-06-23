
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import type { ReportIssue } from '@/types';
import UrlInspectorButton from '@/components/UrlInspectorButton';
import { LabelWithHint } from '@/components';
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
    void apiFetch(apiUrl(`/issues/status?propertyId=${propertyId}`))
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

  const saveIssueRow = useCallback(
    async (
      item: { category: string; issue: ReportIssue },
      patch: { status: WorkflowStatus; assignee?: string | null; note?: string | null },
    ) => {
      if (!propertyId || readOnly) return;
      const message = String(item.issue.message || '').trim();
      if (!message) return;
      const res = await apiFetch(apiUrl('/issues/status'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          reportId,
          message,
          url: item.issue.url,
          priority: item.issue.priority,
          categoryId: item.category,
          status: patch.status,
          assignee: patch.assignee ?? null,
          note: patch.note ?? null,
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
        {vi.taskBoardHint || 'Sorted by Search Console clicks to affected URLs when available.'}{' '}
        <LabelWithHint label="Impact score" helpKey="shared.impactScore" />
      </p>
      {sorted.map((item, i) => {
        const msg = item.issue.message || '';
        const fp = Object.values(statusByFingerprint).find(
          (r) => r.message === msg && (r.url || '') === (item.issue.url || ''),
        )?.issueFingerprint;
        const row = fp ? statusByFingerprint[fp] : undefined;
        const current = row?.status ?? 'open';
        const assignee = row?.assignee ?? '';
        const note = row?.note ?? '';
        return (
          <div
            key={`${msg}-${item.issue.url}-${i}`}
            className="flex flex-col gap-3 p-4 rounded-xl border border-default bg-brand-800 min-w-0 max-w-full overflow-hidden"
          >
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
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
              {item.issue.impact_score != null && Number(item.issue.impact_score) > 0 ? (
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                  <LabelWithHint label="Impact score" helpKey="shared.impactScore" />:{' '}
                  <span className="font-semibold text-foreground">{Number(item.issue.impact_score).toLocaleString()}</span>
                </p>
              ) : null}
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
              onChange={(e) =>
                void saveIssueRow(item, {
                  status: e.target.value as WorkflowStatus,
                  assignee: assignee || null,
                  note: note || null,
                })
              }
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
            <div className="grid gap-2 sm:grid-cols-2 border-t border-default/60 pt-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">{vi.taskBoardAssignee}</span>
                <input
                  type="text"
                  defaultValue={assignee}
                  key={`${fp}-assignee-${assignee}`}
                  maxLength={120}
                  disabled={readOnly}
                  placeholder={vi.taskBoardAssigneePlaceholder}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next === (assignee || '').trim()) return;
                    void saveIssueRow(item, { status: current, assignee: next || null, note: note || null });
                  }}
                  className="w-full rounded-lg border border-default bg-brand-900 px-2 py-1.5 text-xs text-foreground disabled:opacity-60"
                />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-[11px] font-medium text-muted-foreground">{vi.taskBoardNote}</span>
                <textarea
                  defaultValue={note}
                  key={`${fp}-note-${note}`}
                  maxLength={2000}
                  rows={2}
                  disabled={readOnly}
                  placeholder={vi.taskBoardNotePlaceholder}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next === (note || '').trim()) return;
                    void saveIssueRow(item, { status: current, assignee: assignee || null, note: next || null });
                  }}
                  className="w-full resize-y rounded-lg border border-default bg-brand-900 px-2 py-1.5 text-xs text-foreground disabled:opacity-60"
                />
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}
