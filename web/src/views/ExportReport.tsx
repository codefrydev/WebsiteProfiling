'use client';

import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useReport } from '@/context/useReport';
import { buildAuditExportUrl } from '@/lib/exportAudit';
import { strings } from '@/lib/strings';

const ve = strings.views.exportReport;

export default function ExportReport() {
  const { selectedReportId, reportList } = useReport();
  const reportId = selectedReportId ?? reportList?.[0]?.id ?? null;
  const [previewError, setPreviewError] = useState<string | null>(null);

  const previewUrl = buildAuditExportUrl('html', reportId, { inline: true });
  const pdfUrl = buildAuditExportUrl('pdf', reportId);
  const csvUrl = buildAuditExportUrl('csv', reportId);
  const jsonUrl = buildAuditExportUrl('json', reportId);

  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)] print:min-h-0">
      <div className="shrink-0 px-5 pt-4 pb-4 sm:px-6 lg:px-8 lg:pt-5 border-b border-default print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">{ve.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={pdfUrl}
              download
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              <Download className="h-4 w-4" />
              {ve.downloadPdf}
            </a>
            <a
              href={csvUrl}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-default text-foreground hover:bg-brand-700/80 transition-colors"
            >
              <FileText className="h-4 w-4" />
              {ve.downloadCsv}
            </a>
            <a
              href={jsonUrl}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-default text-foreground hover:bg-brand-700/80 transition-colors"
            >
              <FileText className="h-4 w-4" />
              {ve.downloadJson}
            </a>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-slate-200/80 dark:bg-zinc-200 p-3 sm:p-4 print:p-0 print:bg-white">
        {previewError ? (
          <p className="p-6 text-red-700 text-sm bg-white rounded-xl">{previewError}</p>
        ) : (
          <iframe
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
