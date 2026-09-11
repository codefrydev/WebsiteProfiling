
import { useState } from 'react';
import { Code2, Download } from 'lucide-react';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { resolveHref } from './ChatFileDownloadBlock';
import ChatArtifactDrawer from './ChatArtifactDrawer';

type Block = Extract<ChatBlock, { type: 'code_artifact' }>;

export default function ChatCodeArtifactBlock({ block }: { block: Block }) {
  const [open, setOpen] = useState(false);
  const href = resolveHref(block.downloadUrl);

  return (
    <div className="rounded-lg border border-md-sys-outline-variant/40 bg-surface-muted/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Code2 className="h-4 w-4 shrink-0 text-md-sys-on-surface-variant" aria-hidden />
          <span className="truncate text-sm text-md-sys-on-surface" title={block.filename}>
            {block.filename}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-md-sys-outline-variant/40 px-3 py-1.5 text-sm font-medium text-md-sys-on-surface transition-colors hover:bg-md-sys-surface-container-high/80"
          >
            {block.previewable ? 'Preview' : 'View'}
          </button>
          <a
            href={href}
            download={block.filename}
            className="press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-md-sys-on-surface-variant transition-all hover:bg-md-sys-surface-container-high hover:text-md-sys-on-surface active:scale-[0.98]"
            aria-label={`Download ${block.filename}`}
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
      </div>
      {open ? <ChatArtifactDrawer block={block} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
