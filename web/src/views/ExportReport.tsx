
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReport } from '@/context/useReport';
import AlertBanner from '@/components/AlertBanner';
import { buildAuditExportUrl, type PdfExportProfile } from '@/lib/exportAudit';
import { strings } from '@/lib/strings';

const ve = strings.views.exportReport;

function parseProfile(raw: string | null): PdfExportProfile {
  if (raw === 'executive' || raw === 'full' || raw === 'premium') return raw;
  return 'standard';
}

export default function ExportReport() {
  const { selectedReportId, reportList } = useReport();
  const reportId = selectedReportId ?? reportList?.[0]?.id ?? null;
  const [searchParams] = useSearchParams();
  const [previewError, setPreviewError] = useState<string | null>(null);

  const profile = parseProfile(searchParams.get('profile'));
  const branding = searchParams.get('branding') !== 'false';

  const previewUrl = useMemo(
    () => buildAuditExportUrl('pdf', reportId, { inline: true, profile, branding }),
    [reportId, profile, branding],
  );

  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)] print:min-h-0">
      <div className="flex-1 min-h-0 flex flex-col bg-slate-200/80 dark:bg-brand-950 p-3 sm:p-4 print:p-0 print:bg-white">
        {previewError ? (
          <div className="p-6 max-w-xl mx-auto w-full">
            <AlertBanner variant="error">{previewError}</AlertBanner>
          </div>
        ) : (
          <iframe
            key={previewUrl}
            title={ve.previewTitle}
            src={previewUrl}
            className="w-full flex-1 min-h-[480px] border-0 rounded-xl shadow-lg bg-white print:rounded-none print:shadow-none"
            onLoad={() => setPreviewError(null)}
            onError={() => setPreviewError(ve.previewError)}
          />
        )}
      </div>
    </div>
  );
}
