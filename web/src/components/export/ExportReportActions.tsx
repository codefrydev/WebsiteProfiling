
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileText } from 'lucide-react';
import { useReport } from '@/context/useReport';
import { buildAuditExportUrl, type PdfExportProfile } from '@/lib/exportAudit';
import { strings } from '@/lib/strings';

const ve = strings.views.exportReport;

const PROFILES: { value: PdfExportProfile; label: string }[] = [
  { value: 'executive', label: 'Executive' },
  { value: 'standard', label: 'Standard' },
  { value: 'full', label: 'Full' },
  { value: 'premium', label: 'Premium' },
];

function parseProfile(raw: string | null): PdfExportProfile {
  if (raw === 'executive' || raw === 'full' || raw === 'premium') return raw;
  return 'standard';
}

/** Export download actions for the app shell header on /export. */
export default function ExportReportActions() {
  const { selectedReportId, reportList } = useReport();
  const reportId = selectedReportId ?? reportList?.[0]?.id ?? null;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const profile = parseProfile(searchParams.get('profile'));
  const branding = searchParams.get('branding') !== 'false';

  const exportOptions = useMemo(() => ({ profile, branding }), [profile, branding]);

  const pdfUrl = buildAuditExportUrl('pdf', reportId, exportOptions);
  const csvUrl = buildAuditExportUrl('csv', reportId);
  const jsonUrl = buildAuditExportUrl('json', reportId);

  const setQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) p.delete(key);
        else p.set(key, value);
      }
      const qs = p.toString();
      navigate(qs ? `${pathname}?${qs}` : pathname, { replace: true, preventScrollReset: true });
    },
    [pathname, navigate, searchParams],
  );

  const secondaryBtn =
    'press inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium border border-md-sys-outline-variant/40 text-md-sys-on-surface hover:bg-md-sys-surface-container-high/80 active:scale-[0.98] transition-all duration-200 whitespace-nowrap';

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 print:hidden">
      <label className="inline-flex items-center gap-1.5 text-xs text-md-sys-on-surface-variant whitespace-nowrap">
        <span className="hidden lg:inline">Profile</span>
        <select
          value={profile}
          onChange={(e) => setQuery({ profile: e.target.value })}
          className="rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low px-2.5 py-1.5 text-xs text-md-sys-on-surface"
          aria-label="PDF report profile"
        >
          {PROFILES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="inline-flex items-center gap-1.5 text-xs text-md-sys-on-surface-variant whitespace-nowrap cursor-pointer">
        <input
          type="checkbox"
          checked={branding}
          onChange={(e) => setQuery({ branding: e.target.checked ? 'true' : 'false' })}
          className="rounded border-md-sys-outline-variant/40"
        />
        <span className="hidden md:inline">Agency branding</span>
      </label>
      <a
        href={pdfUrl}
        download
        className="press inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-md-sys-primary hover:brightness-105 active:scale-[0.98] text-md-sys-on-primary transition-all duration-200 whitespace-nowrap shadow-sm"
      >
        <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="hidden sm:inline">{ve.downloadPdf}</span>
        <span className="sm:hidden">PDF</span>
      </a>
      <a href={csvUrl} className={secondaryBtn}>
        <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="hidden sm:inline">{ve.downloadCsv}</span>
        <span className="sm:hidden">CSV</span>
      </a>
      <a href={jsonUrl} className={secondaryBtn}>
        <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="hidden sm:inline">{ve.downloadJson}</span>
        <span className="sm:hidden">JSON</span>
      </a>
    </div>
  );
}
