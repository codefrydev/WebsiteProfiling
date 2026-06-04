import { reportApi } from '@/lib/publicBase';

export type AuditExportFormat = 'html' | 'pdf' | 'csv' | 'json';

export function buildAuditExportUrl(
  format: AuditExportFormat,
  reportId: number | null | undefined,
  options?: { inline?: boolean },
): string {
  const q = new URLSearchParams({ format });
  if (reportId != null) q.set('reportId', String(reportId));
  if (options?.inline) q.set('disposition', 'inline');
  return reportApi(`/export?${q.toString()}`);
}
