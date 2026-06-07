'use client';

import { Download, FileText } from 'lucide-react';
import { apiUrl, getPublicBasePath } from '@/lib/publicBase';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';

type FileDownloadBlock = Extract<ChatBlock, { type: 'file_download' }>;

function resolveHref(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/')) return `${getPublicBasePath()}${url}`;
  return apiUrl(url.replace(/^\//, ''));
}

function formatLabel(filename: string, mimeType?: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'Download PDF';
  if (lower.endsWith('.csv')) return 'Download CSV';
  if (lower.endsWith('.json')) return 'Download JSON';
  if (lower.endsWith('.html')) return 'Download HTML';
  if (mimeType?.includes('pdf')) return 'Download PDF';
  if (mimeType?.includes('csv')) return 'Download CSV';
  return 'Download file';
}

export default function ChatFileDownloadBlock({ block }: { block: FileDownloadBlock }) {
  return (
    <div className="rounded-lg border border-default bg-surface-muted/60 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Export ready</p>
      <div className="flex flex-wrap gap-2">
        {block.files.map((file) => {
          const href = resolveHref(file.url);
          const isPdf = file.filename.toLowerCase().endsWith('.pdf') || file.mime_type?.includes('pdf');
          return (
            <a
              key={`${file.filename}-${href}`}
              href={href}
              download={file.filename}
              className={
                isPdf
                  ? 'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors'
                  : 'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-default text-foreground hover:bg-brand-700/80 transition-colors'
              }
            >
              {isPdf ? <Download className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              {file.label || formatLabel(file.filename, file.mime_type)}
            </a>
          );
        })}
      </div>
    </div>
  );
}
