
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
    <div className="rounded-lg border border-default bg-surface-muted/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Code2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-sm text-foreground" title={block.filename}>
            {block.filename}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-default px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-brand-700/80"
          >
            {block.previewable ? 'Preview' : 'View'}
          </button>
          <a
            href={href}
            download={block.filename}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
