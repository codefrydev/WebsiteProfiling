import { reportApi } from '@/lib/publicBase';

export type AuditExportFormat = 'pdf' | 'csv' | 'json';

export type PdfExportProfile = 'executive' | 'standard' | 'full' | 'premium';

export function buildAuditExportUrl(
  format: AuditExportFormat,
  reportId: number | null | undefined,
  options?: {
    inline?: boolean;
    profile?: PdfExportProfile;
    branding?: boolean;
  },
): string {
  const q = new URLSearchParams({ format });
  if (reportId != null) q.set('reportId', String(reportId));
  if (options?.inline) q.set('disposition', 'inline');
  if (options?.profile) q.set('profile', options.profile);
  if (options?.branding === false) q.set('branding', 'false');
  else if (options?.branding === true) q.set('branding', 'true');
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
