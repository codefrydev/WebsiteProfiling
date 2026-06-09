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

export function buildWorkbookExportUrl(reportId: number | null | undefined): string {
  const q = new URLSearchParams();
  if (reportId != null) q.set('reportId', String(reportId));
  const qs = q.toString();
  return reportApi(`/export-workbook${qs ? `?${qs}` : ''}`);
}

export function buildSitemapExportUrl(reportId: number | null | undefined): string {
  const q = new URLSearchParams();
  if (reportId != null) q.set('reportId', String(reportId));
  const qs = q.toString();
  return reportApi(`/export-sitemap${qs ? `?${qs}` : ''}`);
}
