
import { useState } from 'react';
import { X } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { resolveHref } from './ChatFileDownloadBlock';

type Block = Extract<ChatBlock, { type: 'code_artifact' }>;

function languageFor(mimeType: string | undefined): string {
  if (mimeType === 'application/json') return 'json';
  if (mimeType === 'text/html') return 'html';
  if (mimeType === 'image/svg+xml') return 'xml';
  return 'text';
}

export default function ChatArtifactDrawer({ block, onClose }: { block: Block; onClose: () => void }) {
  const [tab, setTab] = useState<'preview' | 'code'>(block.previewable ? 'preview' : 'code');
  const [copied, setCopied] = useState(false);
  const href = resolveHref(block.downloadUrl);

  const copy = () => {
    void navigator.clipboard.writeText(block.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={block.filename}
    >
      <button type="button" className="flex-1 bg-black/40" onClick={onClose} aria-label="Close preview" />
      <div className="flex h-full w-full max-w-3xl flex-col border-l border-default bg-brand-800 shadow-xl fade-in">
        <div className="flex shrink-0 items-center gap-2 border-b border-default px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-bright" title={block.filename}>
            {block.filename}
          </span>
          {block.previewable ? (
            <div className="flex shrink-0 gap-1" role="tablist" aria-label="Artifact view">
              {(['preview', 'code'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    tab === t
                      ? 'bg-brand-700 text-bright shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'preview' ? 'Preview' : 'Code'}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-brand-700 hover:text-bright"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <a
            href={href}
            download={block.filename}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-brand-700 hover:text-bright"
          >
            Download
          </a>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 hover:bg-brand-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {tab === 'preview' && block.previewable ? (
            <iframe
              title={block.filename}
              srcDoc={block.content}
              sandbox="allow-scripts"
              className="h-full w-full border-0 bg-white"
            />
          ) : (
            <SyntaxHighlighter
              language={languageFor(block.mimeType)}
              style={oneDark}
              customStyle={{ margin: 0, height: '100%', fontSize: '0.8125rem' }}
            >
              {block.content}
            </SyntaxHighlighter>
          )}
        </div>
      </div>
    </div>
  );
}
